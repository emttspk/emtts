# Phase 9A Day 1 Implementation

## Scope
Implements only the telemetry and utility foundation for storage-key normalization. No runtime behavior is changed. No key generation or download logic is altered.

## Feature Flags (all default OFF)
- `ENABLE_NORMALIZED_OBJECT_KEYS`
- `NORMALIZED_KEYS_FOR_NEW_UPLOADS`
- `DUAL_KEY_LOOKUP_ENABLED`
- `LOG_KEY_VERSIONS_IN_TELEMETRY`

## Telemetry Events
- `object_key_version_logged` (logs jobId, artifactType, keyVersion, rawKey, normalizedKey)
- `compatibility_layer_status` (heartbeat, not yet active)

## Utility Function Signatures
- `getEnvironmentName(): string`
- `getNormalizedObjectKey(jobId: string, artifactType: string): string`
- `isNormalizedKey(key: string): boolean`
- `getLegacyObjectKey(absolutePath: string): string`
- `extractJobIdFromAbsolutePath(absolutePath: string): string | null`

## Rollback Steps
1. Remove `apps/api/src/storage/key-normalization.ts`
2. Remove feature flags from `apps/api/src/config.ts`
3. Remove new telemetry events and log calls
4. Remove this documentation file

## Validation Checklist
- [ ] Build compiles cleanly
- [ ] Existing uploads/downloads behave identically
- [ ] Telemetry events are defensive and never throw
- [ ] Feature flags default OFF
- [ ] Runtime behavior is 100% legacy-compatible

## No-Go Triggers
- Any build/type error
- Any runtime error in upload/download
- Any change in R2 key generation or download behavior
- Any telemetry event causing a crash

## Statement of Safety
**No runtime behavior is changed. All uploads, downloads, and key generation remain 100% legacy-compatible.**
