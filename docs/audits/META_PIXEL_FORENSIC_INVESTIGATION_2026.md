# Meta Pixel Forensic Investigation 2026

Date: 2026-06-07

## Scope

Read-only investigation into whether the Meta Pixel ID itself is the cause of the delivery contradiction:

- Production browser probes show `fbq` and standard event calls working.
- No `facebook.com/tr` transport is observed.
- Meta Test Events reportedly shows `PageView` and `Subscribe`.
- This repository does not emit `Subscribe`.

## Pixel ID Evidence

| Evidence Source | Result |
| --- | --- |
| Source code | `apps/web/src/lib/analytics.ts` reads `import.meta.env.VITE_META_PIXEL_ID` |
| Production bundle | Active bundle `/assets/index-IDkLqYdp.js` contains `1352565343396370` |
| Meta script config | Browser loads `https://connect.facebook.net/signals/config/1352565343396370?...domain=www.epost.pk` with HTTP 200 |
| Test event code | No `test_event_code` string found in the active production bundle |
| Subscribe code path | No `Subscribe` string found in the active production bundle |

## Live Production Probe

Fresh browser session opened:

`https://www.epost.pk/?utm_source=meta_forensic&utm_medium=test&utm_campaign=pixel_forensic`

Observed:

- `fbq` type: `function`
- `fbq.loaded`: `true`
- `fbq.queue`: `0`
- `fbq.callMethod`: present
- `fbevents.js`: loaded with HTTP 200
- `signals/config` for Pixel ID `1352565343396370`: loaded with HTTP 200
- `facebook.com/tr`: not observed

## A. Is ePost.pk Definitely Sending Events?

Not proven by network transport.

The site definitely initializes the correct Pixel ID and executes the event calls, but the investigation still did not capture a Meta event transport request leaving the browser. `signals/config` proves the pixel is recognized by Meta for `www.epost.pk`; it does not prove event delivery.

## B. Is Meta Showing Events From Another Source?

Likely for `Subscribe`; possible for `PageView`.

The active production bundle does not contain `Subscribe`, and the repo search did not find a `Subscribe` Meta event path. If Meta Test Events shows `Subscribe`, the most likely source is another browser/session, another website using the same Pixel ID, a server-side source, or delayed display from a prior source.

## C. Is the Pixel ID Shared?

Not confirmable from this workspace.

The repo and production bundle consistently use Pixel ID `1352565343396370`. Whether that Pixel ID is also installed on another website must be verified inside Meta Events Manager by checking the event `event_source_url`, domains, partner/server events, and recent source history.

## D. Is Test Events Being Interpreted Incorrectly?

Possible.

Meta Test Events may show events from any source connected to the selected Pixel, not only the currently open browser tab. Without checking the individual event details, especially `event_source_url`, timestamp, source type, and browser/session metadata, `PageView` and `Subscribe` cannot be attributed to this production page.

## E. Root Cause Ranking

| Rank | Hypothesis | Confidence | Reason |
| --- | --- | --- | --- |
| 1 | `Subscribe` is from another source using the same Pixel ID | 85% | No `Subscribe` code path exists in source or active bundle |
| 2 | Meta Test Events is being interpreted as page-specific when it is pixel-wide | 80% | Test Events can aggregate events for the selected Pixel across sources |
| 3 | ePost.pk sends `PageView` through a transport path not visible in the automated probe | 45% | Meta reports PageView, but no `facebook.com/tr` or alternate event endpoint was captured |
| 4 | Pixel ID is wrong in production | 10% | Production bundle and Meta config both show `1352565343396370` |
| 5 | Event deduplication suppresses transport | 10% | No event-id deduplication path was found in the current wrappers |

## Required Meta Events Manager Checks

For the latest `PageView` and `Subscribe` rows in Test Events, verify:

- Pixel ID equals `1352565343396370`
- `event_source_url` equals `https://www.epost.pk/` or another ePost route
- Event timestamp matches the active browser test window
- Source type is Browser, not Server or partner integration
- Domain is `www.epost.pk`, not another website
- Test Event Code is not filtering or mixing events from another session

## Conclusion

The Pixel ID is consistent across source, active production bundle, and Meta config loading. The Pixel ID itself is unlikely to be wrong. The strongest unresolved issue is attribution of Meta Test Events rows: `Subscribe` is almost certainly not emitted by this repo, and `PageView` cannot be considered proven from ePost.pk until its Test Events detail shows `event_source_url` and timestamp matching the audited production browser session.

## Scores

- Pixel confidence: `90%`
- Transport confidence: `35%`
- Overall forensic confidence: `78%`
- Meta readiness: `65%`
