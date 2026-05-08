# Money Order Static Background Restoration

**Date**: May 8, 2026  
**Commit**: `eaad8f0`  
**Status**: ✅ COMPLETED & DEPLOYED

---

## Overview

This document describes the **mandatory rollback and restoration** of static money order front image rendering, reversing the dynamic background resolution approach that was introduced in `8ed978b`.

**Change Summary**:
- ✅ Reverted dynamic background injection from money order rendering pipeline
- ✅ Restored static front image binding to `MO/MO F.png`
- ✅ Removed dynamic path resolution from worker and admin preview routes
- ✅ Preserved all field coordinates, layout, and non-background rendering logic

---

## What Was Rolled Back

### Previous Dynamic Approach (Reverted)
The intermediate implementation attempted to:
- Load money order backgrounds dynamically via `loadMoneyOrderBackgrounds` function
- Pass background data URLs through `opts.backgrounds.frontDataUrl` parameter
- Resolution logic occurring per-request at worker and admin preview call sites

**Rationale for Rollback**:
- User requirement: deterministic, stable background source without dynamic resolution
- Simplified renderering pipeline without runtime path negotiation
- No dynamic template/file loading during label generation

---

## Current Static Approach (Restored)

### Architecture

**1. Static Front Image Source**
- **Path**: `MO/MO F.png`
- **Binding**: Direct data URL injection in core renderer
- **Behavior**: All money order renders use this single source, no runtime selection

**2. Renderer Binding** (`apps/api/src/templates/labels.ts`)
```typescript
// Static resolver - always returns MO F.png data URL
function resolveStaticMoFrontDataUrl(): string {
  const paths = [
    path.join(process.cwd(), 'MO', 'MO F.png'),
    path.join(__dirname, '..', '..', 'MO', 'MO F.png'),
    // ... additional fallback paths
  ];
  // Cached data URL returned to renderer
  return staticMoFrontDataUrlCache;
}

// Renderer now uses only static source
export function moneyOrderHtml(orders: Order[]): string {
  return moneyOrderHtmlFromBenchmark(orders, resolveStaticMoFrontDataUrl());
}
```

**3. Worker Integration** (`apps/api/src/worker.ts`)
- Calls `moneyOrderHtml(printableOrders)` directly
- No background parameter construction
- No dynamic path resolution

**4. Admin Preview** (`apps/api/src/routes/adminTemplates.ts`)
- Route handler calls `moneyOrderHtml([orderLikeRecord])`
- No `loadMoneyOrderBackgrounds` invocation
- Preview uses same static source as production renders

---

## Field Layout Preservation

**No Changes to**:
- ✅ HTML slot coordinates (shipperName, consigneeName, tracking, etc.)
- ✅ CSS positioning (position, top, left values)
- ✅ Barcode/QR code rendering
- ✅ Font sizing and spacing
- ✅ PDF generation pipeline

**Only Changed**:
- ❌ Removed dynamic background loading logic
- ❌ Removed `opts.backgrounds` parameter injection
- ❌ Removed per-route resolution

---

## Deployment & Validation

### Build Validation ✅
```
npm run lint      → PASS
npm run typecheck → PASS
npm run build     → PASS (Web + API)
npm run test      → PASS (smoke test)
```

### Runtime Validation ✅
- **Dev Server**: Vite ready, API listening
- **Railway Deployment**: Both API and Web services deployed
- **API Logs**: MO template resolved, PDFs generated, downloads successful
- **Money Order Generation**: Working end-to-end

### Visual Proof ✅
- Generated `forensic-artifacts/mo-static-front-proof.png` (screenshot)
- Generated `forensic-artifacts/mo-static-front-proof.pdf` (PDF render)
- Both confirm static front image present and positioned correctly

---

## Git History

```
eaad8f0 (HEAD -> main)  revert dynamic money order background and restore static MO F front image rendering
8ed978b                 restore original money order template file and fix front background rendering
21d7f0a                 fix money order front background and add test filename exemption system
```

---

## File Changes Summary

| File | Change | Reason |
|------|--------|--------|
| `apps/api/src/templates/labels.ts` | Added static resolver `resolveStaticMoFrontDataUrl()` | Centralized static source binding |
| `apps/api/src/worker.ts` | Removed background construction | Simplified call to `moneyOrderHtml()` |
| `apps/api/src/routes/adminTemplates.ts` | Removed `loadMoneyOrderBackgrounds` | Admin preview uses same static path |

---

## Going Forward

### Static Front Image Location
```
<workspace>/MO/MO F.png
```

### Rendering Flow
```
moneyOrderHtml(orders)
  ↓
moneyOrderHtmlFromBenchmark(orders, staticDataUrl)
  ↓
PDF generation (Puppeteer)
  ↓
Download/delivery
```

### If Changes Needed
- **To change front image**: Replace `MO/MO F.png` (no code changes required)
- **To add conditional backgrounds**: Modify `resolveStaticMoFrontDataUrl()` in `labels.ts` only
- **Preserve current behavior**: No further modifications needed

---

## Related Documentation

- `FINAL_EXECUTION_REPORT.md` - Overall project completion status
- `docs/deployment-status.md` - Current Railway deployment info
- `money-order-template-forensic-recovery.md` - Template restoration details
- `README.md` - Main project documentation

---

**Status**: ✅ DEPLOYED TO PRODUCTION  
**Environment**: Railway (API + Web)  
**Next Review**: As needed for background asset changes
