import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ScanLine, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCANNER_ELEMENT_ID = "mobile-tracking-scanner";

export default function Hero() {
	const [trackingId, setTrackingId] = useState("");
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scannerError, setScannerError] = useState("");
	const [mounted, setMounted] = useState(false);
	const scannerRef = useRef(null);
	const navigate = useNavigate();

	useEffect(() => {
		const enter = window.setTimeout(() => setMounted(true), 40);
		return () => window.clearTimeout(enter);
	}, []);

	const submitTrackingValue = useCallback((rawValue) => {
		const value = (rawValue || "").trim();
		if (!value) return;
		const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
		if (ids.length === 0) return;
		if (ids.length > 5) {
			alert("Maximum 5 tracking IDs allowed");
			return;
		}
		navigate(`/tracking?ids=${encodeURIComponent(ids.join(","))}`);
	}, [navigate]);

	const stopScanner = useCallback(async () => {
		if (!scannerRef.current) return;
		try {
			await scannerRef.current.stop();
		} catch {
			// ignore stop errors when scanner is already stopped
		}
		try {
			await scannerRef.current.clear();
		} catch {
			// ignore clear errors during scanner teardown
		}
		scannerRef.current = null;
	}, []);

	const closeScanner = useCallback(async () => {
		setScannerOpen(false);
		await stopScanner();
	}, [stopScanner]);

	useEffect(() => {
		if (!scannerOpen) return;
		let cancelled = false;

		const startScanner = async () => {
			try {
				setScannerError("");
				const { Html5Qrcode } = await import("html5-qrcode");
				if (cancelled) return;

				const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
				scannerRef.current = scanner;

				await scanner.start(
					{ facingMode: "environment" },
					{ fps: 10, qrbox: { width: 260, height: 110 } },
					(decodedText) => {
						setTrackingId(decodedText);
						submitTrackingValue(decodedText);
						closeScanner();
					},
					() => {}
				);
			} catch {
				setScannerError("Camera scan is unavailable. Please enter tracking ID manually.");
			}
		};

		startScanner();

		return () => {
			cancelled = true;
			stopScanner();
		};
	}, [closeScanner, scannerOpen, stopScanner, submitTrackingValue]);

	const handleTrackingSubmit = (event) => {
		event.preventDefault();
		submitTrackingValue(trackingId);
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
							<div className="flex flex-col gap-2 md:flex-row md:items-center">
								<input
									type="text"
									value={trackingId}
									onChange={(event) => setTrackingId(event.target.value)}
									placeholder="Enter tracking ID (or up to 5, comma-separated)"
									className="h-14 min-h-[56px] w-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
							/>
								<div className="flex w-full gap-2 md:w-auto">
									<button
										type="submit"
										className="inline-flex h-14 min-h-[56px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-base font-bold text-white shadow-[0_8px_20px_rgba(11,107,58,0.30)] transition hover:-translate-y-0.5 md:w-auto"
									>
										<Search className="h-4 w-4" />
										Track
									</button>
									<button
										type="button"
										onClick={() => setScannerOpen(true)}
										className="inline-flex h-14 min-h-[56px] w-14 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 md:hidden"
										aria-label="Scan barcode"
									>
										<ScanLine className="h-5 w-5" />
									</button>
								</div>
							</div>
						</form>

						{scannerOpen ? (
							<div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 md:hidden">
								<div className="mb-2 flex items-center justify-between">
									<div className="text-sm font-semibold text-slate-800">Scan Tracking Barcode</div>
									<button
										type="button"
										onClick={closeScanner}
										className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600"
										aria-label="Close scanner"
									>
										<X className="h-4 w-4" />
									</button>
								</div>
								<div id={SCANNER_ELEMENT_ID} className="overflow-hidden rounded-xl border border-slate-200" />
								{scannerError ? <p className="mt-2 text-xs font-medium text-red-600">{scannerError}</p> : null}
							</div>
						) : null}

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
						<div className="relative w-full max-w-[660px] rounded-[30px] border border-white/70 bg-white/80 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:p-6">
							<div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 lg:min-h-[460px]">
								<img src="/assets/letter_box.png" alt="Letter Box" className="h-full w-full object-contain p-2 lg:p-4" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
