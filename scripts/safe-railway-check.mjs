import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const IDENTITY_PATH = path.join(ROOT, ".ai-project", "PROJECT_IDENTITY.json");

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function parseField(label, text) {
  const regex = new RegExp(`^${label}\\s*:\\s*(.+)$`, "im");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

if (!fs.existsSync(IDENTITY_PATH)) {
  fail("Missing .ai-project/PROJECT_IDENTITY.json");
}

const identity = JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf8"));
const expectedProjectName = String(identity.expectedRailwayProjectName || "").trim();
const allowedServices = Array.isArray(identity.allowedRailwayServices) ? identity.allowedRailwayServices : [];

console.log("INFO: Running read-only Railway context check.");

const version = run("railway", ["--version"]);
if (version.error || version.status !== 0) {
  fail("Railway CLI not available. Install Railway CLI before running this check.");
}

const status = run("railway", ["status"]);
if (status.error || status.status !== 0) {
  const err = (status.stderr || "").trim() || "Unable to read Railway status.";
  fail(err);
}

const output = `${status.stdout || ""}\n${status.stderr || ""}`.trim();
const activeProject = parseField("Project", output);
const activeService = parseField("Service", output);

console.log(`INFO: Active Railway project: ${activeProject || "(not detected)"}`);
console.log(`INFO: Active Railway service: ${activeService || "(not detected)"}`);

if (expectedProjectName && activeProject && activeProject !== expectedProjectName) {
  fail(`Railway project mismatch. Expected ${expectedProjectName} but found ${activeProject}`);
}

if (activeService && allowedServices.length > 0 && !allowedServices.includes(activeService)) {
  fail(`Railway service mismatch. Active service ${activeService} is not in allowed list: ${allowedServices.join(", ")}`);
}

console.log("PASS: Railway check completed (read-only, no deploy, no variable changes).");