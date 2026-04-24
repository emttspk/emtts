export default function Footer() {
  return (
    <footer id="contact" className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="text-sm font-bold text-gray-900">ePost Label SaaS</div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Premium dispatch operations for Pakistan Post compatible workflows.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Product</div>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              <li><a href="#features" className="hover:text-[#0B5D3B]">Features</a></li>
              <li><a href="#pricing" className="hover:text-[#0B5D3B]">Pricing</a></li>
              <li><a href="#workflow" className="hover:text-[#0B5D3B]">Workflow</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Support</div>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              <li>support@epost.pk</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-100 pt-6 text-xs text-gray-400">
          © 2026 ePost Label SaaS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
