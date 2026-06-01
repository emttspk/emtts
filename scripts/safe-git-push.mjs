import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync, execSync } from "node:child_process";

const ROOT = process.cwd();
const IDENTITY_PATH = path.join(ROOT, ".ai-project", "PROJECT_IDENTITY.json");

const FORBIDDEN_PATTERNS = [
  /^\.env$/i,
  /^\.env\./i,
  /^\.ai-project\/private\//i,
  /^docs\/private\//i,
  /^docs\/internal\//i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /railway-secrets/i,
  /cloudflare-secrets/i,
  /^EP Gateway\//i
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

function changedFiles() {
  const out = run("git status --porcelain");
  if (!out) return [];

  return out
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .map((file) => (file.includes("->") ? file.split("->").pop().trim() : file))
    .filter(Boolean);
}

function askApproval(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const verifyResult = spawnSync("node", ["scripts/verify-project-scope.mjs"], { stdio: "inherit" });
if (verifyResult.status !== 0) {
  process.exit(verifyResult.status ?? 1);
}

if (!fs.existsSync(IDENTITY_PATH)) {
  fail("Missing .ai-project/PROJECT_IDENTITY.json");
}

const identity = JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf8"));
const expectedRemote = String(identity.expectedGitRemote || "").trim();
const expectedBranch = String(identity.expectedGitBranch || "").trim();

const remote = run("git remote get-url origin");
const branch = run("git branch --show-current");
const statusSummary = run("git status --short");
const files = changedFiles();

console.log("--- Push Safety Summary ---");
console.log(`Remote: ${remote}`);
console.log(`Branch: ${branch}`);
console.log("Git Status:");
console.log(statusSummary || "(clean)");
console.log("Changed files:");
if (files.length === 0) {
  console.log("(none)");
} else {
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

if (remote !== expectedRemote) {
  fail(`Remote mismatch. Expected ${expectedRemote} but found ${remote}`);
}

if (branch !== expectedBranch) {
  fail(`Branch mismatch. Expected ${expectedBranch} but found ${branch}`);
}

const forbidden = files.filter((file) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(file)));
if (forbidden.length > 0) {
  fail(`Protected/secret file(s) detected: ${forbidden.join(", ")}`);
}

if (!process.stdin.isTTY) {
  fail("Interactive approval required. Re-run this command in an interactive terminal.");
}

const answer = String(await askApproval(`Approve push to origin/${expectedBranch}? Type YES to continue: `)).trim();
if (answer !== "YES") {
  fail("Push canceled. Explicit approval not provided.");
}

const push = spawnSync("git", ["push", "origin", expectedBranch], { stdio: "inherit" });
if (push.status !== 0) {
  fail("git push failed");
}

console.log(`PASS: Pushed safely to origin/${expectedBranch}`);