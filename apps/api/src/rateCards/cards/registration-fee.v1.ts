import type { FixedFeeRateCard } from "../types.js";

export const REGISTRATION_FEE_RATE_CARD_V1: FixedFeeRateCard = {
  rateCardCode: "REGISTRATION_FEE_PK_2026_V1",
  title: "Pakistan Post Registration Fee Rate Card",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  version: "v1",
  isActive: true,
  sourceNote: "Known registration fee examples from forensic audit references.",
  feeComponentType: "REGISTRATION_FEE",
  feeRules: [
    {
      ruleType: "FIXED_FEE",
      articleCategories: ["LETTER"],
      postalProducts: ["*"],
      amount: 30,
      label: "Letter registration fee",
    },
    {
      ruleType: "FIXED_FEE",
      articleCategories: ["PARCEL"],
      postalProducts: ["*"],
      amount: 75,
      label: "Parcel registration fee",
    },
  ],
};
