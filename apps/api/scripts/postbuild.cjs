const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputRoots = [
  path.join(rootDir, "dist"),
  path.join(rootDir, "apps", "api", "dist"),
];
const sourceTemplatesDir = path.join(rootDir, "src", "templates");

function copyCompiledEntries(outputDir) {
  const srcDir = path.join(outputDir, "src");
  if (!fs.existsSync(srcDir)) return;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(outputDir, entry.name);
    fs.cpSync(from, to, { recursive: true });
  }
}

function copyTemplateAssets(outputDir) {
  if (!fs.existsSync(sourceTemplatesDir)) return;

  const targetDir = path.join(outputDir, "templates");
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceTemplatesDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".html") continue;
    const from = path.join(sourceTemplatesDir, entry.name);
    const to = path.join(targetDir, entry.name);
    fs.cpSync(from, to, { force: true });
  }
}

for (const outputDir of outputRoots) {
  if (!fs.existsSync(outputDir)) continue;
  copyCompiledEntries(outputDir);
  copyTemplateAssets(outputDir);
}