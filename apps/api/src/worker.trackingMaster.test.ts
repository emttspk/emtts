import assert from "node:assert/strict";
import path from "node:path";
import xlsx from "xlsx";

import {
  buildFilteredTrackingMasterRows,
  buildTrackingMasterFileName,
  buildTrackingMasterRows,
  type ResolveOrderShipmentType,
} from "./worker/trackingMaster.js";
import { outputsDir, toStoredPath } from "./storage/paths.js";

type TestCase = {
  name: string;
  run: () => void;
};

const resolveOrderShipmentType: ResolveOrderShipmentType = (order, fallback) => {
  const rowType = String(order.shipmentType ?? order.shipmenttype ?? "").trim().toUpperCase();
  if (rowType) return rowType;
  const fallbackType = String(fallback ?? "").trim().toUpperCase();
  return fallbackType || null;
};

const tests: TestCase[] = [
  {
    name: "builds tracking-master rows when Tracking ID values are present",
    run() {
      const rows = buildTrackingMasterRows(
        "job-master-001",
        [
          {
            trackingNumber: "VPL26050001",
            shipmentType: "VPL",
            carrierType: "pakistan_post",
            CollectAmount: "1500",
            consigneeName: "Receiver One",
            consigneePhone: "03001234567",
            receiverCity: "Karachi",
            ProductDescription: "Shoes",
            Weight: "0.5",
            moneyOrderNumbers: ["MOS05000001"],
          },
        ],
        "VPL",
        resolveOrderShipmentType,
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.["Batch ID"], "job-master-001");
      assert.equal(rows[0]?.["Tracking ID"], "VPL26050001");
      assert.equal(rows[0]?.["Shipment Type"], "VPL");
      assert.equal(rows[0]?.["Current Status"], "BOOKED");
      assert.equal(rows[0]?.["Complaint Status"], "NOT_RAISED");
      assert.equal(rows[0]?.["Settlement Status"], "PENDING");
    },
  },
  {
    name: "filters rows with empty Tracking ID values",
    run() {
      const filtered = buildFilteredTrackingMasterRows(
        "job-master-002",
        [
          {
            trackingNumber: "",
            shipmentType: "VPL",
            carrierType: "pakistan_post",
            CollectAmount: "500",
          },
          {
            trackingNumber: "PAR26050002",
            shipmentType: "PAR",
            carrierType: "pakistan_post",
            CollectAmount: "0",
          },
        ],
        "PAR",
        resolveOrderShipmentType,
      );

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0]?.["Tracking ID"], "PAR26050002");
    },
  },
  {
    name: "keeps filename and stored path naming stable",
    run() {
      const jobId = "job-master-003";
      const fileName = buildTrackingMasterFileName(jobId);
      assert.equal(fileName, "job-master-003-tracking-master.xlsx");

      const absolutePath = path.join(outputsDir(), fileName);
      const storedPath = toStoredPath(absolutePath);
      assert.ok(storedPath.endsWith("job-master-003-tracking-master.xlsx"));
    },
  },
  {
    name: "produces non-empty XLSX content from generated tracking-master rows",
    run() {
      const rows = buildFilteredTrackingMasterRows(
        "job-master-004",
        [
          {
            trackingNumber: "RGL26050011",
            shipmentType: "RGL",
            carrierType: "pakistan_post",
            CollectAmount: "0",
            consigneeName: "Receiver Two",
            consigneePhone: "03111222333",
            receiverCity: "Lahore",
            ProductDescription: "Books",
            Weight: "1",
          },
        ],
        "RGL",
        resolveOrderShipmentType,
      );

      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Tracking Master");
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

      assert.ok(buffer.length > 0);
      assert.equal(rows[0]?.["Tracking ID"], "RGL26050011");
      assert.equal(rows[0]?.["Receiver City"], "Lahore");
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS worker tracking-master: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL worker tracking-master: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`worker tracking-master tests passed: ${tests.length}`);
}
