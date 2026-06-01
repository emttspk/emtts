# Safe Commands

Run these commands before any push or deployment action:

1. `npm run scope:check`
2. `npm run railway:check`
3. `npm run r2:check`
4. `npm run build`

## Guardrail Notes

- Railway check is read-only and never deploys.
- R2 check is read-only and never uploads or deletes objects.
- Secrets must remain outside git-tracked files.
- If any signature or target mismatch appears, stop immediately.