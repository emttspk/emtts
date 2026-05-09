#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the built functions - use file:// URLs
const labelsPath = pathToFileURL(path.join(__dirname, "apps", "api", "dist", "templates", "labels.js")).href;
const renderPath = pathToFileURL(path.join(__dirname, "apps", "api", "dist", "pdf", "render.js")).href;

const { 
  flyerHtml, 
  moneyOrderHtml 
} = await import(labelsPath);

const {
  htmlToPdfBufferInFreshBrowser
} = await import(renderPath);

// Test data
const testOrders = [
  {
    shipperName: "Test Sender 1",
    shipperEmail: "sender1@test.com",
    shipperAddress: "123 Main Street, Market Area",
    senderCity: "Karachi",
    shipperPhone: "03001234567",
    consigneeName: "Test Receiver 1",
    consigneeEmail: "receiver1@test.com",
    consigneeAddress: "456 Oak Avenue, Block 5",
    receiverCity: "Lahore",
    consigneePhone: "03109876543",
    shipmentType: "VPL",
    carrierType: "pakistan_post",
    CollectAmount: "2500",
    trackingNumber: "PP001001",
    TrackingID: "PP001001",
    Weight: "0.5 kg",
    ordered: "ORDER-001",
    ProductDescription: "Documents",
    numberOfPieces: "1",
    barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  },
  {
    shipperName: "Test Sender 2",
    shipperEmail: "sender2@test.com",
    shipperAddress: "789 Pine Road, Commercial Zone",
    senderCity: "Islamabad",
    shipperPhone: "03201234567",
    consigneeName: "Test Receiver 2",
    consigneeEmail: "receiver2@test.com",
    consigneeAddress: "321 Elm Street, Sector 7",
    receiverCity: "Rawalpindi",
    consigneePhone: "03319876543",
    shipmentType: "VPL",
    carrierType: "pakistan_post",
    CollectAmount: "3500",
    trackingNumber: "PP001002",
    TrackingID: "PP001002",
    Weight: "1.2 kg",
    ordered: "ORDER-002",
    ProductDescription: "Parcels",
    numberOfPieces: "1",
    barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  },
];

const testMoneyOrderData = [
  {
    shipperName: "MO Sender 1",
    shipperPhone: "03001111111",
    shipperAddress: "Address Line 1",
    consigneeName: "MO Receiver 1",
    consigneePhone: "03101111111",
    consigneeAddress: "Receiver Address 1",
    shipmentType: "VPL",
    amount: "5000",
    amountRs: 5000,
    mo_number: "MOS011234567",
    mo_barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  },
  {
    shipperName: "MO Sender 2",
    shipperPhone: "03201111111",
    shipperAddress: "Address Line 2",
    consigneeName: "MO Receiver 2",
    consigneePhone: "03201111111",
    consigneeAddress: "Receiver Address 2",
    shipmentType: "VPL",
    amount: "7500",
    amountRs: 7500,
    mo_number: "MOS012345678",
    mo_barcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  },
];

async function generateTestPDFs() {
  try {
    console.log("[TEST] Starting runtime PDF generation test...");
    
    // Test 1: Generate Flyer PDF
    console.log("[TEST] Generating flyer HTML...");
    const flyerHtmlContent = flyerHtml(testOrders);
    console.log(`[TEST] Flyer HTML size: ${Buffer.byteLength(flyerHtmlContent, "utf8")} bytes`);
    
    console.log("[TEST] Rendering flyer PDF...");
    const flyerPdf = await htmlToPdfBufferInFreshBrowser(flyerHtmlContent, "A4");
    console.log(`[TEST] Flyer PDF size: ${flyerPdf.length} bytes`);
    
    const flyerPath = path.join(__dirname, "forensic-artifacts", "live-flyer-runtime.pdf");
    fs.writeFileSync(flyerPath, flyerPdf);
    console.log(`[TEST] Flyer PDF saved: ${flyerPath}`);
    
    // Test 2: Generate Money Order PDF
    console.log("[TEST] Generating money order HTML...");
    const moHtmlContent = moneyOrderHtml(testMoneyOrderData);
    console.log(`[TEST] Money order HTML size: ${Buffer.byteLength(moHtmlContent, "utf8")} bytes`);
    
    console.log("[TEST] Rendering money order PDF...");
    const moPdf = await htmlToPdfBufferInFreshBrowser(moHtmlContent, "A4");
    console.log(`[TEST] Money order PDF size: ${moPdf.length} bytes`);
    
    const moPath = path.join(__dirname, "forensic-artifacts", "live-money-order-runtime.pdf");
    fs.writeFileSync(moPath, moPdf);
    console.log(`[TEST] Money order PDF saved: ${moPath}`);
    
    console.log("\n[TEST] ✅ SUCCESS - Runtime PDFs generated:");
    console.log(`  Flyer: ${flyerPath} (${flyerPdf.length} bytes)`);
    console.log(`  MO: ${moPath} (${moPdf.length} bytes)`);
    
  } catch (err) {
    console.error("[TEST] ❌ ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

await generateTestPDFs();
