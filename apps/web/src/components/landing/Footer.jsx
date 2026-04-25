export default function Footer() {
  return (
    <footer id="help" className="bg-[#0F172A]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-20 md:grid-cols-3">
        <div>
          <div className="text-sm font-bold text-white">Epost.pk</div>
          <p className="mt-2 text-xs text-slate-300">Booking, Free Labels, Money Order, Tracking & Complaint System.</p>
          <p className="mt-2 text-xs text-emerald-200">www.Epost.pk</p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Product</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li><a href="#labels" className="hover:text-white">Labels</a></li>
            <li><a href="#tracking" className="hover:text-white">Tracking</a></li>
            <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Support</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li>support@epost.pk</li>
            <li>Mon-Sat, 9:00am-6:00pm</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
