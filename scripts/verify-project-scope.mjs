import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const IDENTITY_PATH = path.join(ROOT, ".ai-project", "PROJECT_IDENTITY.json");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const REQUIRED_SIGNATURE = "EPOST_PK_LABEL_GENERATOR__MAIN__PROTECTED_SCOPE";

const FORBIDDEN_PATTERNS = [
  /^\.env$/i,
  /^\.env\.local$/i,
  /^\.env\.production$/i,
  /^\.env\.railway$/i,
  /^\.env\.cloudflare$/i,
  /^\.ai-project\/private\//i,
  /^docs\/private\//i,
  /^docs\/internal\//i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /(^|\/)private.*\.(md|txt|doc|docx|pdf)$/i,
  /^EP Gateway\//i,
  /\.pem$/i,
  /\.key$/i
];

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function getChangedFiles() {
  const out = run("git status --porcelain");
  if (!out) return [];

  return out
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .map((file) => {
      if (file.includes("->")) {
        return file.split("->").pop().trim();
      }
      return file;
    })
    .filter(Boolean);
}

if (!fs.existsSync(IDENTITY_PATH)) {
  fail(`Missing identity file: ${IDENTITY_PATH}`);
}

if (!fs.existsSync(PACKAGE_PATH)) {
  fail(`Missing package.json at ${PACKAGE_PATH}`);
}

let identity;
try {
  identity = JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf8"));
} catch (error) {
  fail(`Invalid PROJECT_IDENTITY.json: ${error.message}`);
}

const expectedRemote = String(identity.expectedGitRemote || "").trim();
const expectedBranch = String(identity.expectedGitBranch || "").trim();
const signature = String(identity.signature || "").trim();

if (!expectedRemote) {
  fail("expectedGitRemote is empty in PROJECT_IDENTITY.json");
}

if (!expectedBranch) {
  fail("expectedGitBranch is empty in PROJECT_IDENTITY.json");
}

if (!signature) {
  fail("signature is missing in PROJECT_IDENTITY.json");
}

if (signature !== REQUIRED_SIGNATURE) {
  fail(`Signature mismatch. Expected ${REQUIRED_SIGNATURE} but found ${signature}`);
}

let currentRemote = "";
let currentBranch = "";

try {
  currentRemote = run("git remote get-url origin");
} catch {
  fail("Unable to read git remote origin");
}

try {
  currentBranch = run("git branch --show-current");
} catch {
  fail("Unable to read current git branch");
}

if (currentRemote !== expectedRemote) {
  fail(`Git remote mismatch. Expected ${expectedRemote} but found ${currentRemote}`);
}

if (currentBranch !== expectedBranch) {
  fail(`Git branch mismatch. Expected ${expectedBranch} but found ${currentBranch}`);
}

const changedFiles = getChangedFiles();
const forbidden = changedFiles.filter((file) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(file)));

if (forbidden.length > 0) {
  fail(`Forbidden file(s) detected in working tree: ${forbidden.join(", ")}`);
}

console.log("PASS: Project scope verified.");
console.log(`PASS: Signature ${signature}`);
console.log(`PASS: Remote ${currentRemote}`);
console.log(`PASS: Branch ${currentBranch}`);
console.log(`PASS: Forbidden file scan clean (${changedFiles.length} changed file(s) inspected).`);