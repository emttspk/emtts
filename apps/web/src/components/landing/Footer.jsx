export default function Footer() {
  return (
    <footer id="support" className="bg-[#0F172A]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-16 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <div className="text-xl font-bold text-white">Epost.pk</div>
          <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">Pakistan Post operations, elevated into a premium shipment workspace for labels, money orders, tracking and complaints.</p>
          <p className="mt-4 text-sm font-semibold text-emerald-200">www.epost.pk</p>
        </div>
        <div>
         <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
           <li><a href="/upload" className="hover:text-white">Book Parcel</a></li>
           <li><a href="#labels" className="hover:text-white">Generate Label</a></li>
           <li><a href="#money-orders" className="hover:text-white">Generate Money Order</a></li>
           <li><a href="/bulk-tracking" className="hover:text-white">Tracking</a></li>
           <li><a href="#complaints" className="hover:text-white">Complaint</a></li>
          </ul>
        </div>
        <div>
         <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Account</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
           <li><a href="/login" className="hover:text-white">Login</a></li>
           <li><a href="/register" className="hover:text-white">Create Account</a></li>
           <li><a href="/billing" className="hover:text-white">Pricing</a></li>
           <li><a href="/dashboard" className="hover:text-white">Dashboard</a></li>
          </ul>
        </div>
        <div>
         <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Help</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
           <li><a href="#contact" className="hover:text-white">Contact</a></li>
           <li>Support@epost.pk</li>
            <li>Mon-Sat, 9:00am-6:00pm</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
