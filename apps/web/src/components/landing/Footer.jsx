export default function Footer() {
  return (
    <footer id="contact" className="bg-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="text-sm font-bold text-slate-900">Pakistan Post Labels</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Premium dispatch operations for Pakistan Post compatible workflows.</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Product</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li><a href="#features" className="hover:text-brand">Features</a></li>
              <li><a href="#pricing" className="hover:text-brand">Pricing</a></li>
              <li><a href="#workflow" className="hover:text-brand">Workflow</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Support</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>support@epost.pk</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-emerald-100 pt-6 text-xs text-slate-400">
          © 2026 Pakistan Post Labels. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
