import { moneyOrderHtml } from "./apps/api/dist/templates/labels.js";
import { moneyOrderBreakdown } from "./apps/api/dist/validation/trackingId.js";
import { processTracking } from "./apps/api/dist/services/trackingStatus.js";

const gross = 20000;
const net = moneyOrderBreakdown(gross, "VPL")[0]?.moAmount ?? 0;
const moHtml = moneyOrderHtml([
  {
    mo_number: "MOS26042240058",
    TrackingID: "VPL26030726",
    trackingNumber: "VPL26030726",
    shipmentType: "VPL",
    CollectAmount: String(gross),
    amountRs: net,
    issueDate: "23-04-26",
    consigneeName: "Receiver",
    consigneeAddress: "Addr",
    consigneePhone: "03000000000",
    shipperName: "Sender",
    shipperAddress: "SAddr",
    shipperPhone: "03111111111"
  }
]);

const hasGrossLiteral = moHtml.includes(`>${gross}<`) || moHtml.includes(`>${gross.toFixed(2)}<`) || moHtml.includes(` ${gross} `) || moHtml.includes(` ${gross.toFixed(2)} `);
const hasNet = moHtml.includes(net.toFixed(2));

const deliveredRaw = {
  tracking: {
    history: [
      ["2026-04-20", "09:00", "Booked at booking office Lahore"],
      ["2026-04-21", "11:00", "Dispatch from DMO Lahore to DMO Karachi"],
      ["2026-04-22", "09:00", "Karachi sent out for delivery"],
      ["2026-04-22", "14:00", "Delivered to addressee"]
    ],
    service_type: "VPL"
  },
  collected_amount: gross
};

const returnedRaw = {
  tracking: {
    history: [
      ["2026-04-20", "09:00", "Booked at booking office Lahore"],
      ["2026-04-21", "11:00", "Dispatch from DMO Lahore to DMO Karachi"],
      ["2026-04-22", "09:00", "Karachi sent out for delivery"],
      ["2026-04-23", "16:30", "Delivered to sender"]
    ],
    service_type: "VPL"
  },
  collected_amount: gross
};

const noTrackingRaw = { tracking: { history: [] }, collected_amount: gross };

const delivered = processTracking(deliveredRaw, { explicitMo: "MOS26042240058", trackingNumber: "VPL26030726" });
const returned = processTracking(returnedRaw, { explicitMo: "MOS26042240058", trackingNumber: "VPL26030726" });
const noTracking = processTracking(noTrackingRaw, { explicitMo: "MOS26042240058", trackingNumber: "VPL26030726" });

console.log(JSON.stringify({
  moneyOrderProof: {
    gross,
    expectedNet: net,
    htmlHasExpectedNet: hasNet,
    htmlHasGrossLiteral: hasGrossLiteral
  },
  mosEligibilityProof: {
    delivered: {
      status: delivered.status,
      systemStatus: delivered.systemStatus,
      moneyOrderLinkEligible: delivered.moneyOrderLinkEligible,
      moIssued: delivered.moIssued
    },
    returned: {
      status: returned.status,
      systemStatus: returned.systemStatus,
      moneyOrderLinkEligible: returned.moneyOrderLinkEligible,
      moIssued: returned.moIssued
    },
    noTracking: {
      status: noTracking.status,
      systemStatus: noTracking.systemStatus,
      moneyOrderLinkEligible: noTracking.moneyOrderLinkEligible,
      moIssued: noTracking.moIssued
    }
  }
}, null, 2));
