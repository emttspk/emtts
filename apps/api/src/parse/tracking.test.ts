import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import xlsx from "xlsx";
import { parseTrackingUploadRowsFromFile } from "./tracking.js";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

async function withWorkbook(rows: unknown[], run: (filePath: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tracking-parser-test-"));
  const filePath = path.join(dir, "tracking-upload.xlsx");
  const workbook = xlsx.utils.book_new();
  const worksheet = Array.isArray(rows[0])
    ? xlsx.utils.aoa_to_sheet(rows as unknown[][])
    : xlsx.utils.json_to_sheet(rows as Record<string, unknown>[]);

  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  xlsx.writeFile(workbook, filePath);

  try {
    await run(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function expectReject(action: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, pattern);
    return true;
  });
}

const tests: TestCase[] = [
  {
    name: "parses valid tracking ids and preserves canonical row mapping",
    async run() {
      await withWorkbook(
        [
          {
            TrackingID: " VPL26050001 ",
            shipperName: "Sender One",
            consigneeName: "Receiver One",
            CollectAmount: "550",
          },
          {
            TrackingID: "COD26050002",
            shipperName: "Sender Two",
            consigneeName: "Receiver Two",
            CollectAmount: "900",
          },
        ],
        async (filePath) => {
          const parsed = await parseTrackingUploadRowsFromFile(filePath);
          assert.deepEqual(parsed.trackingNumbers, ["VPL26050001", "COD26050002"]);
          assert.equal(parsed.rowsByTracking.get("VPL26050001")?.TrackingID, "VPL26050001");
          assert.equal(parsed.rowsByTracking.get("VPL26050001")?.shipperName, "Sender One");
          assert.equal(parsed.rowsByTracking.get("COD26050002")?.CollectAmount, "900");
        },
      );
    },
  },
  {
    name: "deduplicates repeated tracking ids in uploaded rows",
    async run() {
      await withWorkbook(
        [
          { TrackingID: "VPL26050001", shipperName: "First Sender" },
          { TrackingID: "VPL26050001", shipperName: "Duplicate Sender" },
          { TrackingID: "VPP26050003", shipperName: "Third Sender" },
        ],
        async (filePath) => {
          const parsed = await parseTrackingUploadRowsFromFile(filePath);
          assert.deepEqual(parsed.trackingNumbers, ["VPL26050001", "VPP26050003"]);
          assert.equal(parsed.rowsByTracking.size, 2);
          assert.equal(parsed.rowsByTracking.get("VPL26050001")?.shipperName, "First Sender");
        },
      );
    },
  },
  {
    name: "accepts header aliases for tracking number fields",
    async run() {
      await withWorkbook(
        [
          { "Tracking Number": "COD26050004", senderName: "Alias Sender" },
        ],
        async (filePath) => {
          const parsed = await parseTrackingUploadRowsFromFile(filePath);
          assert.deepEqual(parsed.trackingNumbers, ["COD26050004"]);
          assert.equal(parsed.rowsByTracking.get("COD26050004")?.shipperName, "Alias Sender");
        },
      );
    },
  },
  {
    name: "accepts valid non-VPL prefixes under relaxed upload validation rules",
    async run() {
      await withWorkbook(
        [
          { TrackingID: "PAR26050008", shipperName: "Parcel Sender" },
          { TrackingID: "RGL26050009", shipperName: "Registered Sender" },
          { TrackingID: "UMS26050010", shipperName: "Urgent Sender" },
        ],
        async (filePath) => {
          const parsed = await parseTrackingUploadRowsFromFile(filePath);
          assert.deepEqual(parsed.trackingNumbers, ["PAR26050008", "RGL26050009", "UMS26050010"]);
          assert.equal(parsed.rowsByTracking.size, 3);
        },
      );
    },
  },
  {
    name: "rejects invalid tracking ids with row details",
    async run() {
      await withWorkbook(
        [
          { TrackingID: "bad-tracking-id" },
        ],
        async (filePath) => {
          await expectReject(
            () => parseTrackingUploadRowsFromFile(filePath),
            /Tracking upload validation failed\. Row 2: trackingId must match/i,
          );
        },
      );
    },
  },
  {
    name: "rejects mixed valid and invalid rows instead of silently dropping invalid input",
    async run() {
      await withWorkbook(
        [
          { TrackingID: "VPL26050005" },
          { TrackingID: "not-a-valid-id" },
          { TrackingID: "COD26050006" },
        ],
        async (filePath) => {
          await expectReject(
            () => parseTrackingUploadRowsFromFile(filePath),
            /Row 3: trackingId must match/i,
          );
        },
      );
    },
  },
  {
    name: "returns an empty parse result for uploads with no rows",
    async run() {
      await withWorkbook([], async (filePath) => {
        const parsed = await parseTrackingUploadRowsFromFile(filePath);
        assert.deepEqual(parsed.trackingNumbers, []);
        assert.equal(parsed.rowsByTracking.size, 0);
      });
    },
  },
  {
    name: "falls back to the upload matrix when no tracking column header exists",
    async run() {
      const header = Array.from({ length: 17 }, (_, index) => `Column ${index + 1}`);
      const row = Array.from({ length: 17 }, () => "");
      row[16] = "VPL26050007";

      await withWorkbook([header, row], async (filePath) => {
        const parsed = await parseTrackingUploadRowsFromFile(filePath);
        assert.deepEqual(parsed.trackingNumbers, ["VPL26050007"]);
      });
    },
  },
];

let failed = false;

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS tracking parser: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL tracking parser: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`tracking parser tests passed: ${tests.length}`);
}