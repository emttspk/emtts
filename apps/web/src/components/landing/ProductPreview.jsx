import Card from "./Card";
import SectionTitle from "./SectionTitle";

const previews = [
  {
    title: "Upload CSV Preview",
    visual: "columns: consignee, city, amount",
    footer: "Bulk validation + instant processing",
  },
  {
    title: "Label Preview",
    visual: "barcode + consignee block + service badge",
    footer: "A4 print-ready with high-contrast layout",
  },
  {
    title: "Tracking Preview",
    visual: "timeline + current status + last event",
    footer: "Live status sync with action controls",
  },
];

export default function ProductPreview() {
  return (
    <section id="money-orders" className="border-b border-[#E5E7EB] bg-[#F8FAF9]">
      <div className="ui-page">
        <SectionTitle kicker="Live Product" title="Real Screens, Real Workflow" subtitle="Preview how operations look inside the platform before signup." />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {previews.map((preview) => (
            <Card key={preview.title} className="overflow-hidden p-0">
              <div className="border-b border-[#E5E7EB] bg-gradient-to-br from-brand/10 to-transparent p-4">
                <div className="text-sm font-semibold text-[#0F172A]">{preview.title}</div>
                <div className="mt-2 rounded-xl border border-brand/20 bg-white p-4 text-xs text-slate-600 shadow-lg">
                  <div className="font-mono">{preview.visual}</div>
                  <div className="mt-2 h-20 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAF9]" />
                </div>
              </div>
              <div className="p-4 text-sm text-slate-600">{preview.footer}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
