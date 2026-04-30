import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const sliderItems = [
	{ title: "Label", image: "/assets/label.png" },
	{ title: "Money Orders", image: "/assets/money-order.png" },
	{ title: "Tracking", image: "/assets/tracking.png" },
	{ title: "Dashboard", image: "/assets/dashboard.png" },
	{ title: "Complaints", image: "/assets/complaint.png" },
	{ title: "Package", image: "/assets/package.png" },
	{ title: "Delivery Monitoring", image: "/assets/tracking.png" },
];

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [activeSlide, setActiveSlide] = useState(0);
	const [mounted, setMounted] = useState(false);
	const navigate = useNavigate();
	const slides = useMemo(() => sliderItems, []);

	useEffect(() => {
		const enter = window.setTimeout(() => setMounted(true), 40);
		return () => window.clearTimeout(enter);
	}, []);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setActiveSlide((prev) => (prev + 1) % slides.length);
		}, 3800);
		return () => window.clearInterval(timer);
	}, [slides.length]);

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

					<div className={`relative flex min-h-[300px] items-center justify-center transition-all duration-700 lg:min-h-[520px] ${mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
						<div className="relative w-full max-w-[660px] overflow-hidden rounded-[30px] border border-white/70 bg-white/80 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:p-4">
							<div className="relative aspect-[16/10] overflow-hidden rounded-[24px] border border-slate-100 bg-slate-100">
								{slides.map((slide, idx) => (
									<img
										key={slide.title}
										src={slide.image}
										alt={slide.title}
										className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${idx === activeSlide ? "opacity-100" : "opacity-0"}`}
									/>
								))}
							</div>

							<div className="mt-4 flex items-center justify-between gap-3">
								<div className="text-sm font-bold text-slate-800">{slides[activeSlide].title}</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length)}
										className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
									>
										Prev
									</button>
									<button
										type="button"
										onClick={() => setActiveSlide((prev) => (prev + 1) % slides.length)}
										className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
									>
										Next
									</button>
								</div>
							</div>

							<div className="mt-3 flex items-center gap-1.5">
								{slides.map((slide, idx) => (
									<span key={slide.title} className={`h-1.5 rounded-full transition-all ${idx === activeSlide ? "w-8 bg-emerald-600" : "w-2 bg-slate-300"}`} />
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
