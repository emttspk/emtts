import {
  buildTrackingId,
  buildMoneyOrderNumber,
  validateTrackingId,
  validateMoneyOrderNumber,
  moneyOrderBreakdown,
  reverseMoneyOrderFromGross,
  getTrackingPrefix,
  TRACKING_PREFIX_VPL,
  TRACKING_PREFIX_VPP,
  TRACKING_PREFIX_COD,
  TRACKING_PREFIX_IRL,
  TRACKING_PREFIX_RGL,
  TRACKING_PREFIX_UMS,
  MONEY_ORDER_PREFIX,
  MONEY_ORDER_PREFIX_COD,
} from "./trackingId.js";

describe("Tracking ID Generation", () => {
  describe("Tracking Prefixes", () => {
    test("VPL prefix", () => {
      const result = getTrackingPrefix("VPL");
      expect(result).toBe(TRACKING_PREFIX_VPL);
    });

    test("VPP prefix", () => {
      const result = getTrackingPrefix("VPP");
      expect(result).toBe(TRACKING_PREFIX_VPP);
    });

    test("COD prefix", () => {
      const result = getTrackingPrefix("COD");
      expect(result).toBe(TRACKING_PREFIX_COD);
    });

    test("IRL prefix", () => {
      const result = getTrackingPrefix("IRL");
      expect(result).toBe(TRACKING_PREFIX_IRL);
    });

    test("RGL prefix", () => {
      const result = getTrackingPrefix("RGL");
      expect(result).toBe(TRACKING_PREFIX_RGL);
    });

    test("RL alias to RGL", () => {
      const result = getTrackingPrefix("RL");
      expect(result).toBe(TRACKING_PREFIX_RGL);
    });

    test("UMS prefix", () => {
      const result = getTrackingPrefix("UMS");
      expect(result).toBe(TRACKING_PREFIX_UMS);
    });

    test("Unknown defaults to VPL", () => {
      const result = getTrackingPrefix("UNKNOWN");
      expect(result).toBe(TRACKING_PREFIX_VPL);
    });
  });

  describe("buildTrackingId", () => {
    test("VPL format: VPLMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(1, testDate, "VPL");
      expect(id).toMatch(/^VPL05\d{6,7}$/);
      expect(id).toBe("VPL05000001");
    });

    test("COD format: CODMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(1, testDate, "COD");
      expect(id).toMatch(/^COD05\d{6,7}$/);
      expect(id).toBe("COD05000001");
    });

    test("RGL format: RGLMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(1, testDate, "RGL");
      expect(id).toMatch(/^RGL05\d{6,7}$/);
      expect(id).toBe("RGL05000001");
    });

    test("IRL format: IRLMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(1, testDate, "IRL");
      expect(id).toMatch(/^IRL05\d{6,7}$/);
      expect(id).toBe("IRL05000001");
    });

    test("UMS format: UMSMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(1, testDate, "UMS");
      expect(id).toMatch(/^UMS05\d{6,7}$/);
      expect(id).toBe("UMS05000001");
    });

    test("Sequence overflow: 6-digit to 7-digit", () => {
      const testDate = new Date("2026-05-01");
      const id = buildTrackingId(9999999, testDate, "VPL");
      expect(id).toBe("VPL059999999");
    });

    test("Month formatting: January", () => {
      const testDate = new Date("2026-01-01");
      const id = buildTrackingId(1, testDate, "VPL");
      expect(id).toMatch(/^VPL01\d{6,7}$/);
    });

    test("Month formatting: December", () => {
      const testDate = new Date("2026-12-01");
      const id = buildTrackingId(1, testDate, "VPL");
      expect(id).toMatch(/^VPL12\d{6,7}$/);
    });
  });

  describe("validateTrackingId", () => {
    test("Valid VPL ID", () => {
      const result = validateTrackingId("VPL05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid COD ID", () => {
      const result = validateTrackingId("COD05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid RGL ID", () => {
      const result = validateTrackingId("RGL05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid IRL ID", () => {
      const result = validateTrackingId("IRL05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid UMS ID", () => {
      const result = validateTrackingId("UMS05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid VPP ID", () => {
      const result = validateTrackingId("VPP05000001");
      expect(result.ok).toBe(true);
    });

    test("Invalid prefix", () => {
      const result = validateTrackingId("ABC05000001");
      expect(result.ok).toBe(false);
    });

    test("Invalid month 00", () => {
      const result = validateTrackingId("VPL00000001");
      expect(result.ok).toBe(false);
    });

    test("Invalid month 13", () => {
      const result = validateTrackingId("VPL13000001");
      expect(result.ok).toBe(false);
    });

    test("Missing month", () => {
      const result = validateTrackingId("VPL000001");
      expect(result.ok).toBe(false);
    });
  });
});

describe("Money Order Generation", () => {
  describe("buildMoneyOrderNumber", () => {
    test("MOS format for VPL: MOSMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const mo = buildMoneyOrderNumber(1, testDate, "VPL");
      expect(mo).toMatch(/^MOS05\d{6,7}$/);
      expect(mo).toBe("MOS05000001");
    });

    test("MOS format for VPP: MOSMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const mo = buildMoneyOrderNumber(1, testDate, "VPP");
      expect(mo).toMatch(/^MOS05\d{6,7}$/);
      expect(mo).toBe("MOS05000001");
    });

    test("UMO format for COD: UMOMMXXXXXX", () => {
      const testDate = new Date("2026-05-01");
      const mo = buildMoneyOrderNumber(1, testDate, "COD");
      expect(mo).toMatch(/^UMO05\d{6,7}$/);
      expect(mo).toBe("UMO05000001");
    });

    test("Sequence overflow: 6-digit to 7-digit", () => {
      const testDate = new Date("2026-05-01");
      const mo = buildMoneyOrderNumber(9999999, testDate, "VPL");
      expect(mo).toBe("MOS059999999");
    });
  });

  describe("validateMoneyOrderNumber", () => {
    test("Valid MOS", () => {
      const result = validateMoneyOrderNumber("MOS05000001");
      expect(result.ok).toBe(true);
    });

    test("Valid UMO", () => {
      const result = validateMoneyOrderNumber("UMO05000001");
      expect(result.ok).toBe(true);
    });

    test("Invalid prefix", () => {
      const result = validateMoneyOrderNumber("VPL05000001");
      expect(result.ok).toBe(false);
    });

    test("Invalid month 00", () => {
      const result = validateMoneyOrderNumber("MOS00000001");
      expect(result.ok).toBe(false);
    });

    test("Invalid month 13", () => {
      const result = validateMoneyOrderNumber("MOS13000001");
      expect(result.ok).toBe(false);
    });
  });
});

describe("Money Order Formulas", () => {
  describe("VPL/VPP Commission", () => {
    test("Commission 75 for amount 10000", () => {
      const breakdown = moneyOrderBreakdown(10000, "VPL");
      expect(breakdown[0].commission).toBe(75);
      expect(breakdown[0].moAmount).toBe(10000);
      expect(breakdown[0].grossAmount).toBe(10075);
    });

    test("Commission 100 for amount 10001", () => {
      const breakdown = moneyOrderBreakdown(10001, "VPL");
      expect(breakdown[0].commission).toBe(100);
      expect(breakdown[0].moAmount).toBe(10001);
      expect(breakdown[0].grossAmount).toBe(10101);
    });

    test("Multiple splits with commission", () => {
      const breakdown = moneyOrderBreakdown(25000, "VPL");
      expect(breakdown.length).toBe(2);
      // First block: 20000 with commission 100
      expect(breakdown[0].moAmount).toBe(20000);
      expect(breakdown[0].commission).toBe(100);
      expect(breakdown[0].grossAmount).toBe(20100);
      // Second block: 5000 with commission 75
      expect(breakdown[1].moAmount).toBe(5000);
      expect(breakdown[1].commission).toBe(75);
      expect(breakdown[1].grossAmount).toBe(5075);
    });
  });

  describe("COD Commission", () => {
    test("No commission for COD", () => {
      const breakdown = moneyOrderBreakdown(5000, "COD");
      expect(breakdown[0].commission).toBe(0);
      expect(breakdown[0].moAmount).toBe(5000);
      expect(breakdown[0].grossAmount).toBe(5000);
    });

    test("COD multiple splits", () => {
      const breakdown = moneyOrderBreakdown(25000, "COD");
      expect(breakdown.length).toBe(2);
      expect(breakdown[0].commission).toBe(0);
      expect(breakdown[0].moAmount).toBe(20000);
      expect(breakdown[1].commission).toBe(0);
      expect(breakdown[1].moAmount).toBe(5000);
    });
  });

  describe("Reverse Money Order from Gross", () => {
    test("VPL with gross 10075 returns amount 10000", () => {
      const result = reverseMoneyOrderFromGross(10075, "VPL");
      expect(result.moAmount).toBe(10000);
      expect(result.commission).toBe(75);
      expect(result.grossAmount).toBe(10075);
    });

    test("VPL with gross 10101 returns amount 10001", () => {
      const result = reverseMoneyOrderFromGross(10101, "VPL");
      expect(result.moAmount).toBe(10001);
      expect(result.commission).toBe(100);
      expect(result.grossAmount).toBe(10101);
    });

    test("COD gross equals amount", () => {
      const result = reverseMoneyOrderFromGross(5000, "COD");
      expect(result.moAmount).toBe(5000);
      expect(result.commission).toBe(0);
      expect(result.grossAmount).toBe(5000);
    });
  });
});
