# Postage Upload Comparison Rules (Phase 1)

- Per-article postage is mandatory for Pakistan Post.
- Bundle total weight is for courier comparison only.
- VPL, VPP, COD remain Pakistan Post final delivery products.
- Under 10 articles: direct courier or self-drop advisory.
- 10+ articles and average weight under 250g: Pakistan Post route only when savings exist.
- Focus remains under 1kg per article in Phase 1.
- Excluded fields: service fee, handling fee, profit margin, ePost fee.

## Production Verification Snapshot (2026-06-01)

- Deployed commit: `15df875`.
- Api deployment status: `SUCCESS` (`86d78bd2-c2e9-47e1-ac93-d9739aa5c761`).
- Web deployment status: `SUCCESS` (`dd997840-310e-410a-8a9e-0f67146e0e4a`).
- Public smoke checks passed for:
- `https://api.epost.pk/health`
- `https://www.epost.pk/`
- `https://www.epost.pk/login`
- `https://www.epost.pk/upload`
- `https://www.epost.pk/postage-calculator`
- `https://www.epost.pk/postage-upload-summary`
- `https://www.epost.pk/postage-comparison`
- Unauthenticated API probe returned `401` on `/api/postage-calculator/calculate` (expected).
