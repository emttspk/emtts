"""
Pakistan Post Tracking Interpretation Engine.

Pure functions — no I/O, no external dependencies.
All interpretation logic lives here so it is shared by the FastAPI
service (app.py) without duplication.
"""

import re
from datetime import datetime
from typing import Any

from status_engine import determine_tracking_status


# ---------------------------------------------------------------------------
# 1. Status Normalisation Map
# ---------------------------------------------------------------------------

# Maps substrings of *lowercased* raw Pakistan Post status text to canonical values.
# Check order matters: more specific keys first.
_NORM_MAP: list[tuple[str, str]] = [
    ("delivered to addressee",      "DELIVERED"),
    ("delivered to consignee",      "DELIVERED"),
    ("return to sender",            "RETURNED"),
    ("returned to sender",          "RETURNED"),
    ("sent out for delivery",       "OUT_FOR_DELIVERY"),
    ("out for delivery",            "OUT_FOR_DELIVERY"),
    ("arrival at delivery office",  "AT_DELIVERY_OFFICE"),
    ("arrived at delivery office",  "AT_DELIVERY_OFFICE"),
    ("received at delivery office", "AT_DELIVERY_OFFICE"),
    ("dispatch from dmo",           "IN_TRANSIT"),
    ("dispatched from dmo",         "IN_TRANSIT"),
    ("in transit",                  "IN_TRANSIT"),
    ("dispatch",                    "IN_TRANSIT"),
    ("received at dmo",             "BOOKED"),
    ("received at origin",          "BOOKED"),
    ("booking",                     "BOOKED"),
    ("booked",                      "BOOKED"),
    ("undelivered",                 "FAILED_DELIVERY"),
    ("not delivered",               "FAILED_DELIVERY"),
    ("return",                      "RETURN_IN_PROCESS"),
    ("delivered",                   "DELIVERED"),
]


def normalize_status(raw: str) -> str:
    """Map a raw Pakistan Post status string to a canonical status."""
    cleaned = re.sub(r"\(BagID:.*?\)", "", raw).strip().lower()
    for key, value in _NORM_MAP:
        if key in cleaned:
            return value
    return raw.strip().upper()


# ---------------------------------------------------------------------------
# 2. Five-Step Flow Interpretation
# ---------------------------------------------------------------------------

# Relative ordering of each canonical step.
_STEP_RANK: dict[str, int] = {
    "BOOKED":              1,
    "IN_TRANSIT":          2,
    "AT_DELIVERY_OFFICE":  3,
    "OUT_FOR_DELIVERY":    4,
    "FAILED_DELIVERY":     4,   # attempted delivery (same rank as step 4)
    "RETURN_IN_PROCESS":   3,   # return begins at/after delivery office
    "RETURNED":            5,   # terminal return
    "DELIVERED":           5,   # terminal delivery
}


def interpret_tracking_flow(
    history: list[tuple[str, str, str]],
    booking_office: str = "",
    delivery_office: str = "",
) -> str:
    """
    Walk the tracking history and return the current canonical status.

    Parameters
    ----------
    history         list of (date_str, time_str, raw_status_str) tuples,
                    ordered oldest → newest.
    booking_office  booking city / DMO name (optional).
    delivery_office delivery city / DO name (optional).

    Returns
    -------
    One of: BOOKED | IN_TRANSIT | AT_DELIVERY_OFFICE | OUT_FOR_DELIVERY |
            DELIVERED | FAILED_DELIVERY | RETURN_IN_PROCESS | RETURNED
    """
    if not history:
        return "BOOKED"

    highest_rank = 0
    latest_norm = "BOOKED"
    delivered = False
    returned_final = False
    return_in_process = False
    failed_delivery = False

    for _, _, raw in history:
        norm = normalize_status(raw)
        rank = _STEP_RANK.get(norm, 0)

        if norm == "DELIVERED":
            delivered = True
            highest_rank = 5
            latest_norm = norm
        elif norm == "RETURNED":
            returned_final = True
            highest_rank = 5
            latest_norm = norm
        elif norm == "RETURN_IN_PROCESS":
            return_in_process = True
            highest_rank = max(highest_rank, _STEP_RANK["RETURN_IN_PROCESS"])
            latest_norm = norm
        elif norm == "FAILED_DELIVERY":
            failed_delivery = True
            highest_rank = max(highest_rank, _STEP_RANK["FAILED_DELIVERY"])
            latest_norm = norm
        elif rank >= highest_rank:
            highest_rank = rank
            latest_norm = norm

    # Terminal states are checked in priority order.
    if delivered:
        return "DELIVERED"
    if returned_final:
        return "RETURNED"
    if return_in_process:
        return "RETURN_IN_PROCESS"
    if failed_delivery:
        return "FAILED_DELIVERY"
    return latest_norm


# ---------------------------------------------------------------------------
# 3. MOS Detection
# ---------------------------------------------------------------------------

_MOS_PATTERN = re.compile(r"\b(MOS[A-Z0-9]{4,})\b", re.IGNORECASE)


def detect_mos_tracking(tracking_number: str) -> bool:
    """Return True when the tracking number is itself a Money Order Slip ID."""
    return str(tracking_number).strip().upper().startswith("MOS")


def extract_mos_from_history(history: list[tuple[str, str, str]]) -> str | None:
    """
    Scan tracking history for an embedded MOS reference.
    Returns the MOS ID (uppercased) if found, otherwise None.
    The MOS ID must appear ONLY in the 'MO Issued' column — this function
    merely extracts it so the caller can store it accordingly.
    """
    for _, _, raw in history:
        match = _MOS_PATTERN.search(raw)
        if match:
            return match.group(1).upper()
    return None


def extract_selected_section_mos(data: dict[str, Any]) -> str | None:
    selected = str(data.get("selected_tracking_number") or "").strip().upper()
    if selected.startswith("MOS"):
        return selected
    return None


# ---------------------------------------------------------------------------
# 4. Pending Level Detection
# ---------------------------------------------------------------------------

def get_pending_level(
    latest_date_str: str | None,
    latest_time_str: str | None = None,
) -> str | None:
    """
    Classify inactivity duration for non-delivered shipments.

    Returns one of "Pending 24h", "Pending 48h", "Pending 72h", or None.
    """
    if not latest_date_str:
        return None
    try:
        if latest_time_str:
            try:
                dt = datetime.strptime(
                    f"{latest_date_str} {latest_time_str}", "%B %d, %Y %I:%M %p"
                )
            except ValueError:
                dt = datetime.strptime(latest_date_str, "%B %d, %Y")
        else:
            dt = datetime.strptime(latest_date_str, "%B %d, %Y")

        hours_idle = (datetime.today() - dt).total_seconds() / 3600

        if hours_idle > 72:
            return "Pending 72h"
        if hours_idle > 48:
            return "Pending 48h"
        if hours_idle > 24:
            return "Pending 24h"
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 5. Complaint Enable Logic
# ---------------------------------------------------------------------------

def is_complaint_enabled(first_date_str: str | None) -> bool:
    """
    Return True only when ≥ 8 days have elapsed since the booking scan.

    Before 8 days → False  (complaint disabled).
    On/after 8 days → True (complaint enabled).
    """
    if not first_date_str:
        return False
    try:
        booked = datetime.strptime(first_date_str, "%B %d, %Y")
        return (datetime.today() - booked).days >= 8
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 6. Status Card Calculation  (single shared function)
# ---------------------------------------------------------------------------

def calculate_status_cards(
    shipments: list[dict[str, Any]],
) -> dict[str, int]:
    """
    Compute status card totals from a list of shipment dicts.

    Each dict should contain at minimum:
        status      : str   (canonical status string)
        days_passed : int | None
        mo_issued   : str | None  (MOS/MO number if issued)

    Returns
    -------
    { "total": int, "delivered": int, "pending": int,
      "returned": int, "delayed": int }
    """
    total = len(shipments)
    delivered = 0
    pending = 0
    returned = 0
    delayed = 0

    for s in shipments:
        status = str(s.get("status") or "").strip().upper()
        mo_issued = str(s.get("mo_issued") or "").strip()
        days = s.get("days_passed")

        # MOS / any issued MO → force DELIVERED
        if mo_issued or status in ("MONEY_ORDER", "MO_RECEIVED"):
            delivered += 1
            continue

        if status == "DELIVERED":
            delivered += 1
        elif status in ("RETURNED", "RETURN", "RETURN_IN_PROCESS", "RTO"):
            returned += 1
        elif days is not None and days >= 8 and status != "DELIVERED":
            delayed += 1
        else:
            pending += 1

    return {
        "total": total,
        "delivered": delivered,
        "pending": pending,
        "returned": returned,
        "delayed": delayed,
    }


# ---------------------------------------------------------------------------
# 7. Main Interpretation Entry Point
# ---------------------------------------------------------------------------

def interpret_shipment(
    data: dict[str, Any],
    tracking_number: str,
) -> dict[str, Any]:
    """
    Full interpretation of a single shipment's tracking data.

    Parameters
    ----------
    data            dict returned by get_full_tracking()
    tracking_number original tracking/barcode string

    Returns
    -------
    {
        status           : str          canonical status
        pending_level    : str | None   "Pending 24h/48h/72h" or None
        complaint_eligible : bool       True when booking age ≥ 8 days
        mos_id           : str | None   MOS reference ID (store in MO Issued only)
    }
    """
    tn = str(tracking_number).strip().upper()

    history         = data.get("history") or []
    booking_office  = str(data.get("booking_office") or "").lower()
    delivery_office = str(data.get("delivery_office") or "").lower()
    first_date      = data.get("first_date")
    latest_date     = data.get("latest_date")
    latest_time     = data.get("latest_time")
    events          = data.get("events") or []

    # Detect MOS: selected section first, then embedded history, then full-page scan.
    all_mos = data.get("all_mos_ids") or []
    latest_mos = data.get("latest_mos_id")
    mos_id = (
        extract_selected_section_mos(data)
        or extract_mos_from_history(history)
        or (latest_mos if latest_mos else (all_mos[-1] if all_mos else None))
    )

    # Final COD decision scope indicators are still read from the parsed payload.
    service_type = str(data.get("service_type") or "").strip().upper()
    collected_amount_raw = data.get("collected_amount")
    try:
        collected_amount = float(collected_amount_raw) if collected_amount_raw is not None else 0.0
    except Exception:
        collected_amount = 0.0

    article_type = service_type or tn[:3]
    status_patch = determine_tracking_status(
        events=events,
        article_type=article_type,
        amount=collected_amount,
        manual_pending_override=False,
    )

    flow_status = interpret_tracking_flow(history, booking_office, delivery_office)

    # Keep terminal decisions from the deterministic status engine,
    # but do not overwrite in-flight lifecycle states with generic PENDING.
    final_status = str(status_patch.get("final_status") or "Pending")
    final_status_up = final_status.strip().upper()
    if final_status_up == "DELIVERED":
        status = "DELIVERED"
    elif final_status_up == "RETURN":
        status = "RETURN"
    else:
        status = str(flow_status or "PENDING").strip().upper()

    pending_level = get_pending_level(latest_date, latest_time) if status in {
        "BOOKED",
        "IN_TRANSIT",
        "AT_DELIVERY_OFFICE",
        "OUT_FOR_DELIVERY",
        "FAILED_DELIVERY",
        "RETURN_IN_PROCESS",
        "PENDING",
    } else None
    complaint_eligible = bool(status_patch.get("complaint_enabled"))

    return {
        "status": status,
        "pending_level": pending_level,
        "complaint_eligible": complaint_eligible,
        "mos_id": status_patch.get("mos_id") or mos_id,
        "final_status": final_status,
        "current_cycle": status_patch.get("current_cycle"),
        "cycle_description": status_patch.get("cycle_description"),
        "complaint_enabled": complaint_eligible,
        "last_scan_date": status_patch.get("last_scan_date"),
        "reason": status_patch.get("reason"),
    }
