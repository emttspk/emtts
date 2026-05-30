import Card from "../Card";

export type BookingRecommendationOption =
  | "DROP_AT_COLLECTION_POINT"
  | "PICKUP_TO_HUB_PLANNING"
  | "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";

export type BookingRecommendationOutput = {
  recommendedOption: BookingRecommendationOption;
  eligibility: "recommended" | "review_required" | "not_recommended";
  badges: string[];
  blockers: string[];
  advisoryNotes: string[];
  valuePayableGuard: boolean;
  requestPreviewAllowed: boolean;
};

type OptionMeta = {
  key: BookingRecommendationOption;
  title: string;
  description: string;
};

const OPTION_META: OptionMeta[] = [
  {
    key: "DROP_AT_COLLECTION_POINT",
    title: "Drop At Collection Point",
    description: "Available for Lahore or Sahiwal sender city.",
  },
  {
    key: "PICKUP_TO_HUB_PLANNING",
    title: "Pickup To Hub Planning",
    description: "Courier is planning-only for pickup to hub, not final delivery carrier.",
  },
  {
    key: "DIRECT_COURIER_OR_SELF_DROP_ADVISORY",
    title: "Direct Courier Or Self-Drop Advisory",
    description: "For smaller lots, direct courier or self-drop may be more practical.",
  },
];

export function deriveBookingRecommendation(input: {
  senderCity: string;
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  serviceCodes: string[];
  perArticleWeightsGrams: Array<number | null | undefined>;
}): BookingRecommendationOutput {
  const city = String(input.senderCity ?? "").trim().toLowerCase();
  const totalArticles = Number.isFinite(input.totalArticles) ? Math.max(0, Math.trunc(input.totalArticles)) : 0;
  const weights = (input.perArticleWeightsGrams ?? []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  const avgWeight = weights.length > 0
    ? weights.reduce((sum, value) => sum + value, 0) / weights.length
    : (totalArticles > 0 ? Math.max(0, input.totalActualWeightGrams) / totalArticles : 0);

  const hasOverPhaseLimitArticle = weights.some((weight) => weight > 1000);
  const isDropCity = city === "lahore" || city === "sahiwal";
  const hasValuePayableService = (input.serviceCodes ?? []).some((code) => {
    const normalized = String(code ?? "").trim().toUpperCase();
    return normalized === "VPL" || normalized === "VPP" || normalized === "COD";
  });

  const badges: string[] = [];
  const blockers: string[] = [];
  const advisoryNotes: string[] = [];

  if (avgWeight > 0 && avgWeight < 100) {
    badges.push("LIGHT_SHIPMENT_BEST_FIT");
  }
  if (avgWeight > 0 && avgWeight < 250) {
    badges.push("PK_POST_AGGREGATION_RECOMMENDED");
  }

  let eligibility: BookingRecommendationOutput["eligibility"] = "recommended";
  if (avgWeight >= 250 && avgWeight < 1000) {
    eligibility = "review_required";
    badges.push("REVIEW_REQUIRED");
    advisoryNotes.push("Average article weight is between 250g and 1kg. Review is required.");
  }
  if (hasOverPhaseLimitArticle) {
    eligibility = "not_recommended";
    blockers.push("OVER_PHASE_LIMIT");
    advisoryNotes.push("One or more articles exceed 1kg and are outside current aggregator phase limits.");
  }

  let recommendedOption: BookingRecommendationOption;
  if (isDropCity) {
    recommendedOption = "DROP_AT_COLLECTION_POINT";
    advisoryNotes.push("Sender city is Lahore/Sahiwal so drop-at-collection-point can be used.");
  } else if (totalArticles >= 10) {
    recommendedOption = "PICKUP_TO_HUB_PLANNING";
    advisoryNotes.push("Outside Lahore/Sahiwal with 10 or more articles can use pickup-to-hub planning.");
  } else {
    recommendedOption = "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";
    advisoryNotes.push("For less than 10 articles, direct courier or self-drop may be better.");
    if (eligibility === "recommended") {
      eligibility = "review_required";
    }
  }

  advisoryNotes.push("Bundle weight is planning-only information and not the postage basis.");
  advisoryNotes.push("Postage remains calculated per individual article.");

  if (hasValuePayableService) {
    advisoryNotes.push("Final delivery must remain through Pakistan Post.");
    advisoryNotes.push("Courier, if shown, is pickup-to-hub planning only and not final carrier.");
  }

  return {
    recommendedOption,
    eligibility,
    badges,
    blockers,
    advisoryNotes,
    valuePayableGuard: hasValuePayableService,
    requestPreviewAllowed: blockers.length === 0,
  };
}

export default function BookingOptionSelector(props: {
  recommendation: BookingRecommendationOutput;
  selectedOption: BookingRecommendationOption;
  onSelectOption: (value: BookingRecommendationOption) => void;
}) {
  const { recommendation, selectedOption, onSelectOption } = props;

  return (
    <Card className="border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Phase 2A Recommendation</h3>
      <div className="mt-1 text-xs text-slate-600">
        Eligibility: <span className="font-semibold uppercase">{recommendation.eligibility}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        {OPTION_META.map((option) => {
          const selected = selectedOption === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectOption(option.key)}
              className={[
                "rounded-xl border px-3 py-3 text-left text-xs",
                selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
              ].join(" ")}
            >
              <div className="font-semibold text-slate-900">{option.title}</div>
              <div className="mt-1 text-slate-700">{option.description}</div>
            </button>
          );
        })}
      </div>

      {recommendation.badges.length > 0 ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <div className="font-semibold">Badges</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {recommendation.badges.map((badge) => (
              <span key={badge} className="rounded-full border border-sky-300 bg-white px-2 py-0.5 font-medium">{badge}</span>
            ))}
          </div>
        </div>
      ) : null}

      {recommendation.blockers.length > 0 ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <div className="font-semibold">Blockers</div>
          <div className="mt-1 space-y-1">
            {recommendation.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
        <div className="font-semibold">Advisory Notes</div>
        <div className="mt-1 space-y-1">
          {recommendation.advisoryNotes.map((note) => <div key={note}>{note}</div>)}
        </div>
      </div>
    </Card>
  );
}
