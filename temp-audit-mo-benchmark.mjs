import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const benchmarkPath = path.join(root, "storage", "outputs", "mo-sample-two-records.html");
const generatedPath = path.join(root, "storage", "outputs", "mo-benchmark-check.html");

const benchmark = await fs.readFile(benchmarkPath, "utf8");
const generated = await fs.readFile(generatedPath, "utf8");

function collectFields(html) {
  const rows = [];
  const re = /(<img class="barcode"[^>]*style="([^"]*)"[^>]*>)|(<div class="field ([^"]*)"[^>]*style="([^"]*)"[^>]*>)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      rows.push({ kind: "img.barcode", cls: "barcode", style: m[2] });
    } else {
      rows.push({ kind: "div.field", cls: m[4], style: m[5] });
    }
  }
  return rows;
}

function collectBackgroundStyles(html) {
  const rows = [];
  const re = /<div class="bg" style="([^"]*)"><\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) rows.push(m[1]);
  return rows;
}

const bFields = collectFields(benchmark);
const gFields = collectFields(generated);
const bBg = collectBackgroundStyles(benchmark);
const gBg = collectBackgroundStyles(generated);

const max = Math.max(bFields.length, gFields.length);
const styleAudit = [];
for (let i = 0; i < max; i++) {
  const b = bFields[i];
  const g = gFields[i];
  styleAudit.push({
    index: i + 1,
    expectedKind: b?.kind ?? "MISSING",
    actualKind: g?.kind ?? "MISSING",
    expectedClass: b?.cls ?? "MISSING",
    actualClass: g?.cls ?? "MISSING",
    expectedStyle: b?.style ?? "MISSING",
    actualStyle: g?.style ?? "MISSING",
    kindMatch: !!b && !!g && b.kind === g.kind,
    classMatch: !!b && !!g && b.cls === g.cls,
    styleMatch: !!b && !!g && b.style === g.style,
  });
}

const bgMax = Math.max(bBg.length, gBg.length);
const bgAudit = [];
for (let i = 0; i < bgMax; i++) {
  bgAudit.push({
    index: i + 1,
    expected: bBg[i] ?? "MISSING",
    actual: gBg[i] ?? "MISSING",
    match: (bBg[i] ?? "") === (gBg[i] ?? ""),
  });
}

const mismatches = styleAudit.filter((r) => !(r.kindMatch && r.classMatch && r.styleMatch));
const bgMismatches = bgAudit.filter((r) => !r.match);

console.log(JSON.stringify({
  benchmarkPath,
  generatedPath,
  totalExpectedFields: bFields.length,
  totalActualFields: gFields.length,
  styleMismatchCount: mismatches.length,
  backgroundExpectedCount: bBg.length,
  backgroundActualCount: gBg.length,
  backgroundMismatchCount: bgMismatches.length,
  firstStyleMismatches: mismatches.slice(0, 20),
  firstBackgroundMismatches: bgMismatches.slice(0, 20),
  fullStyleAudit: styleAudit,
  fullBackgroundAudit: bgAudit,
}, null, 2));
