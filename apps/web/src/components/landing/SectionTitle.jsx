export default function SectionTitle({ kicker, title, subtitle, align = "left" }) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`max-w-3xl ${alignClass}`.trim()}>
      {kicker ? <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{kicker}</div> : null}
      <h2 className="mt-3 text-4xl font-bold tracking-tight text-[#0F172A]">{title}</h2>
      {subtitle ? <p className="mt-3 text-base text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
