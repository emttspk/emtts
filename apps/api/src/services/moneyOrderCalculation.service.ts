// Centralized Money Order Calculation Service
// Single source of truth for MO calculations across all modules

export interface MoneyOrderCalculationResult {
  moAmount: number; // Actual money order amount (net)
  commission: number; // Commission amount
  grossAmount: number; // Total to collect (moAmount + commission)
}

/**
 * Calculate commission based on shipment type and amount
 * VPL/VPP: 75 for <= 10,000; 100 for > 10,000
 * ENVELOPE: 75 for <= 10,000; 100 for > 10,000
 * COD: 0 (no commission)
 * Other: 0
 */
export function calculateCommission(amount: number, shipmentType?: string): number {
  const normalized = String(shipmentType ?? "").trim().toUpperCase();
  const baseAmount = Math.max(0, Math.floor(amount));

  // COD and unrecognized types have no commission
  if (!normalized || normalized === "COD" || normalized === "PAR" || normalized === "PARCEL" || normalized === "DOCUMENT") {
    return 0;
  }

  // VPL, VPP, ENVELOPE: standard commission structure
  return baseAmount > 10_000 ? 100 : 75;
}

/**
 * Calculate net money order amount (gross minus commission)
 */
export function calculateNetAmount(grossAmount: number, shipmentType?: string): number {
  const commission = calculateCommission(grossAmount, shipmentType);
  return Math.max(0, grossAmount - commission);
}

/**
 * Comprehensive calculation: from gross collect amount, derive all components
 * Used throughout labels, envelopes, flyers, and money order generation
 */
export function calculateMoneyOrder(grossAmount: number, shipmentType?: string): MoneyOrderCalculationResult {
  const baseAmount = Math.max(0, Math.floor(grossAmount));
  const commission = calculateCommission(baseAmount, shipmentType);
  const moAmount = baseAmount - commission;
  
  return {
    moAmount: Math.max(0, moAmount),
    commission,
    grossAmount: baseAmount,
  };
}
