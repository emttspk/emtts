import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";

type ProcessedShape = {
  systemStatus: string;
  resolvedDeliveryOffice: string;
};

type TrackingEventRecord = {
  trackingId: string;
  eventTime: string;
  eventCity: string;
  eventDescription: string;
  eventType: string;
  officeType: string;
  eventOrder: number;
};

type DerivedMetrics = {
  totalDeliveryTimeHours: number | null;
  dmoToDmoTime: number | null;
  lastMileTime: number | null;
  returnTime: number | null;
  deliveryAttempts: number;
  delayFlag: "YES" | "NO";
};

let tablesReady = false;

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseEventDateTime(date: string, time: string): string {
  const parsed = new Date(`${date} ${time}`);
  return Number.isNaN(parsed.getTime()) ? `${date} ${time}`.trim() : parsed.toISOString();
}

function cityFromDetail(detail: string): string {
  const cleaned = txt(detail).replace(/\(BagID:.*?\)/gi, "").trim();
  const m = cleaned.match(/^([A-Za-z][A-Za-z\s.-]*?)\s+(dispatch|dispatched|received|sent|delivered|arrival|arrived|booked|undelivered|return)/i);
  if (m?.[1]) return txt(m[1]).toUpperCase();
  const words = cleaned.match(/[A-Za-z]+/g) ?? [];
  return (words.at(0) ?? "-").toUpperCase();
}

function normalizeEventType(detail: string): string {
  const t = txt(detail).toLowerCase();
  if (t.includes("return to sender") || t.includes("returned to sender")) return "RETURNED";
  if (t.includes("return")) return "RETURN_IN_PROCESS";
  if (t.includes("undelivered") || t.includes("refused") || t.includes("deposit") || t.includes("not found")) return "FAILED_DELIVERY";
  if (t.includes("delivered") && !t.includes("undelivered")) return "DELIVERED";
  if (t.includes("sent out for delivery") || t.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (t.includes("arrived at delivery office") || t.includes("arrival at delivery office") || t.includes("received at delivery office")) return "ARRIVED_DELIVERY_OFFICE";
  if (t.includes("arrived at dmo") || t.includes("arrival at dmo")) return "ARRIVED_DMO";
  if (t.includes("dispatch from dmo") || t.includes("dispatch from district mail office") || t.includes("dispatched from dmo")) return "DISPATCH_DMO";
  if (t.includes("received at dmo")) return "RECEIVED_DMO";
  if (t.includes("booked at")) return "BOOKED";
  return "RECEIVED_DMO";
}

function normalizeOfficeType(detail: string): string {
  const t = txt(detail).toLowerCase();
  if (t.includes("dmo") || t.includes("district mail office")) return "DMO";
  if (t.includes("delivery office")) return "DELIVERY_OFFICE";
  if (t.includes("booked at")) return "BOOKING";
  return "BOOKING";
}

function extractEvents(rawData: unknown, trackingId: string): TrackingEventRecord[] {
  if (!rawData || typeof rawData !== "object") return [];
  const top = rawData as Record<string, unknown>;
  const tracking = (top.tracking && typeof top.tracking === "object" ? top.tracking : top) as Record<string, unknown>;
  const history = tracking.history;
  if (!Array.isArray(history)) return [];

  const events: TrackingEventRecord[] = [];
  history.forEach((item, index) => {
    let date = "";
    let time = "";
    let detail = "";
    if (Array.isArray(item)) {
      date = txt(item[0]);
      time = txt(item[1]);
      detail = txt(item[2]);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      date = txt(o.date ?? o.latest_date);
      time = txt(o.time ?? o.latest_time);
      detail = txt(o.status ?? o.detail ?? o.description);
    }
    if (!detail) return;
    events.push({
      trackingId,
      eventTime: parseEventDateTime(date, time),
      eventCity: cityFromDetail(detail),
      eventDescription: detail,
      eventType: normalizeEventType(detail),
      officeType: normalizeOfficeType(detail),
      eventOrder: index,
    });
  });

  return events;
}

function toServiceType(trackingId: string): string {
  const m = trackingId.toUpperCase().match(/^[A-Z]+/);
  return m?.[0] ?? "-";
}

function toDateOnlyIso(input: string): string | null {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function hoursBetween(a: string, b: string): number | null {
  const ad = new Date(a);
  const bd = new Date(b);
  if (Number.isNaN(ad.getTime()) || Number.isNaN(bd.getTime())) return null;
  return (bd.getTime() - ad.getTime()) / (1000 * 60 * 60);
}

function computeMetrics(events: TrackingEventRecord[], systemStatus: string): DerivedMetrics {
  const sorted = [...events].sort((a, b) => {
    const at = new Date(a.eventTime).getTime();
    const bt = new Date(b.eventTime).getTime();
    if (Number.isNaN(at) || Number.isNaN(bt)) return a.eventOrder - b.eventOrder;
    return at - bt;
  });

  const first = sorted[0]?.eventTime ?? null;
  const delivered = sorted.find((e) => e.eventType === "DELIVERED")?.eventTime ?? null;
  const firstDispatch = sorted.find((e) => e.eventType === "DISPATCH_DMO")?.eventTime ?? null;
  const firstArrivedDeliveryOffice = sorted.find((e) => e.eventType === "ARRIVED_DELIVERY_OFFICE")?.eventTime ?? null;
  const firstReturn = sorted.find((e) => e.eventType === "RETURN_IN_PROCESS" || e.eventType === "FAILED_DELIVERY")?.eventTime ?? null;
  const finalReturned = [...sorted].reverse().find((e) => e.eventType === "RETURNED")?.eventTime ?? null;

  const totalDeliveryTimeHours = first && delivered ? hoursBetween(first, delivered) : null;
  const dmoToDmoTime = firstDispatch && firstArrivedDeliveryOffice ? hoursBetween(firstDispatch, firstArrivedDeliveryOffice) : null;
  const lastMileTime = firstArrivedDeliveryOffice && delivered ? hoursBetween(firstArrivedDeliveryOffice, delivered) : null;
  const returnTime = firstReturn && finalReturned ? hoursBetween(firstReturn, finalReturned) : null;
  const deliveryAttempts = sorted.filter((e) => e.eventType === "OUT_FOR_DELIVERY").length;

  let delayFlag: "YES" | "NO" = "NO";
  if (typeof totalDeliveryTimeHours === "number" && totalDeliveryTimeHours >= 72) delayFlag = "YES";
  const s = txt(systemStatus).toUpperCase();
  if (["PENDING_72H", "CRITICAL_DELAY", "HELD_AT_RLO"].includes(s)) delayFlag = "YES";

  return {
    totalDeliveryTimeHours,
    dmoToDmoTime,
    lastMileTime,
    returnTime,
    deliveryAttempts,
    delayFlag,
  };
}

function toReason(desc: string): string {
  const t = txt(desc).toLowerCase();
  if (t.includes("refused")) return "refused";
  if (t.includes("deposit")) return "deposit";
  if (t.includes("not found")) return "not found";
  if (t.includes("undelivered")) return "undelivered";
  return "other";
}

async function ensureIntelligenceTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tracking_core_intelligence (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tracking_id TEXT NOT NULL,
      service_type TEXT,
      booking_date TEXT,
      origin_city TEXT,
      destination_city TEXT,
      booking_office TEXT,
      delivery_office TEXT,
      current_status TEXT,
      system_status TEXT,
      is_delivered INTEGER NOT NULL DEFAULT 0,
      is_returned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_core_user_tracking ON tracking_core_intelligence(user_id, tracking_id)`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tracking_events_intelligence (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tracking_id TEXT NOT NULL,
      event_time TEXT,
      event_city TEXT,
      event_description TEXT,
      event_type TEXT,
      office_type TEXT,
      bag_id TEXT,
      event_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_events_unique ON tracking_events_intelligence(user_id, tracking_id, event_order, event_time, event_description)`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tracking_derived_metrics_intelligence (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tracking_id TEXT NOT NULL,
      total_delivery_time_hours REAL,
      dmo_to_dmo_time REAL,
      last_mile_time REAL,
      return_time REAL,
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      delay_flag TEXT NOT NULL DEFAULT 'NO',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_metrics_user_tracking ON tracking_derived_metrics_intelligence(user_id, tracking_id)`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS route_performance_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, origin_city TEXT, destination_city TEXT, total_shipments INTEGER NOT NULL DEFAULT 0, delivered_count INTEGER NOT NULL DEFAULT 0, returned_count INTEGER NOT NULL DEFAULT 0, avg_delivery_time REAL, delay_rate REAL, success_rate REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS delivery_office_performance_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, delivery_office TEXT, city TEXT, total_parcels INTEGER NOT NULL DEFAULT 0, delivered_count INTEGER NOT NULL DEFAULT 0, returned_count INTEGER NOT NULL DEFAULT 0, avg_last_mile_time REAL, failure_rate REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS failure_reasons_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, reason TEXT, city TEXT, delivery_office TEXT, count INTEGER NOT NULL DEFAULT 0, percentage REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS time_analysis_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, hour_of_day INTEGER, day_of_week INTEGER, delivery_count INTEGER NOT NULL DEFAULT 0, success_rate REAL, avg_delivery_time REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS return_behavior_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, city TEXT, return_rate REAL, avg_return_days REAL, common_reason TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS seller_performance_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, total_shipments INTEGER NOT NULL DEFAULT 0, success_rate REAL, return_rate REAL, avg_delivery_time REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS cod_payment_tracking_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tracking_id TEXT NOT NULL, collect_amount REAL, payment_status TEXT, payment_date TEXT, payment_delay_days REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cod_payment_user_tracking ON cod_payment_tracking_intelligence(user_id, tracking_id)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tracking_predictions_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tracking_id TEXT NOT NULL, expected_delivery_time_hours REAL, delay_probability REAL, return_probability REAL, risk_band TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_user_tracking ON tracking_predictions_intelligence(user_id, tracking_id)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS business_dashboard_intelligence (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, best_cities_json TEXT, worst_routes_json TEXT, cod_risk_zones_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  tablesReady = true;
}

export async function persistTrackingIntelligence(input: {
  userId: string;
  trackingNumber: string;
  shipmentStatus: string;
  rawData: unknown;
  processed: ProcessedShape;
}) {
  await ensureIntelligenceTables();
  const userId = txt(input.userId);
  const trackingId = txt(input.trackingNumber).toUpperCase();
  if (!userId || !trackingId) return;

  const top = (input.rawData && typeof input.rawData === "object" ? input.rawData : {}) as Record<string, unknown>;
  const trackingNode = (top.tracking && typeof top.tracking === "object" ? top.tracking : top) as Record<string, unknown>;

  const bookingOffice = txt(trackingNode.booking_office ?? top.booking_office);
  const rawDeliveryOffice = txt(trackingNode.delivery_office ?? top.delivery_office);
  const resolvedDeliveryOffice = txt(input.processed.resolvedDeliveryOffice || rawDeliveryOffice || "-");
  const firstDateRaw = txt(trackingNode.first_date ?? top.first_date);
  const bookingDate = firstDateRaw ? toDateOnlyIso(firstDateRaw) : null;
  const originCity = cityFromDetail(bookingOffice || firstDateRaw || trackingId);
  const destinationCity = cityFromDetail(resolvedDeliveryOffice || rawDeliveryOffice || "-");
  const serviceType = toServiceType(trackingId);
  const currentStatus = txt(input.shipmentStatus || "-").toUpperCase();
  const systemStatus = txt(input.processed.systemStatus || "-").toUpperCase();
  const isDelivered = systemStatus === "DELIVERED" || currentStatus === "DELIVERED";
  const isReturned = systemStatus.startsWith("RETURN") || currentStatus === "RETURN";

  const events = extractEvents(input.rawData, trackingId);
  const metrics = computeMetrics(events, systemStatus);
  const coreId = `${userId}:${trackingId}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO tracking_core_intelligence
       (id, user_id, tracking_id, service_type, booking_date, origin_city, destination_city, booking_office, delivery_office, current_status, system_status, is_delivered, is_returned, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         service_type=excluded.service_type,
         booking_date=excluded.booking_date,
         origin_city=excluded.origin_city,
         destination_city=excluded.destination_city,
         booking_office=excluded.booking_office,
         delivery_office=excluded.delivery_office,
         current_status=excluded.current_status,
         system_status=excluded.system_status,
         is_delivered=excluded.is_delivered,
         is_returned=excluded.is_returned,
         updated_at=CURRENT_TIMESTAMP`,
      coreId, userId, trackingId, serviceType, bookingDate, originCity, destinationCity,
      bookingOffice || "-", resolvedDeliveryOffice || "-", currentStatus || "-", systemStatus || "-",
      isDelivered ? 1 : 0, isReturned ? 1 : 0,
    );

    await tx.$executeRawUnsafe(`DELETE FROM tracking_events_intelligence WHERE user_id = ? AND tracking_id = ?`, userId, trackingId);
    for (const ev of events) {
      await tx.$executeRawUnsafe(
        `INSERT INTO tracking_events_intelligence
         (id, user_id, tracking_id, event_time, event_city, event_description, event_type, office_type, bag_id, event_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(), userId, trackingId, ev.eventTime, ev.eventCity || "-", ev.eventDescription, ev.eventType, ev.officeType, null, ev.eventOrder,
      );
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO tracking_derived_metrics_intelligence
       (id, user_id, tracking_id, total_delivery_time_hours, dmo_to_dmo_time, last_mile_time, return_time, delivery_attempts, delay_flag, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         total_delivery_time_hours=excluded.total_delivery_time_hours,
         dmo_to_dmo_time=excluded.dmo_to_dmo_time,
         last_mile_time=excluded.last_mile_time,
         return_time=excluded.return_time,
         delivery_attempts=excluded.delivery_attempts,
         delay_flag=excluded.delay_flag,
         updated_at=CURRENT_TIMESTAMP`,
      coreId, userId, trackingId, metrics.totalDeliveryTimeHours, metrics.dmoToDmoTime, metrics.lastMileTime, metrics.returnTime, metrics.deliveryAttempts, metrics.delayFlag,
    );

    const collectAmount = num((top as any)?.CollectAmount ?? (trackingNode as any)?.CollectAmount);
    const paymentStatus =
      systemStatus === "DELIVERED" && serviceType.startsWith("V")
        ? "PAYMENT_PROCESSING"
        : systemStatus.startsWith("RETURN")
          ? "PAYMENT_STOPPED"
          : "PENDING";
    await tx.$executeRawUnsafe(
      `INSERT INTO cod_payment_tracking_intelligence
       (id, user_id, tracking_id, collect_amount, payment_status, payment_date, payment_delay_days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         collect_amount=excluded.collect_amount,
         payment_status=excluded.payment_status,
         payment_date=excluded.payment_date,
         payment_delay_days=excluded.payment_delay_days,
         updated_at=CURRENT_TIMESTAMP`,
      coreId, userId, trackingId, collectAmount, paymentStatus, null, null,
    );
  });
}

export async function refreshTrackingIntelligenceAggregates(userIdInput: string) {
  await ensureIntelligenceTables();
  const userId = txt(userIdInput);
  if (!userId) return;

  const core = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM tracking_core_intelligence WHERE user_id = ?`, userId);
  const metrics = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM tracking_derived_metrics_intelligence WHERE user_id = ?`, userId);
  const events = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM tracking_events_intelligence WHERE user_id = ?`, userId);

  const metricByTracking = new Map<string, any>();
  metrics.forEach((m) => metricByTracking.set(String(m.tracking_id), m));

  const routeMap = new Map<string, any>();
  const officeMap = new Map<string, any>();
  const timeMap = new Map<string, any>();
  const returnCityMap = new Map<string, any>();

  for (const c of core) {
    const trackingId = String(c.tracking_id);
    const m = metricByTracking.get(trackingId) ?? {};
    const origin = txt(c.origin_city || "-");
    const destination = txt(c.destination_city || "-");
    const deliveryOffice = txt(c.delivery_office || "-");
    const routeKey = `${origin}|${destination}`;
    const officeKey = `${deliveryOffice}|${destination}`;

    const route = routeMap.get(routeKey) ?? { originCity: origin, destinationCity: destination, total: 0, delivered: 0, returned: 0, delay: 0, deliveryTimes: [] as number[] };
    route.total += 1;
    if (Number(c.is_delivered) === 1) route.delivered += 1;
    if (Number(c.is_returned) === 1) route.returned += 1;
    if (txt(m.delay_flag).toUpperCase() === "YES") route.delay += 1;
    if (Number.isFinite(Number(m.total_delivery_time_hours))) route.deliveryTimes.push(Number(m.total_delivery_time_hours));
    routeMap.set(routeKey, route);

    const office = officeMap.get(officeKey) ?? { deliveryOffice, city: destination, total: 0, delivered: 0, returned: 0, failed: 0, lastMileTimes: [] as number[] };
    office.total += 1;
    if (Number(c.is_delivered) === 1) office.delivered += 1;
    if (Number(c.is_returned) === 1) office.returned += 1;
    if (Number.isFinite(Number(m.last_mile_time))) office.lastMileTimes.push(Number(m.last_mile_time));
    officeMap.set(officeKey, office);
  }

  for (const e of events) {
    const eventType = txt(e.event_type).toUpperCase();
    const dt = new Date(String(e.event_time));
    if (!Number.isNaN(dt.getTime())) {
      const key = `${dt.getUTCHours()}|${dt.getUTCDay()}`;
      const bucket = timeMap.get(key) ?? { hour: dt.getUTCHours(), day: dt.getUTCDay(), total: 0, delivered: 0 };
      bucket.total += 1;
      if (eventType === "DELIVERED") bucket.delivered += 1;
      timeMap.set(key, bucket);
    }
  }

  const byTrackingEvents = new Map<string, Array<any>>();
  for (const e of events) {
    const t = txt(e.tracking_id);
    const list = byTrackingEvents.get(t) ?? [];
    list.push(e);
    byTrackingEvents.set(t, list);
  }

  for (const c of core) {
    const city = txt(c.destination_city || "-");
    const bucket = returnCityMap.get(city) ?? { city, total: 0, returned: 0, returnDays: [] as number[], reasons: new Map<string, number>() };
    bucket.total += 1;
    if (Number(c.is_returned) === 1) {
      bucket.returned += 1;
      const m = metricByTracking.get(String(c.tracking_id));
      if (Number.isFinite(Number(m?.return_time))) bucket.returnDays.push(Number(m.return_time) / 24);
      const rel = byTrackingEvents.get(String(c.tracking_id)) ?? [];
      rel.forEach((ev) => {
        const reason = toReason(String(ev.event_description));
        bucket.reasons.set(reason, (bucket.reasons.get(reason) ?? 0) + 1);
      });
    }
    returnCityMap.set(city, bucket);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM route_performance_intelligence WHERE user_id = ?`, userId);
    await tx.$executeRawUnsafe(`DELETE FROM delivery_office_performance_intelligence WHERE user_id = ?`, userId);
    await tx.$executeRawUnsafe(`DELETE FROM failure_reasons_intelligence WHERE user_id = ?`, userId);
    await tx.$executeRawUnsafe(`DELETE FROM time_analysis_intelligence WHERE user_id = ?`, userId);
    await tx.$executeRawUnsafe(`DELETE FROM return_behavior_intelligence WHERE user_id = ?`, userId);

    for (const r of routeMap.values()) {
      const successRate = r.total > 0 ? (r.delivered / r.total) * 100 : 0;
      const delayRate = r.total > 0 ? (r.delay / r.total) * 100 : 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO route_performance_intelligence
         (id, user_id, origin_city, destination_city, total_shipments, delivered_count, returned_count, avg_delivery_time, delay_rate, success_rate, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, r.originCity, r.destinationCity, r.total, r.delivered, r.returned, avg(r.deliveryTimes), delayRate, successRate,
      );
    }

    for (const o of officeMap.values()) {
      const failureRate = o.total > 0 ? (o.failed / o.total) * 100 : 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO delivery_office_performance_intelligence
         (id, user_id, delivery_office, city, total_parcels, delivered_count, returned_count, avg_last_mile_time, failure_rate, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, o.deliveryOffice, o.city, o.total, o.delivered, o.returned, avg(o.lastMileTimes), failureRate,
      );
    }

    const failureRows = events.filter((e) => txt(e.event_type).toUpperCase() === "FAILED_DELIVERY");
    const totalFailures = failureRows.length || 1;
    const reasonMap = new Map<string, { reason: string; city: string; deliveryOffice: string; count: number }>();
    failureRows.forEach((f) => {
      const reason = toReason(String(f.event_description));
      const city = txt(f.event_city || "-");
      const deliveryOffice = txt(f.event_city || "-");
      const key = `${reason}|${city}|${deliveryOffice}`;
      const row = reasonMap.get(key) ?? { reason, city, deliveryOffice, count: 0 };
      row.count += 1;
      reasonMap.set(key, row);
    });
    for (const r of reasonMap.values()) {
      await tx.$executeRawUnsafe(
        `INSERT INTO failure_reasons_intelligence
         (id, user_id, reason, city, delivery_office, count, percentage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, r.reason, r.city, r.deliveryOffice, r.count, (r.count / totalFailures) * 100,
      );
    }

    for (const t of timeMap.values()) {
      const successRate = t.total > 0 ? (t.delivered / t.total) * 100 : 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO time_analysis_intelligence
         (id, user_id, hour_of_day, day_of_week, delivery_count, success_rate, avg_delivery_time, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, t.hour, t.day, t.delivered, successRate, null,
      );
    }

    for (const b of returnCityMap.values()) {
      let commonReason = "other";
      let maxCount = -1;
      for (const [reason, count] of b.reasons.entries()) {
        if (count > maxCount) {
          commonReason = reason;
          maxCount = count;
        }
      }
      const returnRate = b.total > 0 ? (b.returned / b.total) * 100 : 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO return_behavior_intelligence
         (id, user_id, city, return_rate, avg_return_days, common_reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, b.city, returnRate, avg(b.returnDays), commonReason,
      );
    }
  });

  await refreshPredictionAndBusinessLayer(userId);
}

async function refreshPredictionAndBusinessLayer(userId: string) {
  const core = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM tracking_core_intelligence WHERE user_id = ?`, userId);
  const metrics = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM tracking_derived_metrics_intelligence WHERE user_id = ?`, userId);
  const routes = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM route_performance_intelligence WHERE user_id = ?`, userId);
  const returnBehavior = await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM return_behavior_intelligence WHERE user_id = ?`, userId);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const metricMap = new Map(metrics.map((m) => [String(m.tracking_id), m]));
  const routeMap = new Map(routes.map((r) => [`${txt(r.origin_city)}|${txt(r.destination_city)}`, r]));
  const sellerAvg = avg(metrics.map((m) => Number(m.total_delivery_time_hours)).filter((v) => Number.isFinite(v)) as number[]) ?? 0;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM tracking_predictions_intelligence WHERE user_id = ?`, userId);
    for (const c of core) {
      const route = routeMap.get(`${txt(c.origin_city)}|${txt(c.destination_city)}`);
      const expectedDelivery = route ? Number(route.avg_delivery_time ?? sellerAvg) : sellerAvg;
      const delayProb = Math.min(0.95, Math.max(0.05, Number(route?.delay_rate ?? 20) / 100));
      const returnProb = Math.min(0.95, Math.max(0.01, Number(route?.returned_count ?? 0) / Math.max(1, Number(route?.total_shipments ?? 1))));
      const riskBand = delayProb >= 0.6 || returnProb >= 0.6 ? "HIGH" : delayProb >= 0.3 || returnProb >= 0.3 ? "MEDIUM" : "LOW";
      await tx.$executeRawUnsafe(
        `INSERT INTO tracking_predictions_intelligence
         (id, user_id, tracking_id, expected_delivery_time_hours, delay_probability, return_probability, risk_band, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        randomUUID(), userId, txt(c.tracking_id), expectedDelivery, delayProb, returnProb, riskBand,
      );
      const m = metricMap.get(txt(c.tracking_id));
      if (m && !Number.isFinite(Number(m.total_delivery_time_hours))) {
        // keep reference for future predictive calibration
      }
    }

    const bestCities = [...routes]
      .sort((a, b) => Number(b.success_rate ?? 0) - Number(a.success_rate ?? 0))
      .slice(0, 5)
      .map((r) => ({ city: txt(r.destination_city), successRate: Number(r.success_rate ?? 0), shipments: Number(r.total_shipments ?? 0) }));
    const worstRoutes = [...routes]
      .sort((a, b) => Number(b.delay_rate ?? 0) - Number(a.delay_rate ?? 0))
      .slice(0, 5)
      .map((r) => ({ origin: txt(r.origin_city), destination: txt(r.destination_city), delayRate: Number(r.delay_rate ?? 0), shipments: Number(r.total_shipments ?? 0) }));
    const codRiskZones = [...returnBehavior]
      .sort((a, b) => Number(b.return_rate ?? 0) - Number(a.return_rate ?? 0))
      .slice(0, 5)
      .map((r) => ({ city: txt(r.city), returnRate: Number(r.return_rate ?? 0) }));

    await tx.$executeRawUnsafe(
      `INSERT INTO business_dashboard_intelligence
       (id, user_id, best_cities_json, worst_routes_json, cod_risk_zones_json, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         best_cities_json=excluded.best_cities_json,
         worst_routes_json=excluded.worst_routes_json,
         cod_risk_zones_json=excluded.cod_risk_zones_json,
         updated_at=CURRENT_TIMESTAMP`,
      userId, userId, JSON.stringify(bestCities), JSON.stringify(worstRoutes), JSON.stringify(codRiskZones),
    );
  });
}
