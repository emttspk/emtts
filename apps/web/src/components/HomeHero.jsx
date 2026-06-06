import { useCallback, useEffect, useRef, useState } from "react";
import { Search, ScanLine, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trackLeadStart, trackTrackingSearch, trackWhatsAppClick } from "../lib/analytics";

const SCANNER_CONTAINER_ID = "home-scan-fallback";
const CAMERA_PERMISSION_NOTICE = "Camera permission is required to scan barcode. Please tap Allow when your browser asks.";
const CAMERA_BLOCKED_MESSAGE = "Camera access was blocked. Tap the lock/site settings icon in your browser and allow Camera, then try again.";

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
  const [scannerRetryTick, setScannerRetryTick] = useState(0);

  const fallbackScannerRef = useRef(null);
  const detectorTimerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanHandledRef = useRef(false);
  const videoRef = useRef(null);
  const publicWhatsAppDigits = String(import.meta.env.VITE_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const publicWhatsAppUrl = publicWhatsAppDigits.length >= 7 ? `https://wa.me/${publicWhatsAppDigits}` : "";

  const submitTracking = useCallback(
    (rawValue) => {
      const value = String(rawValue || "").trim();
      if (!value) return;
      const ids = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (!ids.length) return;
      trackTrackingSearch(ids.length);
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
      const errorName = String(error?.name || "");
      if (/permission|denied|notallowed/i.test(message) || /notallowederror|securityerror/i.test(errorName)) {
        setScannerError(CAMERA_BLOCKED_MESSAGE);
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
      const errorName = String(error?.name || "");
      if (/permission|denied|notallowed/i.test(message) || /notallowederror|securityerror/i.test(errorName)) {
        setScannerError(CAMERA_BLOCKED_MESSAGE);
        return;
      }
      setScannerError("Scanner unavailable on this device. Enter tracking ID manually.");
    }
  }, [completeScan]);

  const openScanner = useCallback(() => {
    setScannerError("");
    setScannerNotice(CAMERA_PERMISSION_NOTICE);
    setScannerOpen(true);
  }, []);

  const retryScanner = useCallback(() => {
    setScannerError("");
    setScannerNotice(CAMERA_PERMISSION_NOTICE);
    setScannerRetryTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;

    async function startScanner() {
      setScannerError("");
      setScannerNotice(CAMERA_PERMISSION_NOTICE);
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
  }, [scannerOpen, scannerRetryTick, startBarcodeDetector, startHtml5Fallback, stopScanner]);

  const servicePills = [
     "Labels",
     "Money Orders",
     "Tracking",
     "Complaints",
     "Billing",
  ];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(47,126,219,0.2),transparent_36%),radial-gradient(circle_at_94%_10%,rgba(14,165,118,0.18),transparent_32%),linear-gradient(175deg,#f5faff_0%,#edf6ff_50%,#effbf5_100%)]">
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(10,31,68,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(10,31,68,0.05)_1px,transparent_1px)] [background-size:36px_36px] opacity-30" />
      <div className="mx-auto max-w-[1320px] px-4 py-8 md:px-6 md:py-10 lg:px-10 lg:py-12">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr] lg:gap-7">
          <div>
            <p className="inline-flex items-center rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 shadow-sm sm:text-[11px]">
              Pakistan Post Operations Platform
            </p>
            <h1 className="mt-3 max-w-[21ch] text-[30px] font-black leading-[1.08] tracking-[-0.03em] text-[#0f1f3a] sm:text-[39px] md:text-[44px] lg:text-[52px]">
              <span className="sm:hidden">Ship, Track, Resolve Faster</span>
              <span className="hidden sm:inline">Ship, Track, and Resolve Parcels Faster</span>
            </h1>
            <p className="mt-3 max-w-[620px] text-[14px] leading-6 text-slate-600 sm:text-[16px] sm:leading-7">
              Generate labels, track bulk parcels, manage complaints, and monitor billing from one workspace.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {servicePills.map((pill) => (
                <span
                  key={pill}
                  className="ui-chip"
                >
                  {pill}
                </span>
              ))}
            </div>

            <div className="mt-5 grid w-full max-w-[560px] grid-cols-1 gap-2.5 sm:grid-cols-2">
              <a
                href="/register"
                onClick={() => trackLeadStart("home_hero")}
                className="btn-primary h-11 w-full rounded-xl px-4 text-sm font-bold"
              >
                Start Free
              </a>
              <a
                href="/tracking"
                className="btn-secondary h-11 w-full rounded-xl px-4 text-sm"
              >
                Track Parcel
              </a>
            </div>

            <div className="mt-3 w-full max-w-[560px]">
              {publicWhatsAppUrl ? (
                <a
                  href={publicWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackWhatsAppClick("home_demo")}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  WhatsApp Demo
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="WhatsApp demo will be enabled after public number configuration"
                  className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500"
                >
                  WhatsApp Demo (coming soon)
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-[12px]">
              {["Free plan available", "No card required", "WhatsApp support"].map((item) => (
                <span key={item} className="inline-flex items-center rounded-full border border-[#dce8f5] bg-white/90 px-3 py-1.5 shadow-sm">
                  {item}
                </span>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitTracking(trackingId);
              }}
              className="mt-5 max-w-[700px] rounded-3xl border border-[#dce8f5] bg-white/90 p-2 shadow-[0_18px_44px_rgba(10,31,68,0.12)] backdrop-blur"
            >
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Track Parcel</p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  value={trackingId}
                  onChange={(event) => setTrackingId(event.target.value)}
                  placeholder="Enter tracking ID"
                  className="input-premium h-11 sm:h-12"
                />

                {scannerOpen ? (
                  <div className="rounded-2xl border border-[#cfdff2] bg-[linear-gradient(170deg,#ffffff,#f7fbff)] p-3 shadow-[0_16px_36px_rgba(10,31,68,0.12)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Scan Barcode</p>
                      <button
                        type="button"
                        onClick={() => {
                          setScannerOpen(false);
                          stopScanner();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        aria-label="Close scanner"
                      >
                        <X className="h-3.5 w-3.5" />
                        Close
                      </button>
                    </div>

                    <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800">
                      {CAMERA_PERMISSION_NOTICE}
                    </p>

                    <video ref={videoRef} className="mb-3 h-40 w-full rounded-xl border border-slate-200 bg-slate-950 object-cover sm:h-48" playsInline muted />
                    <div id={SCANNER_CONTAINER_ID} className="overflow-hidden rounded-xl border border-slate-200 bg-white" />

                    {scannerError ? (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
                        <p className="text-xs font-semibold text-rose-700">{scannerError}</p>
                        <button
                          type="button"
                          onClick={retryScanner}
                          className="mt-2 inline-flex h-8 items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700"
                        >
                          Retry Scanner
                        </button>
                      </div>
                    ) : null}

                    {scannerNotice && scannerNotice !== CAMERA_PERMISSION_NOTICE && !scannerError ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-700">{scannerNotice}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    className="btn-primary h-11 gap-2 rounded-xl px-5 text-sm font-bold sm:h-12"
                  >
                    <Search className="h-4 w-4" />
                    Track
                  </button>

                  <button
                    type="button"
                    onClick={openScanner}
                    className="btn-secondary h-11 gap-2 rounded-xl px-4 text-sm sm:h-12"
                  >
                    <ScanLine className="h-4 w-4" />
                    Scan Barcode
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-[#dce8f5] bg-white/92 p-3 shadow-[0_26px_58px_rgba(10,31,68,0.16)] backdrop-blur-xl sm:p-4">
              <div className="rounded-2xl border border-white/20 bg-[linear-gradient(170deg,#0f1f3a,#153153_45%,#0b7f6d)] p-4 text-white sm:p-5">
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
