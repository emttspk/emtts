import { renderLabelDocumentHtml, generateLabelBarcodeBase64, moneyOrderHtml } from "../apps/api/src/templates/labels.ts";
import { htmlToPdfBufferInFreshBrowser } from "../apps/api/src/pdf/render.ts";
import { validateCollectAmountAgainstShipmentType } from "../apps/api/src/validation/trackingId.ts";

const shipmentServices = ["IRL", "UMS", "RGL", "PAR", "VPL", "VPP", "COD"];
const labelModes = ["labels", "universal-9x4", "flyer", "envelope"];
const moneyOrderServices = ["VPL", "VPP", "COD"];

function makeOrder(service, collectAmount) {
  const tracking = `${service}26050001`;
  return {
    shipperName: "Sender",
    shipperAddress: "Street 1",
    senderCity: "Karachi",
    shipperPhone: "03001234567",
    shipperEmail: "sender@example.com",
    consigneeName: "Receiver",
    consigneeAddress: "Street 2",
    receiverCity: "Lahore",
    consigneePhone: "03111234567",
    shipmentType: service,
    shipmenttype: service,
    carrierType: "pakistan_post",
    CollectAmount: String(collectAmount),
    trackingNumber: tracking,
    TrackingID: tracking,
    Weight: "500",
    ordered: "ORD-1",
    ProductDescription: "Product",
    barcodeBase64: generateLabelBarcodeBase64(tracking),
  };
}

function unresolvedTokens(html) {
  return [...new Set(html.match(/\{\{\s*[^{}]+\s*\}\}|\{[a-z_]+\}/gi) ?? [])];
}

async function verifyLabels() {
  const failures = [];

  for (const service of shipmentServices) {
    const collectAmount = moneyOrderServices.includes(service) ? 2500 : 0;
    const order = makeOrder(service, collectAmount);
    for (const mode of labelModes) {
      try {
        const html = renderLabelDocumentHtml([order], {
          outputMode: mode,
          autoGenerateTracking: false,
          includeMoneyOrders: moneyOrderServices.includes(service),
        });
        const unresolved = unresolvedTokens(html);
        if (unresolved.length > 0) {
          failures.push(`${service}/${mode}: unresolved tokens ${unresolved.join(", ")}`);
          continue;
        }
        if (mode === "universal-9x4") {
          const hasMoneyOrderSummary = /MO Amount|Gross Collect Amount/.test(html);
          const shouldShowSummary = moneyOrderServices.includes(service);
          if (shouldShowSummary && !hasMoneyOrderSummary) {
            failures.push(`${service}/${mode}: expected money-order summary block`);
          }
          if (!shouldShowSummary && hasMoneyOrderSummary) {
            failures.push(`${service}/${mode}: payment summary must stay hidden for non-value-payable service`);
          }
        }
        const pdf = await htmlToPdfBufferInFreshBrowser(
          html,
          mode === "envelope" || mode === "universal-9x4" ? "envelope-9x4" : "A4",
        );
        if (pdf.length <= 0) {
          failures.push(`${service}/${mode}: empty PDF buffer`);
        }
      } catch (error) {
        failures.push(`${service}/${mode}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return failures;
}

async function verifyMoneyOrders() {
  const failures = [];

  for (const service of moneyOrderServices) {
    try {
      const moNumber = service === "COD" ? "UMO05000001" : "MOS05000001";
      const html = moneyOrderHtml([
        {
          shipperName: "Sender",
          shipperPhone: "03001234567",
          shipperAddress: "Street 1",
          senderCity: "Karachi",
          consigneeName: "Receiver",
          consigneePhone: "03111234567",
          consigneeAddress: "Street 2",
          shipmentType: service,
          amount: "2500",
          amountRs: 2500,
          mo_number: moNumber,
          mo_barcodeBase64: generateLabelBarcodeBase64(moNumber),
          trackingNumber: `${service}26050001`,
          TrackingID: `${service}26050001`,
        },
      ]);
      const unresolved = unresolvedTokens(html);
      if (unresolved.length > 0) {
        failures.push(`MO/${service}: unresolved tokens ${unresolved.join(", ")}`);
        continue;
      }
      const pdf = await htmlToPdfBufferInFreshBrowser(html, "A4");
      if (pdf.length <= 0) {
        failures.push(`MO/${service}: empty PDF buffer`);
      }
    } catch (error) {
      failures.push(`MO/${service}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}

function verifyContradictions() {
  const failures = [];
  const cases = [
    {
      name: "IRL+amount",
      result: validateCollectAmountAgainstShipmentType("pakistan_post", "IRL", "100"),
      expectSeverity: "error",
    },
    {
      name: "VPL+zero",
      result: validateCollectAmountAgainstShipmentType("pakistan_post", "VPL", "0"),
      expectSeverity: "error",
    },
    {
      name: "PAR+amount",
      result: validateCollectAmountAgainstShipmentType("pakistan_post", "PAR", "250"),
      expectSeverity: "error",
    },
    {
      name: "COD+zero",
      result: validateCollectAmountAgainstShipmentType("pakistan_post", "COD", "0"),
      expectSeverity: "error",
    },
  ];

  for (const testCase of cases) {
    if (!testCase.result || testCase.result.severity !== testCase.expectSeverity) {
      failures.push(`${testCase.name}: expected ${testCase.expectSeverity}, got ${JSON.stringify(testCase.result)}`);
    }
  }

  return failures;
}

const labelFailures = await verifyLabels();
const moneyOrderFailures = await verifyMoneyOrders();
const contradictionFailures = verifyContradictions();
const failures = [...labelFailures, ...moneyOrderFailures, ...contradictionFailures];

if (failures.length > 0) {
  console.error("[phase-3-verify] FAIL");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log("[phase-3-verify] PASS");
console.log(`Verified ${shipmentServices.length * labelModes.length} label combinations, ${moneyOrderServices.length} money-order PDFs, and ${4} contradiction cases.`);