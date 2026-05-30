import { BASE_POSTAGE_RATE_CARD_V1 } from "./cards/base-postage.v1.js";
import { REGISTRATION_FEE_RATE_CARD_V1 } from "./cards/registration-fee.v1.js";
import { VALUE_PAYABLE_FEE_RATE_CARD_V1 } from "./cards/value-payable-fee.v1.js";
import { INSURANCE_FEE_RATE_CARD_V1 } from "./cards/insurance-fee.v1.js";
import type {
  ArticleCategory,
  BasePostageRateCard,
  BasePostageSlabRule,
  FixedFeeRateCard,
  FixedFeeRule,
  PostalProduct,
  RouteType,
  UmsIncrementalRule,
} from "./types.js";

export type BasePostageResolution = {
  amount: number;
  chargeableWeightGrams: number;
  matchedLabel: string;
  matchedRule: BasePostageSlabRule | UmsIncrementalRule;
  matchedRateCardCode: string;
};

const BASE_POSTAGE_CARDS = [BASE_POSTAGE_RATE_CARD_V1];
const REGISTRATION_FEE_CARDS = [REGISTRATION_FEE_RATE_CARD_V1];
const VALUE_PAYABLE_FEE_CARDS = [VALUE_PAYABLE_FEE_RATE_CARD_V1];
const INSURANCE_FEE_CARDS = [INSURANCE_FEE_RATE_CARD_V1];

function isCardActive(card: { isActive: boolean; effectiveFrom: string; effectiveTo: string | null }, atIsoDate: string): boolean {
  if (!card.isActive) return false;
  if (card.effectiveFrom > atIsoDate) return false;
  if (card.effectiveTo && card.effectiveTo < atIsoDate) return false;
  return true;
}

function productMatches(allowed: Array<PostalProduct | "*">, product: PostalProduct): boolean {
  return allowed.includes("*") || allowed.includes(product);
}

function categoryMatches(allowed: Array<ArticleCategory | "*">, category: ArticleCategory): boolean {
  return allowed.includes("*") || allowed.includes(category);
}

export function getActiveRateCards(date = new Date()) {
  const atIsoDate = date.toISOString().slice(0, 10);
  return {
    basePostageCards: BASE_POSTAGE_CARDS.filter((card) => isCardActive(card, atIsoDate)),
    registrationFeeCards: REGISTRATION_FEE_CARDS.filter((card) => isCardActive(card, atIsoDate)),
    valuePayableFeeCards: VALUE_PAYABLE_FEE_CARDS.filter((card) => isCardActive(card, atIsoDate)),
    insuranceFeeCards: INSURANCE_FEE_CARDS.filter((card) => isCardActive(card, atIsoDate)),
  };
}

export function resolveBasePostage(input: {
  category: ArticleCategory;
  postalProduct: PostalProduct;
  weightGrams: number;
  routeType: RouteType;
  cards?: BasePostageRateCard[];
}): BasePostageResolution | null {
  const cards = input.cards ?? getActiveRateCards().basePostageCards;

  for (const card of cards) {
    if (input.category === "UMS") {
      const umsRule = card.umsRules.find(
        (rule) => rule.routeType === input.routeType && productMatches(rule.postalProducts, input.postalProduct),
      );
      if (!umsRule) continue;

      if (input.weightGrams <= 250) {
        return {
          amount: umsRule.upTo250Amount,
          chargeableWeightGrams: 250,
          matchedLabel: `${umsRule.label} up to 250g`,
          matchedRule: umsRule,
          matchedRateCardCode: card.rateCardCode,
        };
      }

      if (input.weightGrams <= 500) {
        return {
          amount: umsRule.upTo500Amount,
          chargeableWeightGrams: 500,
          matchedLabel: `${umsRule.label} up to 500g`,
          matchedRule: umsRule,
          matchedRateCardCode: card.rateCardCode,
        };
      }

      const additionalBlocks = Math.ceil((input.weightGrams - 500) / umsRule.incrementalBlockGrams);
      const chargeableWeightGrams = 500 + (additionalBlocks * umsRule.incrementalBlockGrams);
      return {
        amount: umsRule.upTo500Amount + (additionalBlocks * umsRule.incrementalAmount),
        chargeableWeightGrams,
        matchedLabel: `${umsRule.label} base 500g + ${additionalBlocks} additional 500g block(s)`,
        matchedRule: umsRule,
        matchedRateCardCode: card.rateCardCode,
      };
    }

    const slab = card.slabRules.find(
      (rule) => rule.articleCategory === input.category && rule.maxWeightGrams >= input.weightGrams && productMatches(rule.postalProducts, input.postalProduct),
    );
    if (slab) {
      return {
        amount: slab.amount,
        chargeableWeightGrams: slab.maxWeightGrams,
        matchedLabel: slab.label,
        matchedRule: slab,
        matchedRateCardCode: card.rateCardCode,
      };
    }
  }

  return null;
}

function resolveFixedFee(input: {
  category: ArticleCategory;
  postalProduct: PostalProduct;
  cards: FixedFeeRateCard[];
}): { amount: number; matchedRule: FixedFeeRule; matchedRateCardCode: string } | null {
  for (const card of input.cards) {
    const rule = card.feeRules.find(
      (candidate) => categoryMatches(candidate.articleCategories, input.category) && productMatches(candidate.postalProducts, input.postalProduct),
    );
    if (rule) {
      return { amount: rule.amount, matchedRule: rule, matchedRateCardCode: card.rateCardCode };
    }
  }
  return null;
}

export function resolveRegistrationFee(input: { category: ArticleCategory; postalProduct: PostalProduct; cards?: FixedFeeRateCard[] }) {
  return resolveFixedFee({
    category: input.category,
    postalProduct: input.postalProduct,
    cards: input.cards ?? getActiveRateCards().registrationFeeCards,
  });
}

export function resolveValuePayableFee(input: { category: ArticleCategory; postalProduct: PostalProduct; cards?: FixedFeeRateCard[] }) {
  return resolveFixedFee({
    category: input.category,
    postalProduct: input.postalProduct,
    cards: input.cards ?? getActiveRateCards().valuePayableFeeCards,
  });
}

export function resolveInsuranceFee(input: { category: ArticleCategory; postalProduct: PostalProduct; cards?: FixedFeeRateCard[] }) {
  return resolveFixedFee({
    category: input.category,
    postalProduct: input.postalProduct,
    cards: input.cards ?? getActiveRateCards().insuranceFeeCards,
  });
}
