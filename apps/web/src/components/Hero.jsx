// Hero — SaaS-grade 50/50 layout with adaptive card stack
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import labelImage from "../assets/label.png";
import moneyOrderImage from "../assets/money-order.png";
import trackingImage from "../assets/tracking.png";
import complaintImage from "../assets/complaint.png";
import packageImage from "../assets/package.png";
import deliveryMonitoringImage from "../assets/delivery-monitoring.png";

const rotatingCards = [
	{
		title: "Labels",
		description: "Generate official dispatch labels with barcodes and complete shipment fields.",
		type: "image",
		image: labelImage,
		alt: "Label product preview",
	},
	{
		title: "Money Orders",
		description: "Create sender and receiver money-order documents from the same workflow.",
		type: "image",
		image: moneyOrderImage,
		alt: "Money order product preview",
	},
	{
		title: "Tracking",
		description: "Track live parcel movement with status updates and route visibility.",
		type: "image",
		image: trackingImage,
		alt: "Tracking product preview",
	},
	{
		title: "Complaints",
		description: "Capture complaints with shipment context and operational follow-up states.",
		type: "image",
		image: complaintImage,
		alt: "Complaint product preview",
	},
	{
		title: "Delivery Monitoring",
		description: "Monitor delivery progress and completion trends for active dispatch batches.",
		type: "image",
		image: deliveryMonitoringImage,
		alt: "Delivery monitoring product preview",
	},
	{
		title: "Parcel Booking",
		description: "Book parcel jobs quickly with bulk-ready booking and manifest support.",
		type: "image",
		image: packageImage,
		alt: "Parcel booking product preview",
	},
];

function useImageOrientation(cards) {
	const [orientationMap, setOrientationMap] = useState({});

	useEffect(() => {
		let cancelled = false;
		cards
			.filter((card) => card.type === "image" && card.image)
			.forEach((card) => {
				const img = new Image();
				img.onload = () => {
					if (cancelled) return;
					const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
					const next = ratio > 1.1 ? "landscape" : ratio < 0.9 ? "portrait" : "square";
					setOrientationMap((prev) => {
						if (prev[card.image] === next) return prev;
						return { ...prev, [card.image]: next };
					});
				};
				img.src = card.image;
			});
		return () => { cancelled = true; };
	}, [cards]);

	return orientationMap;
}

function getCardDims(orientation) {
	if (orientation === "landscape") return { wClass: "w-[320px]", hClass: "h-[220px]" };
	if (orientation === "square")    return { wClass: "w-[280px]", hClass: "h-[280px]" };
	return { wClass: "w-[260px]", hClass: "h-[420px]" }; // portrait (default)
}

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [activeCard, setActiveCard] = useState(0);
	const [isFlipping, setIsFlipping] = useState(false);
	const navigate = useNavigate();
	const orientationMap = useImageOrientation(rotatingCards);
	const orderedCards = useMemo(() => rotatingCards, []);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setIsFlipping(true);
			window.setTimeout(() => {
				setActiveCard((prev) => (prev + 1) % orderedCards.length);
				setIsFlipping(false);
			}, 380);
		}, 4000);
		return () => window.clearInterval(timer);
	}, [orderedCards.length]);

	const activeTitle = orderedCards[activeCard]?.title;

	const stepCard = (direction) => {
		setIsFlipping(true);
		window.setTimeout(() => {
			setActiveCard((prev) => {
				if (direction === "next") return (prev + 1) % orderedCards.length;
				return (prev - 1 + orderedCards.length) % orderedCards.length;
			});
			setIsFlipping(false);
		}, 250);
	};

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		const value = trackingId.trim();
		if (!value) return;
		const ids = value.split(',').map(id => id.trim()).filter(Boolean);
		if (ids.length === 0) return;
		if (ids.length > 5) {
			alert('Maximum 5 tracking IDs allowed');
			return;
		}
		navigate(`/tracking?ids=${encodeURIComponent(ids.join(','))}`);
	};

	return (
		<section className="relative overflow-hidden bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(11,107,58,0.16),transparent_24%),linear-gradient(135deg,#f7fbf8_0%,#edf7f2_36%,#eff5ff_100%)]">
			{/* Background depth blobs */}
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_65%_0%,rgba(16,185,129,0.10),transparent_55%)]" />
			<div className="pointer-events-none absolute -right-24 top-8 h-[360px] w-[360px] rounded-full bg-emerald-200/20 blur-3xl" />
			<div className="pointer-events-none absolute -left-16 top-0 h-[320px] w-[320px] rounded-full bg-white/70 blur-3xl" />

			{/* ─── MAIN CONTAINER: max-w-[1440px], strict centering ─── */}
			<div className="relative mx-auto flex h-[calc(100vh-72px)] min-h-[640px] max-h-[760px] w-full max-w-[1440px] items-center px-6 lg:px-12">

				{/* ─── STRICT 50/50 GRID ─── */}
				<div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">

					{/* ════ LEFT — Hero copy + form + CTA ════ */}
					<div className="flex flex-col justify-center">
						{/* Kicker badge */}
						<div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm backdrop-blur">
							<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
							Pakistan Post Logistics Platform
						</div>

						{/* Title — max text-6xl */}
						<h1 className="mt-4 max-w-[540px] font-display text-5xl font-black leading-[1.06] tracking-[-0.04em] text-slate-900 lg:text-6xl">
							Ship Smarter<br />
							<span className="text-emerald-700">Across Pakistan</span>
						</h1>

						{/* Subtext — text-lg */}
						<p className="mt-4 max-w-[500px] text-lg leading-8 text-slate-600">
							Generate labels, create money orders, track parcels, and manage complaints — one clean operations workspace.
						</p>

						{/* Tracking form */}
						<form
							onSubmit={handleTrackingSubmit}
							className="mt-6 rounded-[20px] border border-emerald-100/80 bg-white/90 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.09)] backdrop-blur"
						>
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Live Tracking</div>
							<div className="mt-2 flex items-center gap-2">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
									placeholder="Tracking ID or comma-separated (max 5)"
									className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
								/>
								<button
									type="submit"
									className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5"
								>
									<Search className="h-3.5 w-3.5" />
									Track
								</button>
							</div>
							<p className="mt-1.5 text-[11px] text-slate-400">No login required</p>
						</form>

						{/* CTA buttons — single horizontal line */}
						<div className="mt-5 flex flex-row items-center gap-3">
							<a
								href="/register"
								className="inline-flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.32)]"
							>
								Create Free Account
								<ArrowRight className="h-4 w-4" />
							</a>
							<a
								href="/login"
								className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white/80 px-6 text-sm font-semibold text-slate-700 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-slate-800 hover:text-slate-900"
							>
								Sign In
							</a>
						</div>
					</div>

					{/* ════ RIGHT — Adaptive product card stack ════ */}
					<div className="relative hidden h-full items-center justify-center lg:flex">
						{/* Soft glass backdrop behind stack */}
						<div className="pointer-events-none absolute inset-x-6 inset-y-4 rounded-[40px] bg-white/25 shadow-[0_0_80px_rgba(16,185,129,0.08)] backdrop-blur-sm" />

						{/* Stack container — accommodates tallest card (portrait 420px) + depth + nav */}
						<div className="relative h-[510px] w-full max-w-[420px]">

							{orderedCards.map((card, idx) => {
								const order = (idx - activeCard + orderedCards.length) % orderedCards.length;
								if (order > 2) return null;

								const isActive = order === 0;
								const orientation = orientationMap[card.image] ?? "portrait";
								const { wClass, hClass } = getCardDims(orientation);

								const zIndex   = orderedCards.length - order;
								const translateY = order * 22;
								const scale    = isActive ? 1 : 1 - order * 0.03;
								const opacity  = isActive ? 1 : order === 1 ? 0.70 : 0.40;
								const rotate   = isActive && isFlipping ? "rotateY(90deg)" : "rotateY(0deg)";

								return (
									<article
										key={card.title}
										className={`absolute left-1/2 top-[28px] ${wClass} ${hClass} overflow-hidden rounded-[26px] border border-white/80 bg-white/92 shadow-[0_28px_70px_rgba(15,23,42,0.20),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition-all duration-700 ease-out`}
										style={{
											zIndex,
											opacity,
											transform: `translateX(-50%) translateY(${translateY}px) scale(${scale})`,
										}}
									>
										{/* Chrome title bar */}
										<div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-slate-100/80 bg-white/95 px-3">
											<span className="h-2 w-2 rounded-full bg-rose-400" />
											<span className="h-2 w-2 rounded-full bg-amber-400" />
											<span className="h-2 w-2 rounded-full bg-emerald-400" />
											{isActive && (
												<span className="ml-2 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
													{card.title}
												</span>
											)}
										</div>

										{/* Flip wrapper */}
										<div className="relative h-[calc(100%-2rem)] w-full [perspective:1400px]">
											<div
												className="h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
												style={{ transform: rotate }}
											>
												{/* Front — full image, no crop */}
												<div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(150deg,rgba(255,255,255,0.97),rgba(239,246,255,0.94))] p-4 [backface-visibility:hidden]">
													<div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.10),transparent_48%),radial-gradient(circle_at_85%_88%,rgba(37,99,235,0.08),transparent_44%)]" />
													<div className="relative h-full w-full overflow-hidden rounded-[14px] border border-slate-200/60 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)]">
														<img
															src={card.image}
															alt={card.alt}
															className="h-full w-full object-contain object-center p-2"
														/>
													</div>
												</div>

												{/* Back — description */}
												<div className="absolute inset-0 flex items-end bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(236,253,245,0.95))] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
													<div className="w-full rounded-[16px] border border-emerald-100 bg-white/90 p-4 shadow-[0_10px_26px_rgba(15,23,42,0.10)]">
														<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Live Product</div>
														<div className="mt-1 text-sm font-bold text-slate-900">{card.title}</div>
														<p className="mt-1 text-xs leading-5 text-slate-600">{card.description}</p>
													</div>
												</div>
											</div>
										</div>
									</article>
								);
							})}

							{/* Active product title badge */}
							<div className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-100 bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm backdrop-blur">
								{activeTitle}
							</div>

							{/* Navigation controls */}
							<div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2">
								<button
									type="button"
									onClick={() => stepCard("prev")}
									className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400"
									aria-label="Previous product"
								>
									<ArrowLeft className="h-3.5 w-3.5" />
								</button>
								{orderedCards.map((card, idx) => (
									<span
										key={card.title}
										className={`h-1.5 rounded-full transition-all duration-300 ${idx === activeCard ? "w-6 bg-emerald-600" : "w-2 bg-slate-300"}`}
									/>
								))}
								<button
									type="button"
									onClick={() => stepCard("next")}
									className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400"
									aria-label="Next product"
								>
									<ArrowRight className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					</div>

				</div>
			</div>
		</section>
	);
}
