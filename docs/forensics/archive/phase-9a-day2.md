# Phase 9A Day 2 (Read-Only Compatibility Plumbing)

## Objective
Extend R2 read-side interfaces to accept optional compatibility options without changing runtime behavior.

## Files Modified
- apps/api/src/storage/R2StorageProvider.ts
- apps/api/src/storage/provider.ts

## Method Signature Changes

Read-side methods now accept an optional `options` parameter:

- `readArtifact(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<Buffer>`
- `readArtifactStream(type: string, key: string, outputStream: NodeJS.WritableStream, options?: R2ReadCompatibilityOptions): Promise<void>`
- `artifactExists(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<boolean>`
- `getArtifactUrl(type: string, key: string, options?: R2ReadCompatibilityOptions): Promise<string>`

Options shape:

```ts
export interface R2ReadCompatibilityOptions {
  keyVersion?: "legacy" | "normalized";
  jobId?: string;
  artifactType?: string;
}
```

## Backward Compatibility Guarantees
- Existing calls without `options` behave identically.
- `buildKey()` logic remains unchanged.
- R2 key format remains legacy.
- No fallback logic added.
- No feature activation performed.

## Validation Performed
- Build compiles cleanly.
- Typecheck passes.
- No interface-breaking change for existing call sites.

## Rollback Steps
1. Remove optional `options` parameters from read-side methods in `R2StorageProvider.ts`.
2. Remove `R2ReadCompatibilityOptions` interface from `R2StorageProvider.ts`.
3. Revert `getDualProviders()` return type in `provider.ts`.
4. Run build and typecheck.

## No-Go Triggers
- Any build/type failure
- Any observable change in upload/download behavior
- Any key-format change in R2
- Any accidental dual-read activation

## Safety Statement
**Day 2 introduces signature-only read-side compatibility plumbing and does not change runtime behavior, key generation, download behavior, or storage semantics.**
