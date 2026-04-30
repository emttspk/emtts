import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ScanLine, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCANNER_CONTAINER_ID = "home-scan-fallback";

const HERO_PRODUCTS = [
  "/assets/label.png",
  "/assets/money-order.png",
  "/assets/track.png",
  "/assets/dashboard.png",
  "/assets/complaint.png",
  "/assets/package.png",
  "/assets/tracking.png",
];

function parseScannedTracking(decodedText) {
  const raw = String(decodedText || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const queryValue =
        url.searchParams.get("tracking") ||
        url.searchParams.get("id") ||
        url.searchParams.get("ids") ||
        "";
      if (queryValue) return queryValue.split(",")[0].trim();
    } catch {
      // URL parse failure should not block token extraction.
    }
  }

  const normalized = raw.replace(/[\n\r\t]+/g, " ").replace(/[,;]+/g, " ").trim();
  const token = normalized.split(/\s+/).find((item) => /^[A-Za-z0-9-]{8,}$/.test(item));
  return token || normalized;
}

export default function HomeHero() {
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState("");
  const [activeCard, setActiveCard] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerNotice, setScannerNotice] = useState("");

  const fallbackScannerRef = useRef(null);
  const detectorTimerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanHandledRef = useRef(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveCard((current) => (current + 1) % HERO_PRODUCTS.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, []);

  const submitTracking = useCallback(
    (rawValue) => {
      const value = String(rawValue || "").trim();
      if (!value) return;
      const ids = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (!ids.length) return;
      navigate(`/tracking?ids=${encodeURIComponent(ids.join(","))}`);
    },
    [navigate]
  );

  const stopScanner = useCallback(async () => {
    if (detectorTimerRef.current) {
      window.clearInterval(detectorTimerRef.current);
      detectorTimerRef.current = null;
    }

    if (fallbackScannerRef.current) {
      try {
        await fallbackScannerRef.current.stop();
      } catch {
        // Scanner can already be stopped.
      }
      try {
        await fallbackScannerRef.current.clear();
      } catch {
        // Scanner can already be cleared.
      }
      fallbackScannerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const completeScan = useCallback(
    (decodedText) => {
      if (scanHandledRef.current) return;
      const tracking = parseScannedTracking(decodedText);
      if (!tracking || tracking.length < 8) {
        setScannerError("Invalid barcode. Try again or enter tracking ID manually.");
        return;
      }

      scanHandledRef.current = true;
      setTrackingId(tracking);
      setScannerNotice("Scan successful. Redirecting to tracking...");
      submitTracking(tracking);
      setScannerOpen(false);
      stopScanner();
    },
    [stopScanner, submitTracking]
  );

  const startBarcodeDetector = useCallback(async () => {
    if (!("BarcodeDetector" in window) || !videoRef.current) return false;

    try {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      const preferredFormats = ["code_128", "qr_code", "ean_13", "upc_a"];
      const formats = preferredFormats.filter((fmt) => supportedFormats.includes(fmt));
      const detector = new window.BarcodeDetector({ formats: formats.length ? formats : supportedFormats });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      detectorTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || scanHandledRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            completeScan(barcodes[0].rawValue);
          }
        } catch {
          // Ignore transient detector frame errors.
        }
      }, 300);

      return true;
    } catch (error) {
      const message = String(error?.message || "");
      if (/permission|denied|notallowed/i.test(message)) {
        setScannerError("Camera access denied. Enable camera permission to scan.");
      }
      return false;
    }
  }, [completeScan]);

  const startHtml5Fallback = useCallback(async () => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_CONTAINER_ID);
      fallbackScannerRef.current = scanner;

      let cameraConfig = { facingMode: "environment" };
      const cameras = await Html5Qrcode.getCameras();
      if (Array.isArray(cameras) && cameras.length > 0) {
        const rearCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
        cameraConfig = { deviceId: { exact: (rearCamera || cameras[0]).id } };
      }

      await scanner.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.7778 },
        (decodedText) => completeScan(decodedText),
        () => {}
      );
    } catch (error) {
      const message = String(error?.message || "");
      if (/permission|denied|notallowed/i.test(message)) {
        setScannerError("Camera access denied. Enable camera permission to scan.");
        return;
      }
      setScannerError("Scanner unavailable on this device. Enter tracking ID manually.");
    }
  }, [completeScan]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;

    async function startScanner() {
      setScannerError("");
      setScannerNotice("");
      scanHandledRef.current = false;

      const startedWithDetector = await startBarcodeDetector();
      if (!startedWithDetector && !cancelled) {
        await startHtml5Fallback();
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerOpen, startBarcodeDetector, startHtml5Fallback, stopScanner]);

  const animationStyle = useMemo(() => ["flip", "rotate", "float"][activeCard % 3], [activeCard]);

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_8%_10%,rgba(6,182,212,0.18),transparent_32%),radial-gradient(circle_at_90%_8%,rgba(16,185,129,0.16),transparent_30%),linear-gradient(180deg,#f7fcff_0%,#eef8f3_44%,#eef4ff_100%)]">
      <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6 lg:px-12 lg:py-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Pakistan Post Platform</p>
            <h1 className="mt-3 text-balance text-4xl font-black tracking-[-0.03em] text-slate-950 sm:text-5xl lg:text-[3.35rem]">
              Pakistan Post Operations Cloud
            </h1>
            <p className="mt-4 max-w-[760px] text-base leading-7 text-slate-700 sm:text-lg">
              Complete dispatch software for labels, money orders, parcel tracking, customer complaints, package
              management, and live monitoring.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitTracking(trackingId);
              }}
              className="mt-6 max-w-[680px] rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-[0_16px_44px_rgba(15,23,42,0.12)] backdrop-blur"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="text"
                  value={trackingId}
                  onChange={(event) => setTrackingId(event.target.value)}
                  placeholder="Enter tracking ID"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />

                <button
                  type="submit"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5"
                >
                  <Search className="h-4 w-4" />
                  Track
                </button>

                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  <ScanLine className="h-4 w-4" />
                  Scan Barcode
                </button>
              </div>
            </form>

            {scannerOpen ? (
              <div className="mt-3 max-w-[680px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Scan Tracking Barcode</p>
                  <button
                    type="button"
                    onClick={() => {
                      setScannerOpen(false);
                      stopScanner();
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600"
                    aria-label="Close scanner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <video ref={videoRef} className="mb-3 h-48 w-full rounded-xl border border-slate-200 object-cover" playsInline muted />
                <div id={SCANNER_CONTAINER_ID} className="overflow-hidden rounded-xl border border-slate-200" />
                {scannerError ? <p className="mt-2 text-xs font-semibold text-red-600">{scannerError}</p> : null}
                {scannerNotice ? <p className="mt-1 text-xs font-semibold text-emerald-700">{scannerNotice}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="relative flex items-center justify-center">
            <div className="relative h-[360px] w-full max-w-[560px] sm:h-[420px]">
              <div className="absolute inset-0 -z-20 rounded-3xl bg-white/60 shadow-[0_26px_60px_rgba(15,23,42,0.16)] backdrop-blur-sm" />
              <div className="absolute inset-0 -z-10 translate-x-4 translate-y-4 rounded-3xl border border-slate-200 bg-white/45" />

              {HERO_PRODUCTS.map((image, index) => {
                const isActive = index === activeCard;
                const baseTransform =
                  animationStyle === "flip"
                    ? isActive
                      ? "translateX(0) rotateY(0deg)"
                      : "translateX(26px) rotateY(90deg)"
                    : animationStyle === "rotate"
                      ? isActive
                        ? "translateX(0) rotate(0deg)"
                        : "translateX(18px) rotate(10deg)"
                      : isActive
                        ? "translateY(0) scale(1)"
                        : "translateY(14px) scale(0.97)";

                return (
                  <img
                    key={image}
                    src={image}
                    alt="Product card"
                    className="absolute inset-0 h-full w-full object-contain p-7"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: baseTransform,
                      transition: "opacity 620ms ease, transform 760ms ease",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}