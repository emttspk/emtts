export const PRINT_MARKETING_LINE = "Free Print Labels, Money Order, Track Parcels & Complaints, Visit www.ePost.pk";
export const PRINTABLE_FOOTER_CLASS_NAME = "print-shared-footer";
export const PRINTABLE_FOOTER_CSS = `.${PRINTABLE_FOOTER_CLASS_NAME}{width:100%;max-width:100%;text-align:center;font-size:13px;font-weight:600;line-height:1.4;white-space:normal;word-break:normal;overflow-wrap:break-word;display:flex;justify-content:center;align-items:center;}`;

export const ENVELOPE_DEFAULT_SIZE = {
  widthInches: 9.5,
  heightInches: 4.125,
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
