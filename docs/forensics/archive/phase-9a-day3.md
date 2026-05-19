# Phase 9A Day 3 (Compatibility Layer Insertion)

## Objective
Insert dual-key compatibility lookup plumbing in read paths only, while keeping it fully disabled by default.

## Files Modified
- apps/api/src/storage/R2StorageProvider.ts
- apps/api/src/storage/key-normalization.ts
- apps/api/src/telemetry.ts
- docs/storage-key-normalization-migration.md
- docs/phase-9a-day3.md

## Helper Functions Added
- `resolveObjectKeyCandidates(...)` in key-normalization utilities
- `resolveCompatibleObjectKey(...)` in R2StorageProvider

## Compatibility Algorithm
1. Build ordered candidates:
   - candidate 1: normalized key
   - candidate 2: legacy key
2. Feature-flag gate:
   - If `DUAL_KEY_LOOKUP_ENABLED=false`, short-circuit to legacy-only candidate
   - If enabled later, try normalized first then legacy
3. Apply only in read-side methods:
   - `readArtifact`
   - `readArtifactStream`
   - `artifactExists`
   - `getArtifactUrl`

## Telemetry Added
- `compatibility_lookup_attempt`
- `compatibility_lookup_hit`
- `compatibility_lookup_miss`

Optional metadata fields:
- `objectKeyVersion`
- `lookupAttempt`
- `compatibilityMode`

## Feature-Flag Gating Behavior
- Default mode remains legacy-only.
- No normalized lookups occur by default while flags are OFF.
- No upload path activation.

## Backward Compatibility Guarantees
- Existing calls and defaults remain legacy-compatible.
- `buildKey()` behavior unchanged.
- No object-key format change.
- No route behavior change.
- No cleanup behavior change.

## Validation
- Build compiles cleanly.
- Typecheck passes.
- Default behavior remains unchanged with flags OFF.

## Rollback Steps
1. Remove read-path calls to `resolveCompatibleObjectKey()`.
2. Remove `resolveObjectKeyCandidates()` utility.
3. Remove compatibility telemetry helper functions.
4. Rebuild and typecheck.

## Safety Statement
**Runtime behavior remains unchanged while flags are OFF. Day 3 only inserts disabled compatibility plumbing.**
