export const PRINT_MARKETING_LINE = "Free Print Labels, Money Order, Track Parcels & Complaints, Visit www.ePost.pk";
export const PRINTABLE_FOOTER_CLASS_NAME = "print-shared-footer";
export const PRINTABLE_FOOTER_CSS = `.${PRINTABLE_FOOTER_CLASS_NAME}{width:100%;max-width:100%;display:block;text-align:center;font-size:11px;font-weight:600;line-height:1.3;white-space:normal;overflow:visible;overflow-wrap:anywhere;word-break:normal;box-sizing:border-box;padding:0 12px;}`;
export const LABEL_STANDARD_CSS = `*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,sans-serif;}img,svg,canvas{display:block;max-width:100%;}.PrintContainer{width:100%;max-width:100%;margin:0 auto;padding:0;overflow:hidden;background:#fff;}.LabelGrid{display:grid;gap:var(--label-gap,3mm);}.LabelWrapper{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;break-inside:avoid;page-break-inside:avoid;}.BarcodeBlock{display:grid;justify-items:center;align-content:start;gap:0.6mm;min-width:0;overflow:hidden;}.AddressBlock{display:grid;align-content:start;gap:0.6mm;min-width:0;min-height:0;overflow:hidden;}.FooterBlock{display:flex;align-items:center;justify-content:space-between;gap:4mm;min-width:0;}.FooterBlock--inline{justify-content:center;flex-wrap:wrap;}`;

export function getSharedPrintFooter(): string {
  return `<div class="${PRINTABLE_FOOTER_CLASS_NAME}">${PRINT_MARKETING_LINE}</div>`;
}

export const ENVELOPE_DEFAULT_SIZE = {
  widthInches: 9,
  heightInches: 4,
};

export function formatPrintablePdfDate(value = new Date()) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = String(value.getFullYear());
  return `${day}-${month}-${year}`;
}

export function buildLabelPdfFileName(value = new Date()) {
  return `Label ${formatPrintablePdfDate(value)}.pdf`;
}

export function buildMoneyOrderPdfFileName(value = new Date()) {
  return `Money Order ${formatPrintablePdfDate(value)}.pdf`;
}

export function buildPdfAttachmentHeader(fileName: string) {
  const safe = String(fileName ?? "download.pdf").replace(/[\r\n\"\\]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
