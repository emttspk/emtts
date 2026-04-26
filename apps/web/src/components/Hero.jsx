import { useState } from "react";
import { ArrowRight, Search, ShieldCheck, CircleCheckBig, PackageSearch } from "lucide-react";
import { useNavigate } from "react-router-dom";

const trustIndicators = ["Government Connected Workflow", "Dispatch Ready in Minutes", "Built for High Volume Teams"];
const trustBar = [
	"Official Pakistan Post Partner",
	"Secure Dispatch System",
	"No Credit Card Required",
	"Fast Setup",
];

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const navigate = useNavigate();

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		const value = trackingId.trim();
		if (!value) return;
		navigate(`/tracking?id=${encodeURIComponent(value)}`);
	};

	return (
		<section className="relative overflow-hidden pb-10 pt-10 md:pb-14 md:pt-14">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(11,107,58,0.16),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(15,23,42,0.12),transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f3f7ff_60%,#f6fbf8_100%)]" />
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,rgba(255,255,255,0.8),transparent)]" />

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
				<div className="grid items-start gap-9 lg:grid-cols-[45%_55%] lg:gap-12">
					<div className="max-w-xl">
						<div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
							<ShieldCheck className="h-3.5 w-3.5" /> Trusted dispatch technology
						</div>

						<h1 className="mt-6 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-slate-900 sm:text-[44px] lg:text-[56px]">
							Pakistan Post Shipping Platform for Labels, Tracking &amp; Money Orders
						</h1>

						<p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
							Generate labels, create money orders, track parcels and resolve complaints from one powerful dispatch platform.
						</p>

						<form
							onSubmit={handleTrackingSubmit}
							className="mt-7 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur"
						>
							<div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tracking Search</div>
							<div className="mt-3 flex flex-col gap-2 sm:flex-row">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
									placeholder="Enter tracking ID (VPL/RGL/IRL)"
									className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
								/>
								<button
									type="submit"
									className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.24)]"
								>
									<Search className="h-4 w-4" />
									Track Shipment
								</button>
							</div>
							<p className="mt-2 text-xs text-slate-500">Track shipments without signup</p>
						</form>

						<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
							<a
								href="/register"
								className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-6 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(15,23,42,0.24)] transition-transform duration-200 hover:-translate-y-0.5"
							>
								Create Free Account
								<ArrowRight className="h-4 w-4" />
							</a>
							<a
								href="/login"
								className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-800 hover:text-slate-900"
							>
								Login to Dashboard
							</a>
						</div>

						<div className="mt-6 grid gap-2 text-sm text-slate-600">
							{trustIndicators.map((item) => (
								<div key={item} className="inline-flex items-center gap-2">
									<CircleCheckBig className="h-4 w-4 text-emerald-600" />
									<span>{item}</span>
								</div>
							))}
						</div>
					</div>

					<div className="relative">
						<div className="rounded-[30px] border border-white/70 bg-white/88 p-3 shadow-[0_35px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-4">
							<div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9ff_100%)] p-4 sm:p-5">
								<div className="mb-4 flex items-center justify-between">
									<div>
										<div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dispatch Product Mockup</div>
										<div className="mt-1 text-sm font-semibold text-slate-900">Unified Operations Frame</div>
									</div>
									<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
										<PackageSearch className="h-3.5 w-3.5" />
										Live Preview
									</span>
								</div>

								<div className="space-y-3">
									<article className="rounded-2xl border border-slate-200 bg-white p-4">
										<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Section A: Label Preview</div>
										<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
											<div className="rounded-lg bg-slate-900 p-2">
												<svg viewBox="0 0 320 44" className="h-10 w-full" aria-label="barcode preview">
													<rect x="0" y="0" width="320" height="44" fill="#0f172a" />
													{Array.from({ length: 54 }).map((_, idx) => (
														<rect
															key={idx}
															x={6 + idx * 5.6}
															y="4"
															width={idx % 3 === 0 ? 3.2 : 1.8}
															height="36"
															fill="#f8fafc"
															opacity={idx % 5 === 0 ? 0.95 : 0.82}
														/>
													))}
												</svg>
											</div>
											<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
												<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
													<span className="font-semibold text-slate-900">Receiver:</span> Abdul Rehman - Karachi
												</div>
												<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
													<span className="font-semibold text-slate-900">Sender:</span> P.Post Hub - Lahore
												</div>
												<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
													<span className="font-semibold text-slate-900">Shipment:</span> VPL26030700
												</div>
												<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
													<span className="font-semibold text-slate-900">Type:</span> Parcel Priority
												</div>
											</div>
										</div>
									</article>

									<article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
										<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Section B: Money Order Preview</div>
										<div className="grid gap-2 text-xs sm:grid-cols-3">
											<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
												<div className="text-slate-500">Amount</div>
												<div className="mt-0.5 font-semibold text-slate-900">Rs. 8,450</div>
											</div>
											<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
												<div className="text-slate-500">Status</div>
												<div className="mt-0.5 font-semibold text-emerald-700">Verified</div>
											</div>
											<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
												<div className="text-slate-500">Reference</div>
												<div className="mt-0.5 font-semibold text-slate-900">MOS26030700</div>
											</div>
										</div>
									</article>

									<article className="rounded-2xl border border-slate-200 bg-white p-4">
										<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Section C: Tracking Route</div>
										<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
											<svg viewBox="0 0 370 88" className="h-20 w-full" aria-label="tracking route preview">
												<path d="M20 64 C85 16, 164 92, 350 30" stroke="#dbeafe" strokeWidth="8" fill="none" />
												<path d="M20 64 C85 16, 164 92, 270 48" stroke="#0b6b3a" strokeWidth="7" fill="none" strokeLinecap="round" />
												<circle cx="20" cy="64" r="7" fill="#0f172a" />
												<circle cx="270" cy="48" r="7" fill="#22c55e" />
												<circle cx="350" cy="30" r="7" fill="#94a3b8" />
												<text x="12" y="82" fontSize="11" fill="#0f172a" fontWeight="700">Lahore</text>
												<text x="246" y="67" fontSize="11" fill="#0f172a" fontWeight="700">Multan</text>
												<text x="324" y="49" fontSize="11" fill="#0f172a" fontWeight="700">Karachi</text>
											</svg>
											<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
												<span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Delivery Badge: In Transit</span>
												<span className="font-semibold text-slate-600">ETA: 27 Mar, 04:30 PM</span>
											</div>
										</div>
									</article>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-8 grid gap-3 rounded-[26px] border border-slate-200 bg-white/80 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
					{trustBar.map((item) => (
						<div key={item} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">
							{item}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
