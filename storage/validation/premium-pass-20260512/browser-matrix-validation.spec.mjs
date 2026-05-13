import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const validationDir = path.resolve('storage', 'validation', 'premium-pass-20260512');
const sessionPath = path.join(validationDir, 'live-tracking-session.json');
const previewHtmlPath = path.join(validationDir, 'production-premium-envelope-preview.html');

async function loadSession() {
  return JSON.parse(await fs.readFile(sessionPath, 'utf8'));
}

async function signIn(page) {
  const session = await loadSession();
  await page.goto('https://www.epost.pk/login', { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(session.email);
  await page.getByRole('textbox', { name: /Password/i }).fill(session.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 120000 });
}

test('live tracking workspace renders final compact layout', async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto('https://www.epost.pk/tracking-workspace', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Tracking workspace' })).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Track' }).first()).toBeVisible();
  await expect(page.getByText('ROW', { exact: true })).toHaveCount(0);
  await expect(page.locator('table').getByText('VPL', { exact: true })).toHaveCount(0);
  await expect(page.locator('table tbody tr').first().locator('td').nth(5)).toContainText('CHANGA MANGA TO');
  await expect(page.locator('table tbody tr').first().getByRole('combobox')).toBeVisible();

  await page.screenshot({
    path: path.join(validationDir, `browser-${testInfo.project.name}-tracking.png`),
    fullPage: true,
  });
});

test('production premium envelope preview renders balanced layout', async ({ page }, testInfo) => {
  await page.goto(`file:///${previewHtmlPath.replace(/\\/g, '/')}`);

  await expect(page.getByText('COURIER', { exact: true })).toBeVisible();
  await expect(page.getByText('Rs. 18000', { exact: true })).toBeVisible();
  await expect(page.getByText('Ayesha Khan', { exact: true })).toBeVisible();
  await expect(page.getByText('Muhammad Usman', { exact: true })).toBeVisible();
  await expect(page.getByText('Secure nationwide delivery tracking at')).toBeVisible();

  await page.screenshot({
    path: path.join(validationDir, `browser-${testInfo.project.name}-premium-envelope.png`),
    fullPage: true,
  });
});