# Meta Pixel Transport Verification 2026

## Scope
Production browser transport audit for implemented Meta Pixel events. No code changes were made in this pass.

## Test Summary
- Pixel initialization observed: yes
- `fbq` available in browser: yes
- Meta script loaded: `https://connect.facebook.net/en_US/fbevents.js`
- Meta config request observed: yes
- Meta event beacon to `facebook.com/tr`: no

## Observed Network Evidence
- `https://connect.facebook.net/en_US/fbevents.js` loaded with HTTP 200.
- `https://connect.facebook.net/signals/config/1352565343396370?...` loaded with HTTP 200.
- No `https://www.facebook.com/tr/...` requests were observed in the production browser session.

## Event Matrix

| Event | Implemented | Triggered in Browser Test | Transport Sent | Verified |
| --- | --- | --- | --- | --- |
| `PageView` | Yes | Yes | No | No |
| `Lead` | Yes | Yes | No | No |
| `CompleteRegistration` | Yes | Yes | No | No |
| `Login` | Yes | Yes | No | No |
| `InitiateCheckout` | Yes | Yes | No | No |
| `Purchase` | Yes | Yes | No | No |

## Code Verification
- `apps/web/src/lib/analytics.ts` contains Meta dispatch calls for all six standard events.
- `PageView` is called from route changes in `apps/web/src/App.tsx`.
- `Lead` is called from the existing Start Free / Register CTA flow.
- `CompleteRegistration` is called from successful registration.
- `Login` is called from successful login.
- `InitiateCheckout` is called from checkout start in billing.
- `Purchase` is called from payment success in billing.

## Root Cause
The browser sees the pixel script and config handshake, but the standard event calls remain queued and do not reach the `facebook.com/tr` transport endpoint.

This is an inference from the observed production browser behavior and the `fbq.queue` state:
- `fbq` exists as a function.
- `fbq.loaded` is `true`.
- The queue grows when standard events are dispatched.
- No outbound `facebook.com/tr` beacon is emitted.

The most likely cause is a Meta initialization / queue-flush mismatch in the current custom pixel bootstrap path. The transport layer is not flushing queued events into Meta beacons in the observed browser session.

## Scores
- Meta transport score: `2/10`
- Event delivery score: `0/10`
- Meta readiness: `50%`

## Remaining Blockers
- No Meta event beacon is reaching `facebook.com/tr` in the production browser session.
- The browser transport path needs a follow-up fix before Meta delivery can be considered production-ready.

