export type FeeComponentType = "BASE_POSTAGE" | "REGISTRATION_FEE" | "VALUE_PAYABLE_FEE" | "INSURANCE_FEE";

export type ArticleCategory = "LETTER" | "PRINTED_PAPER" | "TEXT_BOOK" | "PARCEL" | "UMS";

export type PostalProduct = "ORDINARY" | "RGL" | "VPL" | "VPP" | "IRL" | "PAR" | "UMS" | "COD";

export type RouteType = "LOCAL" | "CITY_TO_CITY";

export type RateCardMeta = {
  rateCardCode: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: string;
  isActive: boolean;
  sourceNote: string;
  feeComponentType: FeeComponentType;
};

export type BasePostageSlabRule = {
  ruleType: "SLAB";
  articleCategory: Exclude<ArticleCategory, "UMS">;
  postalProducts: Array<PostalProduct | "*">;
  maxWeightGrams: number;
  amount: number;
  label: string;
};

export type UmsIncrementalRule = {
  ruleType: "UMS_INCREMENTAL";
  articleCategory: "UMS";
  routeType: RouteType;
  postalProducts: Array<PostalProduct | "*">;
  upTo250Amount: number;
  upTo500Amount: number;
  incrementalBlockGrams: number;
  incrementalAmount: number;
  label: string;
};

export type FixedFeeRule = {
  ruleType: "FIXED_FEE";
  articleCategories: Array<ArticleCategory | "*">;
  postalProducts: Array<PostalProduct | "*">;
  amount: number;
  label: string;
};

export type BasePostageRateCard = RateCardMeta & {
  feeComponentType: "BASE_POSTAGE";
  slabRules: BasePostageSlabRule[];
  umsRules: UmsIncrementalRule[];
};

export type FixedFeeRateCard = RateCardMeta & {
  feeComponentType: Exclude<FeeComponentType, "BASE_POSTAGE">;
  feeRules: FixedFeeRule[];
};
