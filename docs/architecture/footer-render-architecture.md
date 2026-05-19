# Footer Render Architecture

## Old Footer Sources (Removed)
- apps/api/src/templates/labels.ts: marketingFooterTextHtml(), inline HTML, string replace
- apps/api/temp/templates/labels.js: hardcoded HTML
- forensic-artifacts/template-previews/money-order-preview.html: hardcoded HTML
- apps/api/src/templates/label-box-a4.html: inline footer HTML
- apps/api/src/templates/label-envelope.html: inline footer HTML
- apps/web/src/pages/BulkTracking.tsx: TRACKING_PRINT_MARKETING_LINE

## New Source of Truth
- apps/api/src/lib/printBranding.ts
  - PRINT_MARKETING_LINE
  - PRINTABLE_FOOTER_CLASS_NAME
  - PRINTABLE_FOOTER_CSS
- All footer rendering now uses this single source via unified injection.

## Money Order Half Render Structure
- Wrapper: <div class="half front">, <div class="half back">
- Each half: position: relative
- Footer: <div class="print-shared-footer"> injected inside each half, bottom-centered
- CSS: position: absolute; bottom: 6mm; left: 0; width: 100%; padding: 0 8mm; text-align: center; font-size: 10px; font-weight: 600; line-height: 1.3; box-sizing: border-box; white-space: normal; overflow-wrap: break-word; word-break: normal;

## Unified Footer Injection
- All label, money order, tracking, and invoice footers now use getSharedPrintFooter() logic (via printBranding.ts constants)
- No duplicate or hardcoded footers remain

---

For further details, see commit ff57c68 and money-order-footer-proof.pdf/png for visual proof.