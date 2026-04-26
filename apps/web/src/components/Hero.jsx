import { useEffect, useState } from "react";
import { ArrowRight, Search, ShieldCheck, CircleCheckBig, PackageSearch, PlayCircle, AlertCircle, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const trustIndicators = ["No credit card", "Free forever plan", "Public tracking", "Official Pakistan Post partner"];
const trustBar = [
	"Official Pakistan Post Partner",
	"Secure Dispatch System",
	"No Credit Card Required",
	"Fast Setup",
];

const rotatingCards = [
	{
		title: "Booking",
		subtitle: "Live dispatch control",
		content: (
			<div className="space-y-3">
				<div className="grid grid-cols-3 gap-2">
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Today</div>
						<div className="mt-1 text-lg font-bold text-slate-900">264</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Queued</div>
						<div className="mt-1 text-lg font-bold text-slate-900">41</div>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
						<div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Completed</div>
						<div className="mt-1 text-lg font-bold text-emerald-700">223</div>
					</div>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
					Dispatch window is stable. Karachi and Islamabad routes are performing above SLA.
				</div>
			</div>
		),
	},
	{
		title: "Label",
		subtitle: "Print-ready in one click",
		content: (
			<div className="space-y-3">
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
					<div className="rounded-lg bg-slate-900 p-2">
						<svg viewBox="0 0 320 44" className="h-10 w-full" aria-label="label barcode">
							<rect x="0" y="0" width="320" height="44" fill="#0f172a" />
							{Array.from({ length: 56 }).map((_, idx) => (
								<rect key={idx} x={4 + idx * 5.4} y="4" width={idx % 3 === 0 ? 3 : 1.6} height="36" fill="#f8fafc" />
							))}
						</svg>
					</div>
					<div className="mt-2 grid grid-cols-2 gap-2 text-xs">
						<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">To:</span> Abdul Rehman</div>
						<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">From:</span> Lahore Hub</div>
					</div>
				</div>
			</div>
		),
	},
	{
		title: "Money Order",
		subtitle: "Verified payout block",
		content: (
			<div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
				<div className="grid grid-cols-3 gap-2 text-xs">
					<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5"><div className="text-slate-500">Amount</div><div className="font-semibold">Rs. 8,450</div></div>
					<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5"><div className="text-slate-500">Status</div><div className="font-semibold text-emerald-700">Verified</div></div>
					<div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5"><div className="text-slate-500">Ref</div><div className="font-semibold">MOS26030700</div></div>
				</div>
				<div className="mt-2 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs text-slate-600">Settlement slip generated for same-day disbursement.</div>
			</div>
		),
	},
	{
		title: "Tracking Map",
		subtitle: "Multi-city progression",
		content: (
			<div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
				<svg viewBox="0 0 400 96" className="h-20 w-full" aria-label="pakistan route">
					<path d="M22 72 C86 22, 160 90, 228 46 C264 30, 320 56, 380 28" stroke="#dbeafe" strokeWidth="8" fill="none" />
					<path d="M22 72 C86 22, 160 90, 228 46" stroke="#0b6b3a" strokeWidth="7" fill="none" strokeLinecap="round" />
					<circle cx="22" cy="72" r="6.5" fill="#0f172a" />
					<circle cx="228" cy="46" r="6.5" fill="#22c55e" />
					<circle cx="380" cy="28" r="6.5" fill="#94a3b8" />
					<text x="14" y="90" fontSize="11" fill="#0f172a" fontWeight="700">Lahore</text>
					<text x="94" y="26" fontSize="11" fill="#0f172a" fontWeight="700">Islamabad</text>
					<text x="205" y="64" fontSize="11" fill="#0f172a" fontWeight="700">Multan</text>
					<text x="354" y="48" fontSize="11" fill="#0f172a" fontWeight="700">Karachi</text>
				</svg>
				<div className="flex flex-wrap gap-2 text-xs font-semibold">
					<span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">In Transit</span>
					<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Delivered</span>
					<span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">Delayed</span>
					<span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">ETA: 27 Mar, 04:30 PM</span>
				</div>
			</div>
		),
	},
	{
		title: "Complaint",
		subtitle: "Guided escalation flow",
		content: (
			<div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
				<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">Tracking:</span> VPL26030700</div>
				<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">Issue:</span> Pending Delivery</div>
				<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">Reply Mode:</span> POST</div>
				<div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700"><AlertCircle className="h-3.5 w-3.5" /> Ticket queued for review</div>
			</div>
		),
	},
	{
		title: "Analytics",
		subtitle: "Dispatch conversion insights",
		content: (
			<div className="space-y-3">
				<div className="grid grid-cols-4 items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
					{[46, 62, 55, 74].map((height, idx) => (
						<div key={idx} className="h-16 rounded bg-white p-1 shadow-inner">
							<div className="w-full rounded bg-gradient-to-t from-emerald-500 to-emerald-300" style={{ height: `${height}%` }} />
						</div>
					))}
				</div>
				<div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs">
					<div>
						<div className="text-slate-500">Conversion</div>
						<div className="font-semibold text-slate-900">+18.4%</div>
					</div>
					<div>
						<div className="text-slate-500">Avg. Dispatch Time</div>
						<div className="font-semibold text-slate-900">2m 38s</div>
					</div>
				</div>
			</div>
		),
	},
];

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [activeCard, setActiveCard] = useState(0);
	const navigate = useNavigate();

	useEffect(() => {
		const timer = window.setInterval(() => {
			setActiveCard((prev) => (prev + 1) % rotatingCards.length);
		}, 2500);
		return () => window.clearInterval(timer);
	}, []);

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		const value = trackingId.trim();
		if (!value) return;
		navigate(`/tracking?id=${encodeURIComponent(value)}`);
	};

	return (
		<section className="relative overflow-hidden pb-10 pt-4 md:pb-14 md:pt-6">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(11,107,58,0.16),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(15,23,42,0.12),transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f3f7ff_60%,#f6fbf8_100%)]" />
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,rgba(255,255,255,0.8),transparent)]" />

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
				<div className="grid items-start gap-9 lg:grid-cols-[45%_55%] lg:gap-12">
					<div className="max-w-xl">
						<div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
							<ShieldCheck className="h-3.5 w-3.5" /> Trusted dispatch technology
						</div>

						<h1 className="mt-6 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-slate-900 sm:text-[44px] lg:text-[56px]">
							Ship Smarter Across Pakistan
							<span className="mt-1 block text-emerald-700">Labels, Tracking &amp; Money Orders</span>
						</h1>

						<p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
							Generate labels, create money orders, track parcels and resolve complaints from one powerful dispatch platform.
						</p>

						<form
							onSubmit={handleTrackingSubmit}
							className="mt-6 rounded-3xl border border-slate-200 bg-white/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur"
						>
							<div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tracking Search</div>
							<div className="mt-3 grid grid-cols-[7fr_3fr] items-center gap-2">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
									placeholder="Enter tracking ID (VPL/RGL/IRL)"
									className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
								/>
								<button
									type="submit"
									className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.24)]"
								>
									<Search className="h-4 w-4" />
									Track Now
								</button>
							</div>
							<div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
								<div><span className="font-semibold">Status:</span> In Transit</div>
								<div><span className="font-semibold">Current city:</span> Multan</div>
								<div><span className="font-semibold">Destination:</span> Karachi</div>
								<div><span className="font-semibold">Expected delivery:</span> 27 Mar, 04:30 PM</div>
							</div>
							<p className="mt-2 text-xs text-slate-500">without login</p>
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
								href="#workflow"
								className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-800 hover:text-slate-900"
							>
								<PlayCircle className="mr-2 h-4 w-4" />
								Watch Demo
							</a>
						</div>

						<div className="mt-5 grid gap-2 text-sm text-slate-600">
							{trustIndicators.map((item) => (
								<div key={item} className="inline-flex items-center gap-2">
									<CircleCheckBig className="h-4 w-4 text-emerald-600" />
									<span>{item}</span>
								</div>
							))}
						</div>

					</div>

					<div className="relative">
						<div className="rounded-[30px] border border-white/70 bg-white/70 p-3 shadow-[0_35px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-4">
							<div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9ff_100%)] p-4 sm:p-5">
								<div className="mb-4 rounded-2xl border border-slate-200 bg-white px-3 py-2">
									<div className="flex items-center gap-2">
										<span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
										<span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
										<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
										<span className="ml-2 text-xs font-semibold text-slate-600">Operations Dashboard</span>
									</div>
								</div>
								<div className="mb-4 flex items-center justify-between">
									<div>
										<div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Product Surface</div>
										<div className="mt-1 text-sm font-semibold text-slate-900">Rotating Workflow Preview</div>
									</div>
									<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
										<PackageSearch className="h-3.5 w-3.5" />
										Live Preview
									</span>
								</div>

								<div className="relative h-[280px] overflow-hidden">
									{rotatingCards.map((card, idx) => {
										const active = idx === activeCard;
										return (
											<article
												key={card.title}
												className={`absolute inset-0 rounded-3xl border border-slate-200/90 bg-white/90 p-4 shadow-xl backdrop-blur transition-all duration-500 ${
													active ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
												}`}
											>
												<div className="mb-3 flex items-center justify-between">
													<div>
														<div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{card.title}</div>
														<div className="mt-0.5 text-xs text-slate-600">{card.subtitle}</div>
													</div>
													<div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
														<BarChart3 className="h-4 w-4" />
													</div>
												</div>
												{card.content}
											</article>
										);
									})}
								</div>

								<div className="mt-4 flex items-center justify-center gap-1.5">
									{rotatingCards.map((card, idx) => (
										<span
											key={card.title}
											className={`h-1.5 rounded-full transition-all duration-300 ${idx === activeCard ? "w-6 bg-emerald-600" : "w-2 bg-slate-300"}`}
										/>
									))}
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
