import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ScanLine, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SCANNER_CONTAINER_ID = "home-scan-fallback";

const DASHBOARD_TRACKING_ROWS = [
  { id: "TRK-98231", city: "Lahore", status: "In Transit", eta: "Today" },
  { id: "TRK-98244", city: "Karachi", status: "Pending", eta: "1d" },
  { id: "TRK-98258", city: "Islamabad", status: "Delivered", eta: "Done" },
  { id: "TRK-98263", city: "Multan", status: "Returned", eta: "Review" },
];

const DASHBOARD_COMPLAINT_QUEUE = [
  { id: "CMP-112", issue: "Wrong Delivery City", sla: "2h" },
  { id: "CMP-118", issue: "Parcel Delay", sla: "4h" },
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerNotice, setScannerNotice] = useState("");

  const fallbackScannerRef = useRef(null);
  const detectorTimerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanHandledRef = useRef(false);
  const videoRef = useRef(null);

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

  const servicePills = [
     "Labels",
     "Money Orders",
     "Tracking",
     "Complaints",
     "Billing",
  ];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(14,165,164,0.16),transparent_36%),radial-gradient(circle_at_90%_8%,rgba(15,23,42,0.14),transparent_34%),linear-gradient(175deg,#f6fbff_0%,#edf5ff_48%,#eef8f3_100%)]">
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:34px_34px] opacity-35" />
      <div className="mx-auto max-w-[1320px] px-4 py-7 md:px-6 md:py-9 lg:px-10 lg:py-12">
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr] lg:gap-6">
          <div>
            <p className="inline-flex items-center rounded-full border border-teal-200 bg-white/92 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700 shadow-sm sm:text-[11px]">
              Pakistan Post Operations Platform
            </p>
            <h1 className="mt-2.5 text-[29px] font-black leading-[1.08] tracking-[-0.03em] text-slate-950 sm:text-[42px] lg:text-[52px]">
              <span className="sm:hidden">Ship, Track, Resolve</span>
              <span className="hidden sm:inline">Ship, Track, and Resolve Parcels Faster</span>
            </h1>
            <p className="mt-3 max-w-[640px] text-[14px] leading-6 text-slate-700 sm:text-[16px] sm:leading-7">
              Generate labels, track bulk parcels, manage complaints, and monitor billing from one workspace.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
              {servicePills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-slate-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-700 shadow-sm sm:px-3 sm:py-1.5 sm:text-[11px]"
                >
                  {pill}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:gap-2.5">
              <a
                href="/register"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f172a,#0f766e)] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5"
              >
                Start Free
              </a>
              <a
                href="/tracking"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-700"
              >
                Track Parcel
              </a>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitTracking(trackingId);
              }}
              className="mt-4 max-w-[680px] rounded-2xl border border-slate-200 bg-white/88 p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur sm:mt-5 sm:p-2"
            >
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Track Parcel</p>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="text"
                  value={trackingId}
                  onChange={(event) => setTrackingId(event.target.value)}
                  placeholder="Enter tracking ID"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100 sm:h-12 sm:px-4"
                />

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f172a,#0f766e)] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 sm:h-12"
                >
                  <Search className="h-4 w-4" />
                  Track
                </button>

                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-700 sm:h-12"
                >
                  <ScanLine className="h-4 w-4" />
                  Scan Barcode
                </button>
              </div>
            </form>

            {scannerOpen ? (
              <div className="mt-3 max-w-[680px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Scan Barcode</p>
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
                <video ref={videoRef} className="mb-3 h-40 w-full rounded-xl border border-slate-200 object-cover sm:h-48" playsInline muted />
                <div id={SCANNER_CONTAINER_ID} className="overflow-hidden rounded-xl border border-slate-200" />
                {scannerError ? <p className="mt-2 text-xs font-semibold text-red-600">{scannerError}</p> : null}
                {scannerNotice ? <p className="mt-1 text-xs font-semibold text-emerald-700">{scannerNotice}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-[0_26px_58px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-4">
              <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(170deg,#0f172a,#0b2947_46%,#0f766e)] p-4 text-white sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">Operations Dashboard</p>
                  <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[10px] font-semibold">Live</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Total Parcels", value: "18,240" },
                    { label: "Pending", value: "1,204" },
                    { label: "Returned", value: "263" },
                    { label: "Complaints", value: "78" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/15 bg-white/10 px-2.5 py-2.5">
                      <p className="text-[10px] font-medium text-white/75">{item.label}</p>
                      <p className="mt-1 text-sm font-extrabold tracking-[-0.01em] sm:text-base">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-white/15 bg-white/10 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">Recent Tracking</p>
                    <div className="mt-2 space-y-1.5">
                      {DASHBOARD_TRACKING_ROWS.map((row) => (
                        <div key={row.id} className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.5fr] items-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-[10px] sm:text-[11px]">
                          <span className="truncate font-semibold">{row.id}</span>
                          <span className="truncate text-white/80">{row.city}</span>
                          <span className="truncate text-white/80">{row.status}</span>
                          <span className="truncate text-right text-white/90">{row.eta}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/15 bg-white/10 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">Complaint Action</p>
                    <div className="mt-2 space-y-2">
                      {DASHBOARD_COMPLAINT_QUEUE.map((complaint) => (
                        <div key={complaint.id} className="rounded-lg bg-white/10 p-2">
                          <p className="text-[10px] font-bold">{complaint.id}</p>
                          <p className="mt-1 text-[10px] text-white/80">{complaint.issue}</p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[10px] text-amber-200">SLA {complaint.sla}</span>
                            <div className="flex gap-1">
                              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px]">Resolve</span>
                              <span className="rounded bg-rose-400/30 px-1.5 py-0.5 text-[9px]">Escalate</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}