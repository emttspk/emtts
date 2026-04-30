import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ScanLine, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCANNER_ELEMENT_ID = "home-mobile-tracking-scanner";
const HERO_VISUALS = [
  "/assets/label.png",
  "/assets/money-order.png",
  "/assets/track.png",
  "/assets/dashboard.png",
  "/assets/complaint.png",
  "/assets/package.png",
  "/assets/tracking.png",
];

function parseTrackingScan(decodedText) {
  const raw = String(decodedText || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const fromParams =
        parsed.searchParams.get("tracking") ||
        parsed.searchParams.get("id") ||
        parsed.searchParams.get("ids") ||
        "";
      if (fromParams) {
        return fromParams.split(",")[0].trim();
      }
    } catch {
      // Fall through to token extraction.
    }
  }

  const normalized = raw.replace(/[\n\r\t]+/g, " ").replace(/[,;]+/g, " ").trim();
  const token = normalized
    .split(/\s+/)
    .find((item) => /^[A-Za-z0-9-]{8,}$/.test(item));

  return token || normalized;
}

export default function Hero() {
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [activeVisual, setActiveVisual] = useState(0);

  const scannerRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const didHandleScanRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveVisual((current) => (current + 1) % HERO_VISUALS.length);
    }, 2800);
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

      if (ids.length === 0) return;
      navigate(`/tracking?ids=${encodeURIComponent(ids.join(","))}`);
    },
    [navigate]
  );

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;

    try {
      await scannerRef.current.stop();
    } catch {
      // Scanner can already be stopped.
    }

    try {
      await scannerRef.current.clear();
    } catch {
      // Scanner root can already be cleared.
    }

    scannerRef.current = null;
    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  const closeScanner = useCallback(async () => {
    setScannerOpen(false);
    await stopScanner();
  }, [stopScanner]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;

    async function startScanner() {
      try {
        setScannerError("");
        setScanNotice("");
        didHandleScanRef.current = false;

        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        let cameraConfig = { facingMode: "environment" };
        const cameras = await Html5Qrcode.getCameras();
        if (Array.isArray(cameras) && cameras.length > 0) {
          const rearCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
          cameraConfig = { deviceId: { exact: (rearCamera || cameras[0]).id } };
        }

        await scanner.start(
          cameraConfig,
          {
            fps: 10,
            qrbox: { width: 280, height: 120 },
            aspectRatio: 1.7778,
          },
          (decodedText) => {
            if (didHandleScanRef.current) return;

            const parsedTracking = parseTrackingScan(decodedText);
            if (!parsedTracking || parsedTracking.length < 8) {
              setScannerError("Invalid scan. Try again or type tracking ID manually.");
              return;
            }

            didHandleScanRef.current = true;
            setTrackingId(parsedTracking);
            setScanNotice("Barcode scanned. Submitting...");
            submitTracking(parsedTracking);
            closeScanner();
          },
          () => {}
        );

        scanTimeoutRef.current = window.setTimeout(() => {
          setScannerError("Scanner timed out. Retry scan or enter ID manually.");
        }, 15000);
      } catch (error) {
        const message = String(error && error.message ? error.message : "");
        if (/permission|notallowed|denied/i.test(message)) {
          setScannerError("Camera access denied. Allow permission and try again.");
          return;
        }
        setScannerError("Camera scan unavailable on this device. Use manual tracking input.");
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [closeScanner, scannerOpen, stopScanner, submitTracking]);

  const activeAnimation = ["flip", "fade", "slide"][activeVisual % 3];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(14,116,144,0.18),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(11,107,58,0.18),transparent_30%),linear-gradient(180deg,#f8fcff_0%,#eef7f2_55%,#eef3ff_100%)]">
      <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-12 lg:py-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.03fr_0.97fr]">
          <div>
            <h1 className="text-balance text-4xl font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl lg:text-[3.4rem]">
              Pakistan Post Operations Cloud
            </h1>

            <p className="mt-4 max-w-[720px] text-base font-medium leading-7 text-slate-700 sm:text-lg">
              Complete bulk dispatch software for labels, money orders, parcel tracking, customer complaints, package
              management, and live delivery monitoring.
            </p>

            <p className="mt-2 max-w-[680px] text-sm font-semibold leading-6 text-slate-600 sm:text-base">
              Designed for ecommerce dispatch teams, resellers, and enterprise logistics operators.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitTracking(trackingId);
              }}
              className="mt-6 w-full max-w-[650px] rounded-2xl border border-slate-200/90 bg-white/85 p-2 shadow-[0_14px_40px_rgba(15,23,42,0.10)] backdrop-blur"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="text"
                  value={trackingId}
                  onChange={(event) => setTrackingId(event.target.value)}
                  placeholder="Enter tracking ID"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />

                <button
                  type="submit"
                  className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0b6b3a)] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 md:text-base"
                >
                  <Search className="h-4 w-4" />
                  Track
                </button>

                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700"
                >
                  <ScanLine className="h-4 w-4" />
                  Scan
                </button>
              </div>
            </form>

            {scannerOpen ? (
              <div className="mt-3 w-full max-w-[650px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:max-w-[440px]">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Scan Tracking Barcode</p>
                  <button
                    type="button"
                    onClick={closeScanner}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600"
                    aria-label="Close scanner"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div id={SCANNER_ELEMENT_ID} className="overflow-hidden rounded-xl border border-slate-200" />
                {scannerError ? <p className="mt-2 text-xs font-semibold text-red-600">{scannerError}</p> : null}
                {scanNotice ? <p className="mt-1 text-xs font-semibold text-emerald-700">{scanNotice}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="order-last lg:order-none">
            <div className="relative mx-auto h-[320px] w-full max-w-[540px] sm:h-[390px] md:h-[470px] lg:h-[560px] lg:max-w-[700px]">
              <img
                src="/assets/letter_box.png"
                alt="Letter box frame"
                className="pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"
              />

              <div className="absolute inset-[15%_14%_17%_14%] z-10 overflow-hidden rounded-2xl bg-white/70">
                {HERO_VISUALS.map((visual, index) => {
                  const isActive = index === activeVisual;

                  let transform = "translateX(42px) rotateY(90deg) scale(0.98)";
                  if (activeAnimation === "fade") {
                    transform = isActive ? "translateX(0) rotateY(0deg) scale(1)" : "translateX(0) rotateY(0deg) scale(0.96)";
                  }
                  if (activeAnimation === "slide") {
                    transform = isActive ? "translateX(0) rotateY(0deg) scale(1)" : "translateX(56px) rotateY(0deg) scale(0.98)";
                  }
                  if (activeAnimation === "flip") {
                    transform = isActive ? "translateX(0) rotateY(0deg) scale(1)" : "translateX(26px) rotateY(90deg) scale(0.98)";
                  }

                  return (
                    <img
                      key={visual}
                      src={visual}
                      alt="Operations module preview"
                      className="absolute inset-0 h-full w-full object-contain p-3"
                      style={{
                        opacity: isActive ? 1 : 0,
                        transform,
                        transition: "opacity 680ms ease, transform 760ms ease",
                        transformOrigin: "center",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
