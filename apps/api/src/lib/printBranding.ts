export const PRINT_MARKETING_LINE = "Free Print Labels, Money Order, Track Parcels & Complaints, Visit www.ePost.pk";

export const ENVELOPE_DEFAULT_SIZE = {
  widthInches: 9.5,
  heightInches: 4.125,
};

export function buildPdfAttachmentHeader(fileName: string) {
  const safe = String(fileName ?? "download.pdf").replace(/[\r\n\"\\]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
