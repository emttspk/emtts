# Push Guard

This repository uses a strict project signature guard to prevent cross-project mistakes.

## Signature

- Required signature: `EPOST_PK_LABEL_GENERATOR__MAIN__PROTECTED_SCOPE`

## What Is Verified

- Git remote origin matches expected project remote.
- Current branch is `main`.
- Project signature in `.ai-project/PROJECT_IDENTITY.json` is present and correct.
- Forbidden secret files are not staged or unstaged.
- Changed file list is printed before any push attempt.

## Push Rule

- `npm run push:safe` runs scope verification first.
- Push never happens automatically.
- Explicit terminal confirmation is required.
- If approved, push is restricted to the expected branch only.

## Stop Conditions

- Any remote mismatch.
- Any branch mismatch.
- Any signature mismatch.
- Any forbidden file pattern detected.