import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, ShieldCheck, WalletCards, UserCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdaptiveImageRenderer from "./AdaptiveImageRenderer";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";
import complaintImage from "../assets/complaint.png";
import packageImage from "../assets/package.png";
import deliveryMonitoringImage from "../assets/delivery-monitoring.png";

const rotatingCards = [
	{
		title: "Labels",
		description: "Dispatch-ready labels with barcode and clean print accuracy.",
		image: labelImage,
		alt: "Label product preview",
		cta: "/register",
	},
	{
		title: "Money Orders",
		description: "Aligned MO forms with shipment-linked value and references.",
		image: moneyOrderImage,
		alt: "Money order product preview",
		cta: "/register",
	},
	{
		title: "Tracking",
		description: "Real-time route updates and status history from one panel.",
		image: trackingImage,
		alt: "Tracking product preview",
		cta: "/tracking",
	},
	{
		title: "Complaints",
		description: "Structured complaint intake with follow-up lifecycle visibility.",
		image: complaintImage,
		alt: "Complaint product preview",
		cta: "/register",
	},
	{
		title: "Parcel Booking",
		description: "Fast parcel booking for operational teams and high daily volume.",
		image: packageImage,
		alt: "Parcel booking product preview",
		cta: "/register",
	},
	{
		title: "Profile",
		description: "Sender identity, company details, and defaults in one place.",
		icon: UserCircle2,
		cta: "/register",
	},
	{
		title: "Billing",
		description: "Usage visibility, package updates, and billing control points.",
		icon: WalletCards,
		cta: "/register",
	},
	{
		title: "Packages",
		description: "Plan tiers tuned for dispatch units and growth-ready scale.",
		icon: ShieldCheck,
		cta: "/register",
	},
];

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [activeCard, setActiveCard] = useState(0);
	const [isChanging, setIsChanging] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [parallax, setParallax] = useState({ x: 0, y: 0 });
	const navigate = useNavigate();
	const orderedCards = useMemo(() => rotatingCards, []);

	useEffect(() => {
		const enter = window.setTimeout(() => setMounted(true), 40);
		return () => window.clearTimeout(enter);
	}, []);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setIsChanging(true);
			window.setTimeout(() => {
				setActiveCard((prev) => (prev + 1) % orderedCards.length);
				setIsChanging(false);
			}, 300);
		}, 4300);
		return () => window.clearInterval(timer);
	}, [orderedCards.length]);

	const activeItem = orderedCards[activeCard];
	const floatingOffset = Math.sin((activeCard + 1) * 0.85) * 5;

	const stepCard = (direction) => {
		setIsChanging(true);
		window.setTimeout(() => {
			setActiveCard((prev) => {
				if (direction === "next") return (prev + 1) % orderedCards.length;
				return (prev - 1 + orderedCards.length) % orderedCards.length;
			});
			setIsChanging(false);
		}, 250);
	};

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		const value = trackingId.trim();
		if (!value) return;
		const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
		if (ids.length === 0) return;
		if (ids.length > 5) {
			alert("Maximum 5 tracking IDs allowed");
			return;
		}
		navigate(`/tracking?ids=${encodeURIComponent(ids.join(","))}`);
	};

	const handleParallaxMove = (event) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
		const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
		setParallax({ x, y });
	};

	const resetParallax = () => setParallax({ x: 0, y: 0 });

	return (
		<section className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_18%,rgba(16,185,129,0.18),transparent_31%),radial-gradient(circle_at_88%_18%,rgba(14,116,144,0.15),transparent_28%),linear-gradient(180deg,#f7fbf8_0%,#edf7f2_44%,#eef2ff_100%)]">
			<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.42),transparent_45%,rgba(255,255,255,0.2)_100%)]" />

			<div className="relative mx-auto w-full max-w-[1440px] px-6 lg:px-12">
				<div className="grid items-center gap-8 overflow-hidden py-8 lg:h-[calc(100vh-76px)] lg:max-h-[820px] lg:grid-cols-[48fr_52fr] lg:gap-12 lg:py-6">
					<div
						className={`flex min-w-0 flex-col justify-center transition-all duration-700 ${mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
					>

					<h1 className="mt-4 max-w-[540px] font-display text-[2.4rem] font-black leading-[1.04] tracking-[-0.04em] text-slate-900 sm:text-5xl lg:text-[3.6rem]">
						Pakistan Post
						<span className="block bg-[linear-gradient(135deg,#0b6b3a,#0f4c81)] bg-clip-text text-transparent">Ops Cloud</span>
					</h1>

					<p className="mt-3 max-w-[480px] text-base leading-7 text-slate-600 sm:text-[1.05rem]">
							Labels, money orders, tracking, and complaints in one premium operational surface.
						</p>

						<form
							onSubmit={handleTrackingSubmit}
							className="mt-5 w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_12px_36px_rgba(15,23,42,0.10)]"
						>
							<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
								placeholder="Enter tracking ID (or up to 5, comma-separated)"
								className="h-11 w-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 sm:w-auto"
							/>
							<button
								type="submit"
								className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(11,107,58,0.30)] transition hover:-translate-y-0.5 sm:w-auto"
								>
									<Search className="h-4 w-4" />
									Track
								</button>
							</div>
						</form>

						<div className="mt-4 flex flex-wrap items-center gap-3">
							<a
								href="/register"
								className="inline-flex h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(11,107,58,0.34)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(11,107,58,0.42)]"
							>
								Create Free Account
								<ArrowRight className="h-4 w-4" />
							</a>
							<a
								href="/login"
								className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:text-emerald-800"
							>
								Login
							</a>
						</div>
					</div>

					<div
						onMouseMove={handleParallaxMove}
						onMouseLeave={resetParallax}
						className={`relative flex min-h-[260px] items-center justify-center overflow-visible transition-all duration-700 lg:min-h-[500px] ${mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
					>
					<div
						className="relative w-full max-w-[560px] overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/80 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.18),0_6px_20px_rgba(15,23,42,0.09)] backdrop-blur-xl lg:max-w-[640px] lg:rounded-[34px] lg:p-4"
						style={{
							height: "min(72vw, 560px)",
							minHeight: "260px",
								transform: `translate3d(${parallax.x}px, ${parallax.y + floatingOffset}px, 0)`,
								transition: "transform 280ms ease",
							}}
						>
							<div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(140deg,rgba(255,255,255,0.58),rgba(255,255,255,0.16))]" />
							<div className="relative h-full">
							{orderedCards.map((card, idx) => {
								const order = (idx - activeCard + orderedCards.length) % orderedCards.length;
								if (order > 2) return null;

								const zIndex = orderedCards.length - order;
								const translateY = order * 24;
								const scale = 1 - order * 0.04;
								const opacity = order === 0 ? 1 : order === 1 ? 0.76 : 0.45;
								const rotate = order === 0 ? 0 : order === 1 ? -3 : 3;

								return (
									<article
										key={card.title}
										className="absolute left-1/2 top-8 w-[94%] max-w-[560px] overflow-hidden rounded-[30px] border border-white/80 bg-white/92 shadow-[0_26px_74px_rgba(15,23,42,0.22)] transition-all duration-700"
										style={{
											zIndex,
											opacity,
											transform: `translateX(-50%) translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
										}}
									>
										<div className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3">
											<div className="flex items-center gap-1.5">
												<span className="h-2.5 w-2.5 rounded-full bg-red-300" />
												<span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
												<span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
											</div>
											<div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.title}</div>
										</div>

										<div className="relative p-4">
											{card.image ? (
												<AdaptiveImageRenderer
													src={card.image}
													alt={card.alt}
													className="mx-auto w-full max-w-[460px]"
													frameClassName="shadow-[0_10px_30px_rgba(15,23,42,0.1)]"
													imageClassName={isChanging && order === 0 ? "scale-[0.98] opacity-80 transition" : "transition"}
												/>
											) : (
												<div className="mx-auto flex aspect-[16/10] w-full max-w-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-[linear-gradient(140deg,#f8fafc_0%,#ecfdf5_100%)]">
													<card.icon className="h-16 w-16 text-emerald-600" />
												</div>
											)}

											<div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
												<p className="text-xs leading-5 text-slate-600">{card.description}</p>
												<a href={card.cta} className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
													Open
												</a>
											</div>
										</div>
									</article>
								);
							})}

							<div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
								<button
									type="button"
									onClick={() => stepCard("prev")}
									className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5"
									aria-label="Previous product"
								>
									<ArrowLeft className="h-4 w-4" />
								</button>
								{orderedCards.map((card, idx) => (
									<span
										key={card.title}
										className={`h-1.5 rounded-full transition-all ${idx === activeCard ? "w-6 bg-emerald-600" : "w-2 bg-slate-300"}`}
									/>
								))}
								<button
									type="button"
									onClick={() => stepCard("next")}
									className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5"
									aria-label="Next product"
								>
									<ArrowRight className="h-4 w-4" />
								</button>
							</div>

							<div className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 rounded-full border border-emerald-100 bg-white/92 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
								{activeItem?.title}
							</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
