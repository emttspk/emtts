#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, "test-results", "final-stabilization");

const pdfFiles = [
  "mo-4.pdf",
  "mo-10.pdf",
  "universal-vpp.pdf",
  "universal-cod.pdf",
];

async function renderFirstPage(pdfPath, outPngPath) {
  const pdfBytes = await fs.readFile(pdfPath);
  const pdfBase64 = pdfBytes.toString("base64");

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1800, height: 2400 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;background:#f5f5f5;display:flex;justify-content:center;"><canvas id="pdf-canvas"></canvas></body></html>`,
      { waitUntil: "networkidle2", timeout: 60000 },
    );

    await page.evaluate(async (base64) => {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 2.0 });
      const canvas = document.getElementById("pdf-canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await firstPage.render({ canvasContext: ctx, viewport }).promise;
    }, pdfBase64);

    const canvas = await page.$("#pdf-canvas");
    if (!canvas) throw new Error("Canvas not found after PDF render");
    await canvas.screenshot({ path: outPngPath });
  } finally {
    await browser.close();
  }
}

async function main() {
  for (const pdfName of pdfFiles) {
    const pdfPath = path.join(IN_DIR, pdfName);
    const pngPath = path.join(IN_DIR, pdfName.replace(/\.pdf$/i, ".png"));
    await renderFirstPage(pdfPath, pngPath);
    console.log(`PNG_PREVIEW=${pngPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
