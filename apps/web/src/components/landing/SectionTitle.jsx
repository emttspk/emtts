export default function SectionTitle({ kicker, title, subtitle, align = "left" }) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`max-w-3xl ${alignClass}`.trim()}>
      {kicker ? <div className="ui-kicker">{kicker}</div> : null}
      <h2 className="mt-5 font-display text-4xl font-extrabold tracking-[-0.04em] text-brand-ink md:text-5xl">{title}</h2>
      {subtitle ? <p className="mt-4 text-lg leading-8 text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
