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

const layerGap = 20;

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
					const next = img.naturalWidth >= img.naturalHeight ? "horizontal" : "vertical";
					setOrientationMap((prev) => {
						if (prev[card.image] === next) return prev;
						return { ...prev, [card.image]: next };
					});
				};
				img.src = card.image;
			});

		return () => {
			cancelled = true;
		};
	}, [cards]);

	return orientationMap;
}

function renderCardSurface(card, orientation) {
	const isVertical = orientation === "vertical";
	const frameClass = isVertical
		? "h-[320px] w-[58%] max-w-[230px]"
		: "h-[260px] w-[92%] max-w-[460px]";

	return (
		<div className="relative flex h-full items-center justify-center overflow-hidden rounded-[24px] border border-white/75 bg-[linear-gradient(150deg,rgba(255,255,255,0.96),rgba(239,246,255,0.93))] shadow-[0_24px_65px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.86)]">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_14%,rgba(16,185,129,0.16),transparent_52%),radial-gradient(circle_at_86%_85%,rgba(37,99,235,0.14),transparent_48%)]" />
			<div className="relative flex h-full w-full items-center justify-center px-4 py-5">
				<div className={`${frameClass} overflow-hidden rounded-[18px] border border-slate-200/75 bg-white/95 shadow-[0_14px_36px_rgba(15,23,42,0.12)]`}>
					<div className="flex h-full w-full items-center justify-center p-3">
						<img src={card.image} alt={card.alt} className="h-full w-full object-contain object-center" />
					</div>
				</div>
			</div>
		</div>
	);
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
		}, 3600);
		return () => {
			window.clearInterval(timer);
		};
	}, [orderedCards.length]);

	const activeTitle = orderedCards[activeCard]?.title;

	const stepCard = (direction) => {
		setIsFlipping(true);
		window.setTimeout(() => {
			setActiveCard((prev) => {
				if (direction === "next") {
					return (prev + 1) % orderedCards.length;
				}
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
		<section className="relative overflow-hidden pb-6 pt-2 lg:pb-8 lg:pt-4">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(11,107,58,0.16),transparent_24%),linear-gradient(135deg,#f7fbf8_0%,#edf7f2_36%,#eff5ff_100%)]" />
			<div className="pointer-events-none absolute -right-16 top-10 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl" />
			<div className="pointer-events-none absolute left-[-80px] top-[-60px] h-[360px] w-[360px] rounded-full bg-white/80 blur-3xl" />

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
				<div className="grid items-stretch gap-6 lg:min-h-[560px] lg:grid-cols-2 lg:gap-8">
					<div className="flex h-full items-center">
						<div className="w-full max-w-[620px]">
						<h1 className="max-w-[600px] font-display text-[34px] font-black leading-[1.08] tracking-[-0.035em] text-slate-900 sm:text-[44px] lg:text-[56px]">
							Ship Smarter Across Pakistan
							<span className="mt-1 block text-emerald-700">Labels, Money Orders &amp; Delivery Tracking</span>
						</h1>

						<p className="mt-4 max-w-[540px] text-[15px] leading-7 text-slate-600 sm:text-[17px] sm:leading-8">Generate labels, create money orders, track parcels, and manage complaints from one clean operations surface.</p>

						<form
							onSubmit={handleTrackingSubmit}
							className="mt-5 rounded-[24px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,250,247,0.96))] p-3.5 shadow-[0_18px_36px_rgba(15,23,42,0.1)] backdrop-blur"
						>
							<div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tracking Search</div>
							<div className="mt-2.5 grid grid-cols-1 items-center gap-2.5 sm:grid-cols-[7fr_3fr]">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
									placeholder="Enter tracking ID or comma-separated (max 5)"
									className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
								/>
								<button
									type="submit"
									className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
								>
									<Search className="h-4 w-4" />
									Track Now
								</button>
							</div>
							<p className="mt-2 text-xs text-slate-500">without login</p>
						</form>

						<div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
							<a
								href="/register"
								className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.34)]"
							>
								Create Free Account
								<ArrowRight className="h-4 w-4" />
							</a>
							<a href="/login" className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-800 hover:text-slate-900">Sign In</a>
						</div>
						</div>
					</div>

					<div className="relative flex h-full min-h-[520px] items-center justify-center lg:justify-end">
						<div className="pointer-events-none absolute inset-y-5 right-0 hidden w-[95%] rounded-[40px] bg-white/35 blur-xl lg:block" />
						<div data-hero-stack="true" className="relative h-[500px] w-full max-w-[650px]">
							{orderedCards.map((card, idx) => {
								const order = (idx - activeCard + orderedCards.length) % orderedCards.length;
								const isActive = order === 0;
								const zIndex = orderedCards.length - order;
								const translateY = order * layerGap;
								const scale = isActive ? 1 : 0.965;
								const opacity = isActive ? 1 : Math.max(0.24, 0.88 - order * 0.16);
								const rotate = isActive && isFlipping ? "rotateY(180deg)" : "rotateY(0deg)";
								const orientation = orientationMap[card.image];
								return (
									<article
										key={card.title}
										data-hero-card={card.title}
										className="absolute left-1/2 top-0 h-[420px] w-[95%] -translate-x-1/2 overflow-hidden rounded-[30px] border border-white/75 bg-white/84 p-4 shadow-[0_38px_110px_rgba(15,23,42,0.24)] backdrop-blur-xl transition-all duration-700 ease-out"
										style={{ zIndex, opacity, transform: `translateX(-50%) translateY(${translateY}px) scale(${scale})` }}
									>
										<div className="flex h-full flex-col rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,247,255,0.92))] p-3">
											<div className="mb-2.5 flex h-9 items-center rounded-2xl border border-slate-200 bg-white/90 px-3 shadow-sm">
												<span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
												<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
												<span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
												<span className="ml-3 truncate text-xs font-semibold text-slate-600">{card.title}</span>
											</div>
											<div className="relative h-full [perspective:1600px]">
												<div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: rotate }}>
													<div className="absolute inset-0 [backface-visibility:hidden]">
														{renderCardSurface(card, orientation)}
													</div>
													<div className="absolute inset-0 flex items-end [backface-visibility:hidden] [transform:rotateY(180deg)]">
														<div className="w-full rounded-[22px] border border-emerald-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(236,253,245,0.93))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.14)]">
															<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Live Product Surface</div>
															<div className="mt-1 text-lg font-semibold text-slate-900">{card.title}</div>
															<p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
														</div>
													</div>
												</div>
											</div>
										</div>
									</article>
								);
							})}

							<div className="absolute bottom-0 left-1/2 flex w-full max-w-[300px] -translate-x-1/2 items-center justify-center gap-2">
								<button
									type="button"
									onClick={() => stepCard("prev")}
									className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-sm transition hover:-translate-y-0.5"
									aria-label="Show previous product"
								>
									<ArrowLeft className="h-4 w-4" />
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
									className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-sm transition hover:-translate-y-0.5"
									aria-label="Show next product"
								>
									<ArrowRight className="h-4 w-4" />
								</button>
								</div>

							<div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full border border-emerald-100 bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 shadow-sm">
								{activeTitle}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
