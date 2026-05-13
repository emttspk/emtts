import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"] } } });
const row = await prisma.shipment.findFirst({ where: { trackingNumber: "VPL13172414" } });
if (!row) { console.log("NOT FOUND"); process.exit(0); }
const raw = JSON.parse(row.rawJson ?? "{}");
const tracking = (raw.tracking ?? raw) as Record<string, unknown>;
const events = (tracking.events ?? raw.events ?? tracking.history ?? raw.history ?? []) as unknown[];
console.log(JSON.stringify({ status: raw.final_status ?? row.status, event_count: events.length, events }, null, 2));
await prisma.$disconnect();
