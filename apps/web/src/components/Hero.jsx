import { useEffect, useState } from "react";
import { ArrowRight, Search, ShieldCheck, CircleCheckBig, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import labelImage from "../../../../images/label.png";
import moneyOrderImage from "../../../../images/money order.png";
import trackingImage from "../../../../temp-ui-shots/tracking.png";

const trustIndicators = ["No credit card", "Free forever plan", "Public tracking", "Official Pakistan Post partner"];
const trustBar = [
	"Official Pakistan Post Partner",
	"Secure Dispatch System",
	"No Credit Card Required",
	"Fast Setup",
];

const rotatingCards = [
	{
		title: "Label Preview",
		description: "Official Pakistan Post dispatch label with barcode, value-payable amount, and full recipient details.",
		image: labelImage,
		alt: "Pakistan Post label preview",
	},
	{
		title: "Money Order Preview",
		description: "Official money order sender copy with reference barcode, amount, sender and receiver fields.",
		image: moneyOrderImage,
		alt: "Pakistan Post money order preview",
	},
	{
		title: "Tracking Preview",
		description: "Mapped from the local tracking asset currently available in the workspace.",
		image: trackingImage,
		alt: "Tracking preview asset",
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

	const stackOffsets = [
		"translate-x-0 translate-y-0 rotate-[-2.5deg] scale-100",
		"translate-x-8 translate-y-6 rotate-[4deg] scale-[0.95]",
		"translate-x-16 translate-y-12 rotate-[-5deg] scale-[0.9]",
	];

	return (
		<section className="relative overflow-hidden pb-8 pt-4 lg:pb-10">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(11,107,58,0.16),transparent_24%),linear-gradient(135deg,#f7fbf8_0%,#edf7f2_36%,#eff5ff_100%)]" />
			<div className="pointer-events-none absolute -right-16 top-10 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl" />
			<div className="pointer-events-none absolute left-[-80px] top-[-60px] h-[360px] w-[360px] rounded-full bg-white/80 blur-3xl" />

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
				<div className="grid items-center gap-10 lg:min-h-[600px] lg:grid-cols-2 lg:gap-12">
					<div className="max-w-[580px]">
						<div className="inline-flex items-center gap-3 rounded-full border border-emerald-200/80 bg-white/85 px-3 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] backdrop-blur">
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

						<p className="mt-4 max-w-[520px] text-base leading-7 text-slate-600 sm:text-lg">
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

					<div className="relative flex min-h-[470px] items-center justify-center lg:justify-end">
						<div className="pointer-events-none absolute inset-y-8 right-0 hidden w-[86%] rounded-[40px] bg-white/35 blur-xl lg:block" />
						<div className="relative h-[420px] w-full max-w-[560px]">
							{rotatingCards.map((card, idx) => {
								const order = (idx - activeCard + rotatingCards.length) % rotatingCards.length;
								const isActive = order === 0;
								return (
									<article
										key={card.title}
										className={`absolute left-1/2 top-0 h-[360px] w-[84%] -translate-x-1/2 overflow-hidden rounded-[30px] border border-white/60 bg-white/55 p-3 shadow-[0_35px_80px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all duration-700 ease-out ${stackOffsets[order]} ${
											isActive ? "z-30 opacity-100" : order === 1 ? "z-20 opacity-80" : "z-10 opacity-60"
										}`}
									>
										<div className="flex h-full flex-col rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,247,255,0.92))] p-3">
											<div className="mb-3 flex h-10 items-center rounded-2xl border border-slate-200 bg-white/90 px-3 shadow-sm">
												<span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
												<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
												<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
												<span className="ml-3 truncate text-xs font-semibold text-slate-600">{card.title}</span>
											</div>
											<div className="relative flex-1 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
												<img src={card.image} alt={card.alt} className="h-full w-full rounded-[22px] object-contain bg-white p-2 shadow-sm" />
											</div>
											<div className="mt-3 flex items-start justify-between gap-3 px-1">
												<div>
													<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Live Product Surface</div>
													<div className="mt-1 text-sm font-semibold text-slate-900">{card.title}</div>
													<p className="mt-1 text-xs leading-5 text-slate-600">{card.description}</p>
												</div>
												<div className={`mt-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
													{isActive ? "Active" : "Queued"}
												</div>
											</div>
										</div>
									</article>
								);
							})}

							<div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center justify-center gap-1.5">
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
