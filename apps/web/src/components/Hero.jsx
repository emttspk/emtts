import { useEffect, useState } from "react";
import { ArrowRight, Search, ShieldCheck, CircleCheckBig, PlayCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const trustIndicators = ["No credit card", "Free forever plan", "Public tracking", "Official Pakistan Post partner"];
const trustBar = [
	"Official Pakistan Post Partner",
	"Secure Dispatch System",
	"No Credit Card Required",
	"Fast Setup",
];

const LabelCard = () => (
	<div className="h-full rounded-2xl border border-slate-200 bg-white p-3 text-[10px] leading-tight text-slate-700">
		<div className="flex items-center justify-between border-b border-slate-200 pb-2">
			<div>
				<div className="text-[11px] font-extrabold tracking-[0.08em] text-slate-900">PAKISTAN POST</div>
				<div className="text-[9px] text-slate-500">Official Dispatch Label</div>
			</div>
			<div className="text-right">
				<div className="font-bold text-slate-900">VPL</div>
				<div className="font-semibold text-emerald-700">Rs. 8,450</div>
			</div>
		</div>

		<div className="mt-2 rounded-lg border border-slate-300 bg-slate-950 px-2 py-2 text-slate-50">
			<svg viewBox="0 0 340 38" className="h-8 w-full" aria-label="label barcode">
				<rect x="0" y="0" width="340" height="38" fill="#020617" />
				{Array.from({ length: 56 }).map((_, idx) => (
					<rect key={idx} x={3 + idx * 6} y="3" width={idx % 3 === 0 ? 3.2 : 1.6} height="32" fill="#f8fafc" />
				))}
			</svg>
			<div className="mt-1 text-center text-[10px] font-bold tracking-[0.16em] text-slate-100">VPL26030700</div>
		</div>

		<div className="mt-2 grid grid-cols-2 gap-1.5">
			<div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
				<div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Receiver</div>
				<div className="mt-0.5 font-semibold text-slate-900">Abdul Rehman, Karachi</div>
			</div>
			<div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
				<div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Sender</div>
				<div className="mt-0.5 font-semibold text-slate-900">Lahore Hub, Punjab</div>
			</div>
			<div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
				<div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Weight</div>
				<div className="mt-0.5 font-semibold text-slate-900">1.25 kg</div>
			</div>
			<div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
				<div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">Product</div>
				<div className="mt-0.5 font-semibold text-slate-900">Value Payable</div>
			</div>
		</div>

		<div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px]">
			<span className="font-semibold text-emerald-800">Money Order:</span> MOS26030700
		</div>
		<div className="mt-1.5 border-t border-slate-200 pt-1.5 text-center text-[9px] text-slate-500">
			<div className="font-semibold text-slate-700">Free Bulk Dispatch &amp; Tracking</div>
			<div>www.epost.pk</div>
		</div>
	</div>
);

const MoneyOrderCard = () => (
	<div className="h-full rounded-2xl border-2 border-emerald-700 bg-[#f9fff8] p-3 text-[10px] text-slate-800">
		<div className="flex items-start justify-between border-b border-emerald-200 pb-2">
			<div>
				<div className="text-[11px] font-extrabold tracking-[0.08em] text-emerald-900">PAKISTAN POST MONEY ORDER</div>
				<div className="text-[9px] text-emerald-800/80">Official Settlement Slip</div>
			</div>
			<div className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-right">
				<div className="text-[9px] text-slate-500">Ref</div>
				<div className="font-bold text-slate-900">MOS26030700</div>
			</div>
		</div>

		<div className="mt-2 rounded-md border border-slate-300 bg-slate-900 px-2 py-1.5 text-white">
			<svg viewBox="0 0 300 30" className="h-6 w-full" aria-label="money order barcode">
				<rect x="0" y="0" width="300" height="30" fill="#0f172a" />
				{Array.from({ length: 52 }).map((_, idx) => (
					<rect key={idx} x={4 + idx * 5.6} y="3" width={idx % 4 === 0 ? 2.8 : 1.4} height="24" fill="#f8fafc" />
				))}
			</svg>
		</div>

		<div className="mt-2 grid grid-cols-2 gap-1.5">
			<div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5">
				<div className="text-[9px] text-slate-500">Amount</div>
				<div className="text-sm font-extrabold text-emerald-800">Rs. 8,450</div>
			</div>
			<div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5">
				<div className="text-[9px] text-slate-500">Date</div>
				<div className="font-semibold text-slate-900">27 Mar 2026</div>
			</div>
			<div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5">
				<div className="text-[9px] text-slate-500">Sender</div>
				<div className="font-semibold text-slate-900">Lahore Dispatch Hub</div>
			</div>
			<div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5">
				<div className="text-[9px] text-slate-500">Receiver</div>
				<div className="font-semibold text-slate-900">Abdul Rehman, Karachi</div>
			</div>
		</div>

		<div className="mt-2 rounded-md border border-emerald-300 bg-emerald-100/70 px-2 py-1.5 text-[10px] font-semibold text-emerald-900">
			Verified for same-day disbursement through Pakistan Post operations desk.
		</div>
	</div>
);

const TrackingCard = () => (
	<div className="h-full rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
		<div className="flex items-center justify-between">
			<div>
				<div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">TRACKING ROUTE</div>
				<div className="text-[9px] text-slate-500">ID: VPL26030700</div>
			</div>
			<div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold">ETA: 27 Mar, 04:30 PM</div>
		</div>

		<svg viewBox="0 0 330 150" className="mt-2 h-[160px] w-full rounded-xl border border-slate-200 bg-slate-50" aria-label="Pakistan map route">
			<path d="M36 118 L72 66 L120 50 L170 70 L226 58 L280 82 L248 116 L190 124 L126 132 L72 126 Z" fill="#dff3ea" stroke="#9ac7b3" strokeWidth="2" />
			<path d="M82 62 Q138 98 178 88 T254 98" stroke="#c6d7cf" strokeWidth="5" fill="none" strokeLinecap="round" />
			<path d="M82 62 Q138 98 178 88 T254 98" stroke="#0b6b3a" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="8 7">
				<animate attributeName="stroke-dashoffset" from="0" to="-60" dur="1.5s" repeatCount="indefinite" />
			</path>
			<circle cx="82" cy="62" r="5" fill="#0f172a" />
			<circle cx="138" cy="98" r="5" fill="#eab308" />
			<circle cx="178" cy="88" r="5" fill="#f97316" />
			<circle cx="254" cy="98" r="5" fill="#22c55e" />
			<text x="66" y="52" fontSize="10" fill="#0f172a" fontWeight="700">Lahore</text>
			<text x="112" y="116" fontSize="10" fill="#0f172a" fontWeight="700">Multan</text>
			<text x="156" y="76" fontSize="10" fill="#0f172a" fontWeight="700">Islamabad</text>
			<text x="238" y="117" fontSize="10" fill="#0f172a" fontWeight="700">Karachi</text>
		</svg>

		<div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] font-semibold">
			<span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Booked</span>
			<span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">In Transit</span>
			<span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Delivered</span>
		</div>
	</div>
);

const ComplaintCard = () => (
	<div className="h-full rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
		<div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">COMPLAINT FORM</div>
		<div className="mt-2 grid gap-1.5">
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Tracking ID:</span> VPL26030700</div>
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Issue:</span> Pending delivery update</div>
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Reply mode:</span> POST</div>
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><span className="font-semibold">Customer:</span> Abdul Rehman</div>
		</div>
		<div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-semibold text-amber-700">
			<AlertCircle className="h-3.5 w-3.5" />
			Ticket queued for operations review
		</div>
	</div>
);

const BookingCard = () => (
	<div className="h-full rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-700">
		<div className="flex items-center justify-between">
			<div className="text-[11px] font-bold tracking-[0.08em] text-slate-900">BOOKING DASHBOARD</div>
			<div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Live</div>
		</div>
		<div className="mt-2 grid grid-cols-3 gap-1.5">
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
				<div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Today</div>
				<div className="mt-1 text-base font-bold text-slate-900">264</div>
			</div>
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
				<div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Queued</div>
				<div className="mt-1 text-base font-bold text-slate-900">41</div>
			</div>
			<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
				<div className="text-[8px] uppercase tracking-[0.08em] text-slate-500">Done</div>
				<div className="mt-1 text-base font-bold text-emerald-700">223</div>
			</div>
		</div>
		<div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
			<div className="text-[9px] font-semibold text-slate-900">Next Dispatch Batch</div>
			<div className="mt-0.5">Karachi South Route • Window 04:45 PM</div>
		</div>
		<div className="mt-2 grid grid-cols-2 gap-1.5">
			<div className="rounded-md border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">Avg Time:</span> 2m 38s</div>
			<div className="rounded-md border border-slate-200 bg-white px-2 py-1.5"><span className="font-semibold">Success:</span> 98.4%</div>
		</div>
	</div>
);

const rotatingCards = [
	{
		title: "Label Card",
		subtitle: "Print-ready shipping label",
		content: <LabelCard />,
	},
	{
		title: "Money Order Card",
		subtitle: "Official payout record",
		content: <MoneyOrderCard />,
	},
	{
		title: "Tracking Route Card",
		subtitle: "City-by-city route progression",
		content: <TrackingCard />,
	},
	{
		title: "Complaint Form Card",
		subtitle: "Guided escalation details",
		content: <ComplaintCard />,
	},
	{
		title: "Booking Dashboard Card",
		subtitle: "Live dispatch control panel",
		content: <BookingCard />,
	},
];

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [activeCard, setActiveCard] = useState(0);
	const navigate = useNavigate();

	useEffect(() => {
		const timer = window.setInterval(() => {
			setActiveCard((prev) => (prev + 1) % rotatingCards.length);
		}, 3000);
		return () => window.clearInterval(timer);
	}, []);

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		const value = trackingId.trim();
		if (!value) return;
		navigate(`/tracking?id=${encodeURIComponent(value)}`);
	};

	return (
		<section className="relative overflow-hidden pb-8 pt-4">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(11,107,58,0.16),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(15,23,42,0.12),transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f3f7ff_60%,#f6fbf8_100%)]" />
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),transparent)]" />

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
				<div className="grid items-center gap-8 lg:min-h-[620px] lg:grid-cols-[47%_53%] lg:gap-10">
					<div className="max-w-[580px]">
						<div className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white/85 px-3 py-2 shadow-sm">
							<div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(145deg,#0f172a,#0b6b3a)] text-[11px] font-extrabold text-white shadow-[0_8px_20px_rgba(11,107,58,0.28)]">EP</div>
							<div className="leading-tight">
								<div className="text-xs font-extrabold tracking-[0.05em] text-slate-900">Epost.pk</div>
								<div className="text-[10px] text-slate-500">Pakistan Post Operations Platform</div>
							</div>
						</div>

						<div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
							<ShieldCheck className="h-3.5 w-3.5" /> Trusted dispatch technology
						</div>

						<h1 className="mt-5 max-w-[580px] font-display text-[34px] font-extrabold leading-[1.03] tracking-[-0.032em] text-slate-900 sm:text-[44px] lg:text-[58px]">
							Ship Smarter Across Pakistan
							<span className="mt-1 block text-emerald-700">Labels, Money Orders &amp; Delivery Tracking</span>
						</h1>

						<p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
							Generate labels, create money orders, track parcels and resolve complaints from one powerful dispatch platform.
						</p>

						<form
							onSubmit={handleTrackingSubmit}
							className="mt-5 rounded-3xl border border-slate-200 bg-white/92 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur"
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

						<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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

						<div className="mt-4 grid gap-2 text-sm text-slate-600">
							{trustIndicators.map((item) => (
								<div key={item} className="inline-flex items-center gap-2">
									<CircleCheckBig className="h-4 w-4 text-emerald-600" />
									<span>{item}</span>
								</div>
							))}
						</div>

					</div>

					<div className="relative">
						<div className="rounded-[30px] border border-white/70 bg-white/75 p-3 shadow-[0_35px_90px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-4">
							<div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)] p-3">
								<div className="mb-2 flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3">
									<span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
									<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
									<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
									<span className="ml-3 text-xs font-semibold text-slate-600">Live Product Preview</span>
								</div>

								<div className="relative h-[320px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50/60 p-3">
									{rotatingCards.map((card, idx) => {
										const active = idx === activeCard;
										return (
											<article
												key={card.title}
												className={`absolute inset-3 rounded-2xl transition-all duration-700 ${
													active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
												}`}
											>
												<div className="mb-2 flex items-center justify-between px-1">
													<div>
														<div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{card.title}</div>
														<div className="mt-0.5 text-[11px] text-slate-600">{card.subtitle}</div>
													</div>
												</div>
												{card.content}
											</article>
										);
									})}
								</div>

								<div className="mt-3 flex items-center justify-center gap-1.5">
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
