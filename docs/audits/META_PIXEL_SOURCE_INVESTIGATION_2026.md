# Meta Pixel Source Investigation 2026

Date: 2026-06-07

## Scope

This is a read-only investigation into where Meta is receiving `Subscribe` from, given the contradiction between:

- The repository not containing any `Subscribe` Meta event path.
- The active production Pixel ID being consistent in source and production.
- Meta Test Events reportedly showing `PageView` and `Subscribe`.

No app code was changed for this audit.

## What The Repo Shows

Repository search results:

- `Subscribe` and `subscribe` are not present in the application source as a Meta event trigger.
- `fbq("track", "Subscribe")` is not present.
- `fbq("trackCustom", "Subscribe")` is not present.
- No Conversions API implementation was found in the app source.
- No `event_source_url` handling was found in the app source.

Production-facing evidence already established in prior audits:

- Production Pixel ID: `1352565343396370`
- `signals/config` loads successfully for that Pixel ID.
- The active production bundle does not contain a `Subscribe` event path.
- The active production bundle does not contain `test_event_code`.

## Attribution Assessment

### A. Is ePost.pk definitely sending events?

Not proven for the disputed `Subscribe` row.

- The repo does send Meta standard events in code, including `PageView`, `Lead`, `CompleteRegistration`, `Login`, `InitiateCheckout`, and `Purchase`.
- However, the automated production probes previously did not capture a visible `facebook.com/tr` transport request for those events.
- Because of that gap, `Subscribe` cannot be attributed to ePost.pk from the repo alone.

### B. Is Meta showing events from another source?

Yes, that is the most likely explanation.

The strongest explanation is that Meta Test Events is showing a `Subscribe` hit from another browser session, another website, another source attached to the same Pixel ID, or a delayed / previously recorded event.

### C. Is the Pixel ID shared?

Possibly, but not provable from the repository.

The repo and deployed bundle consistently use Pixel ID `1352565343396370`. If Meta is receiving `Subscribe` from elsewhere, the most plausible mechanism is that the same Pixel is also installed on another property or connected to another source.

### D. Is Test Events being interpreted incorrectly?

Very possibly.

Meta Test Events is pixel-wide for the selected Pixel, not automatically scoped to just the current webpage. That means a hit can appear even when it did not come from the currently audited tab.

### E. Most Likely Root Cause

Ranked by confidence:

| Rank | Hypothesis | Confidence | Reason |
|---|---|---:|---|
| 1 | `Subscribe` is coming from another source using the same Pixel ID | 85% | No `Subscribe` path exists in repo or active bundle |
| 2 | Meta Test Events is showing pixel-wide activity, not only the current page | 80% | The UI can surface events from the broader pixel source set |
| 3 | A delayed or previously recorded event is being surfaced in Test Events | 45% | Could explain `Subscribe` appearing despite no code path |
| 4 | ePost.pk is somehow sending `Subscribe` through an unseen browser path | 15% | No supporting repo evidence |
| 5 | The Pixel ID itself is wrong | 10% | Source, bundle, and config all match the same Pixel ID |

## How To Verify Inside Meta Events Manager

Open the `PageView` and `Subscribe` rows in Test Events and check:

- `event_source_url`
- timestamp
- source type
- browser vs server vs partner integration
- pixel ID
- any attached test event code or session marker

Interpretation:

- If `event_source_url` is `https://www.epost.pk/` or another ePost route, the hit likely belongs to this property.
- If `event_source_url` is not an ePost domain, the hit is external or shared-pixel noise.
- If source type is Server or Partner, then a CAPI or partner integration is involved rather than this repo.

## Conclusion

The Pixel ID itself does not look wrong.

The repository does not contain any `Subscribe` emission path, so the `Subscribe` event in Meta is most likely external to this codebase. The next useful step is to inspect the actual Meta event row details and confirm the `event_source_url` and source type.

## Scores

- Source attribution confidence: 78%
- Probability `Subscribe` is external: 85%
- Probability `Subscribe` is internal: 15%
- Meta readiness: 65%
