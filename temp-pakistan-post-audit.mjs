import fs from "node:fs/promises";
import path from "node:path";
import { prepareLabelOrders } from "./apps/api/dist/services/labelDocument.js";
import { moneyOrderHtml, renderLabelDocumentHtml } from "./apps/api/dist/templates/labels.js";
import {
	buildMoneyOrderNumber,
	moneyOrderBreakdown,
	shouldApplyPakistanPostValuePayableRules,
	validateMoneyOrderNumber,
	validateTrackingId,
} from "./apps/api/dist/validation/trackingId.js";

const OUTPUT_DIR = path.resolve("storage/outputs/pp-audit");
const ISSUE_DATE = new Date("2026-04-01T00:00:00Z");

function makeOrder(overrides = {}) {
	return {
		shipperName: "Sender Benchmark",
		shipperPhone: "03119990001",
		shipperAddress: "Benchmark Road, Karachi",
		shipperEmail: "sender@example.com",
		senderCity: "Karachi",
		consigneeName: "Receiver Benchmark",
		consigneeEmail: "receiver@example.com",
		consigneePhone: "03009990001",
		consigneeAddress: "Benchmark Street, Lahore",
		receiverCity: "Lahore",
		CollectAmount: "0",
		ordered: "ORDER-001",
		ProductDescription: "Demo Product",
		Weight: "500",
		shipmenttype: "PAR",
		numberOfPieces: "1",
		TrackingID: "",
		...overrides,
	};
}

function buildScenario({
	name,
	orders,
	carrierType = "pakistan_post",
	shipmentType = null,
	autoGenerateTracking = false,
	includeMoneyOrders = true,
	outputMode = "labels",
}) {
	const prepared = prepareLabelOrders(orders, {
		autoGenerateTracking,
		barcodeMode: autoGenerateTracking ? "auto" : "manual",
		trackingScheme: "standard",
		carrierType,
		shipmentType,
		outputMode,
	});

	let moneyOrderSequence = 1;
	const moneyOrderEligible = prepared.filter((order) =>
		shouldApplyPakistanPostValuePayableRules(order.carrierType, order.shipmentType ?? order.shipmenttype),
	);

	const labelOrders = prepared.map((order) => {
		const shipmentKind = order.shipmentType ?? order.shipmenttype;
		const moneyOrderNumbers = shouldApplyPakistanPostValuePayableRules(order.carrierType, shipmentKind)
			? moneyOrderBreakdown(Number(order.CollectAmount ?? 0), shipmentKind).map(() => buildMoneyOrderNumber(moneyOrderSequence++, ISSUE_DATE))
			: [];
		return { ...order, moneyOrderNumbers };
	});

	const printableMoneyOrders = labelOrders.flatMap((order) => {
		const shipmentKind = order.shipmentType ?? order.shipmenttype;
		if (!shouldApplyPakistanPostValuePayableRules(order.carrierType, shipmentKind)) {
			return [];
		}
		const trackingNumber = String(order.trackingNumber ?? order.TrackingID ?? "").trim();
		return moneyOrderBreakdown(Number(order.CollectAmount ?? 0), shipmentKind).map((line, index) => ({
			...order,
			TrackingID: trackingNumber,
			trackingNumber,
			amount: String(line.moAmount),
			amountRs: line.moAmount,
			mo_number: order.moneyOrderNumbers[index],
			moneyOrderNumbers: [order.moneyOrderNumbers[index]],
			issueDate: "01-04-26",
		}));
	});

	return {
		name,
		carrierType,
		prepared,
		labelOrders,
		moneyOrderEligible,
		printableMoneyOrders,
		labelHtml: renderLabelDocumentHtml(labelOrders, {
			autoGenerateTracking,
			includeMoneyOrders,
			outputMode,
		}),
		moneyHtml: includeMoneyOrders && printableMoneyOrders.length > 0 ? moneyOrderHtml(printableMoneyOrders) : "",
	};
}

function sumMoneyOrderAmounts(printableMoneyOrders) {
	return printableMoneyOrders.reduce((sum, order) => sum + Number(order.amountRs ?? 0), 0);
}

function hasSingleBarcodeTrackingUnit(labelHtml, trackingId) {
	const escapedTracking = trackingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`<div class="barcode-wrap">[\\s\\S]*?<div class="tracking-line">${escapedTracking}<\\/div>[\\s\\S]*?<\\/div>`).test(labelHtml);
}

function noMosOnLabel(labelHtml) {
	return !/MOS:/i.test(labelHtml) && !/mos-line/i.test(labelHtml);
}

async function writeScenarioArtifacts(scenario) {
	const base = path.join(OUTPUT_DIR, scenario.name);
	await fs.writeFile(`${base}-label.html`, scenario.labelHtml, "utf8");
	if (scenario.moneyHtml) {
		await fs.writeFile(`${base}-money-order.html`, scenario.moneyHtml, "utf8");
	}
}

async function main() {
	await fs.mkdir(OUTPUT_DIR, { recursive: true });

	const scenarios = {
		vplUnder: buildScenario({
			name: "01-vpl-under-20000",
			shipmentType: "VPL",
			orders: [makeOrder({ TrackingID: "VPL26040001", shipmenttype: "VPL", CollectAmount: "1500" })],
		}),
		vppUnder: buildScenario({
			name: "02-vpp-under-20000",
			shipmentType: "VPP",
			orders: [makeOrder({ TrackingID: "VPL26040002", shipmenttype: "VPP", CollectAmount: "2700" })],
		}),
		cod: buildScenario({
			name: "03-cod",
			shipmentType: "COD",
			orders: [makeOrder({ TrackingID: "VPL26040003", shipmenttype: "COD", CollectAmount: "3200" })],
		}),
		vplSplit: buildScenario({
			name: "04-vpl-over-20000",
			shipmentType: "VPL",
			orders: [makeOrder({ TrackingID: "VPL26040004", shipmenttype: "VPL", CollectAmount: "45000" })],
		}),
		uploadPreserved: buildScenario({
			name: "05-upload-tracking-preserved",
			shipmentType: "VPL",
			autoGenerateTracking: true,
			orders: [makeOrder({ TrackingID: "VPL26040005", shipmenttype: "VPL", CollectAmount: "12000" })],
		}),
		autoGenerated: buildScenario({
			name: "06-auto-generated-tracking",
			shipmentType: "VPL",
			autoGenerateTracking: true,
			orders: [makeOrder({ TrackingID: "", shipmenttype: "VPL", CollectAmount: "8000" })],
		}),
		multiBatch: buildScenario({
			name: "07-multi-record-batch",
			shipmentType: null,
			orders: [
				makeOrder({ TrackingID: "VPL26040010", shipmenttype: "VPL", CollectAmount: "1500", ordered: "ORDER-10" }),
				makeOrder({ TrackingID: "VPL26040011", shipmenttype: "VPP", CollectAmount: "2700", ordered: "ORDER-11" }),
				makeOrder({ TrackingID: "VPL26040012", shipmenttype: "COD", CollectAmount: "3200", ordered: "ORDER-12" }),
				makeOrder({ TrackingID: "VPL26040013", shipmenttype: "PAR", CollectAmount: "0", ordered: "ORDER-13" }),
				makeOrder({ TrackingID: "VPL26040014", shipmenttype: "RL", CollectAmount: "0", ordered: "ORDER-14" }),
			],
		}),
		courierShield: buildScenario({
			name: "08-courier-scope-shield",
			carrierType: "courier",
			shipmentType: "COD",
			orders: [makeOrder({ TrackingID: "VPL26040020", shipmenttype: "COD", CollectAmount: "3200" })],
			includeMoneyOrders: false,
		}),
	};

	await Promise.all(Object.values(scenarios).map(writeScenarioArtifacts));

	const vplUnderTracking = scenarios.vplUnder.prepared[0].trackingNumber;
	const vplUnderMos = scenarios.vplUnder.labelOrders[0].moneyOrderNumbers;
	const vppUnderTracking = scenarios.vppUnder.prepared[0].trackingNumber;
	const codTracking = scenarios.cod.prepared[0].trackingNumber;
	const splitTracking = scenarios.vplSplit.prepared[0].trackingNumber;
	const splitMos = scenarios.vplSplit.labelOrders[0].moneyOrderNumbers;
	const autoTracking = scenarios.autoGenerated.prepared[0].trackingNumber;

	const checks = [
		{
			name: "Scope restriction: courier shipment bypasses Pakistan Post amount rules",
			pass:
				!/Gross Amount|MO Commission|MO Amount/.test(scenarios.courierShield.labelHtml) &&
				scenarios.courierShield.printableMoneyOrders.length === 0,
		},
		{
			name: "VPL calculation: label shows MO amount, commission, and gross correctly",
			pass:
				scenarios.vplUnder.labelHtml.includes("MO Amount") &&
				scenarios.vplUnder.labelHtml.includes("Rs. 1500") &&
				scenarios.vplUnder.labelHtml.includes("MO Commission") &&
				scenarios.vplUnder.labelHtml.includes("Rs. 75") &&
				scenarios.vplUnder.labelHtml.includes("Gross Amount") &&
				scenarios.vplUnder.labelHtml.includes("Rs. 1575"),
		},
		{
			name: "VPP calculation: commission applies and money order stores MO amount only",
			pass:
				scenarios.vppUnder.labelHtml.includes("Rs. 2700") &&
				scenarios.vppUnder.labelHtml.includes("Rs. 75") &&
				scenarios.vppUnder.labelHtml.includes("Gross Amount") &&
				scenarios.vppUnder.labelHtml.includes("Rs. 2775") &&
				/>2700\.00</.test(scenarios.vppUnder.moneyHtml) &&
				!/>2775\.00</.test(scenarios.vppUnder.moneyHtml),
		},
		{
			name: "COD calculation: label shows gross only and money order has no commission math",
			pass:
				scenarios.cod.labelHtml.includes("Gross Amount") &&
				scenarios.cod.labelHtml.includes("Rs. 3200") &&
				!scenarios.cod.labelHtml.includes("MO Commission") &&
				!scenarios.cod.labelHtml.includes("MO Amount") &&
				/>3200\.00</.test(scenarios.cod.moneyHtml),
		},
		{
			name: "Label display: MOS never appears on labels and barcode plus tracking stay in one unit",
			pass:
				Object.values(scenarios).every((scenario) => noMosOnLabel(scenario.labelHtml)) &&
				hasSingleBarcodeTrackingUnit(scenarios.vplUnder.labelHtml, vplUnderTracking) &&
				hasSingleBarcodeTrackingUnit(scenarios.cod.labelHtml, codTracking),
		},
		{
			name: "Money order display: money order shows only MO amount and keeps tracking separate from MOS",
			pass:
				scenarios.vplUnder.moneyHtml.includes(`font-size:4.28mm;">${vplUnderTracking}<`) &&
				scenarios.vplUnder.moneyHtml.includes(`font-size:3.73mm;">${vplUnderMos[0]}<`) &&
				!scenarios.vplUnder.moneyHtml.includes("MO Commission"),
		},
		{
			name: "Tracking integrity: uploaded tracking IDs are preserved exactly and auto-generated IDs are reused consistently",
			pass:
				scenarios.uploadPreserved.prepared[0].trackingNumber === "VPL26040005" &&
				scenarios.uploadPreserved.printableMoneyOrders.every((order) => order.trackingNumber === "VPL26040005") &&
				validateTrackingId(autoTracking).ok &&
				scenarios.autoGenerated.printableMoneyOrders.every((order) => order.trackingNumber === autoTracking),
		},
		{
			name: "High amount handling: >20000 splits into multiple MOS with one shared tracking ID",
			pass:
				splitMos.length === 3 &&
				new Set(splitMos).size === 3 &&
				splitMos.every((value) => validateMoneyOrderNumber(value).ok) &&
				scenarios.vplSplit.printableMoneyOrders.every((order) => order.trackingNumber === splitTracking) &&
				sumMoneyOrderAmounts(scenarios.vplSplit.printableMoneyOrders) === 45000,
		},
		{
			name: "Format rules: all tracking and MOS identifiers follow strict YYMM format",
			pass:
				Object.values(scenarios).flatMap((scenario) => scenario.prepared.map((order) => order.trackingNumber)).every((value) => validateTrackingId(value).ok) &&
				Object.values(scenarios)
					.flatMap((scenario) => scenario.labelOrders.flatMap((order) => order.moneyOrderNumbers ?? []))
					.every((value) => validateMoneyOrderNumber(value).ok),
		},
		{
			name: "Money order readability: sender fields use the larger preserved layout styles",
			pass:
				scenarios.vplUnder.moneyHtml.includes('font-size:4.95mm;line-height:1.08;">Sender Benchmark</div>') &&
				scenarios.vplUnder.moneyHtml.includes('font-size:3.35mm;white-space:normal;line-height:1.12;">Benchmark Road, Karachi</div>') &&
				scenarios.vplUnder.moneyHtml.includes('font-size:4.35mm;line-height:1.06;">03119990001</div>'),
		},
		{
			name: "Tracking module contract: issued values resolve from money-order rows and missing MO remains null",
			pass:
				sumMoneyOrderAmounts(scenarios.vplUnder.printableMoneyOrders) === 1500 &&
				sumMoneyOrderAmounts(scenarios.cod.printableMoneyOrders) === 3200 &&
				scenarios.multiBatch.labelOrders.filter((order) => (order.moneyOrderNumbers ?? []).length > 0).length === 3 &&
				scenarios.courierShield.labelOrders[0].moneyOrderNumbers.length === 0,
		},
		{
			name: "Multi-record batch: mixed shipment types keep per-order rules without cross-contamination",
			pass:
				(scenarios.multiBatch.labelHtml.match(/class="label-core"/g) ?? []).length === 5 &&
				scenarios.multiBatch.labelHtml.includes("ORDER-10") &&
				scenarios.multiBatch.labelHtml.includes("ORDER-14") &&
				noMosOnLabel(scenarios.multiBatch.labelHtml),
		},
	];

	const report = {
		generatedAt: new Date().toISOString(),
		outputDir: OUTPUT_DIR,
		scenarios: Object.fromEntries(
			Object.entries(scenarios).map(([key, scenario]) => [key, {
				trackingIds: scenario.prepared.map((order) => order.trackingNumber),
				moneyOrderNumbers: scenario.labelOrders.flatMap((order) => order.moneyOrderNumbers ?? []),
			}]),
		),
		checks,
		allPassed: checks.every((check) => check.pass),
	};

	await fs.writeFile(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");
	console.log(JSON.stringify(report, null, 2));

	if (!report.allPassed) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
