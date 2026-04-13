"""
Deterministic Pakistan Post status engine.

This module is intentionally standalone and pure so it can run as a
post-parse processing layer without changing fetch, parse, queue, cache,
API, or database behavior.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any


_MOS_ID_PATTERN = re.compile(r"\b(MOS[A-Z0-9]{4,})\b", flags=re.IGNORECASE)


def _parse_event_datetime(event: dict[str, Any]) -> datetime:
    date_str = str(event.get("date") or "").strip()
    time_str = str(event.get("time") or "").strip() or "00:00"

    if not date_str:
        return datetime.min

    # Primary expected formats.
    for fmt in (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y-%m-%d %I:%M %p",
        "%d-%m-%Y %H:%M",
        "%d-%m-%Y",
    ):
        try:
            source = f"{date_str} {time_str}".strip()
            return datetime.strptime(source, fmt)
        except ValueError:
            pass

    # Graceful fallback for existing parser variants.
    for fmt in (
        "%B %d, %Y %I:%M %p",
        "%B %d, %Y",
        "%b %d, %Y %I:%M %p",
        "%b %d, %Y",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
    ):
        try:
            source = f"{date_str} {time_str}".strip()
            return datetime.strptime(source, fmt)
        except ValueError:
            pass

    return datetime.min


def _desc(event: dict[str, Any]) -> str:
    return str(event.get("description") or "").strip().lower()


def _is_dispatch(desc: str) -> bool:
    return "dispatch" in desc


def _is_delivery_attempt(desc: str) -> bool:
    return "sent out for delivery" in desc or "out for delivery" in desc


def _is_failure(desc: str) -> bool:
    return (
        "undelivered" in desc
        or "refused" in desc
        or "deposit" in desc
    )


def _is_return_completed(desc: str) -> bool:
    return (
        "return to sender" in desc
        or "returned to sender" in desc
        or "return to origin" in desc
        or "return completed" in desc
    )


def _is_mos_issued(desc: str) -> bool:
    return "mos issued" in desc


def _is_delivered(desc: str) -> bool:
    # Strict delivered detection: only explicit delivered signals.
    return (
        "delivered to addressee" in desc
        or desc == "delivered"
        or " delivered " in f" {desc} "
    ) and not _is_failure(desc)


def _extract_mos_id(events: list[dict[str, Any]]) -> str | None:
    for event in events:
        match = _MOS_ID_PATTERN.search(str(event.get("description") or ""))
        if match:
            return match.group(1).upper()
    return None


def _find_mos_start_index(events: list[dict[str, Any]]) -> int | None:
    for idx, event in enumerate(events):
        if _is_mos_issued(_desc(event)):
            return idx
    return None


def _compute_cycle_state(events: list[dict[str, Any]]) -> tuple[int, int]:
    """
    Returns:
    - cycle number (1-based)
    - start index of latest cycle in the provided event list

    A new cycle starts only after a completed return is followed by a dispatch.
    """
    if not events:
        return 1, 0

    cycle = 1
    latest_cycle_start_idx = 0
    seen_dispatch = False
    seen_attempt = False
    seen_failure = False
    seen_return = False

    for idx, event in enumerate(events):
        desc = _desc(event)

        if _is_dispatch(desc):
            if seen_return and seen_failure:
                cycle += 1
                latest_cycle_start_idx = idx
                seen_attempt = False
                seen_failure = False
                seen_return = False
            seen_dispatch = True
            continue

        if seen_dispatch and _is_delivery_attempt(desc):
            seen_attempt = True
            continue

        if seen_dispatch and (_is_failure(desc) or "undelivered" in desc):
            seen_failure = True
            continue

        if seen_dispatch and (_is_return_completed(desc) or "return to sender" in desc):
            # Keep the pattern strict: return marks cycle completion only
            # after the parcel had entered delivery/failure branch.
            if seen_attempt or seen_failure:
                seen_return = True

    return cycle, latest_cycle_start_idx


def _days_since(date_str: str | None) -> int | None:
    if not date_str:
        return None
    try:
        scan_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        try:
            scan_date = datetime.strptime(date_str, "%B %d, %Y").date()
        except ValueError:
            return None
    return (date.today() - scan_date).days


def _pending_age_hours(first_event_dt: datetime) -> float | None:
    if first_event_dt == datetime.min:
        return None
    return (datetime.today() - first_event_dt).total_seconds() / 3600


def determine_tracking_status(
    events: list,
    article_type: str,
    amount: float = 0,
    manual_pending_override: bool = False,
) -> dict:
    """
    Determine final customer-facing status from parsed tracking events.

    Output statuses are intentionally restricted to:
    - Pending
    - Delivered
    - Return
    """
    normalized_events: list[dict[str, Any]] = [
        e for e in events if isinstance(e, dict) and e.get("date")
    ]
    normalized_events.sort(key=_parse_event_datetime)

    if not normalized_events:
        return {
            "final_status": "Pending",
            "current_cycle": 1,
            "cycle_description": "Pending (Loop 1)",
            "complaint_enabled": bool(manual_pending_override),
            "is_complaint_enabled": bool(manual_pending_override),
            "mos_id": None,
            "last_scan_date": None,
            "reason": "No valid events found.",
        }

    mos_id = _extract_mos_id(normalized_events)
    mos_start_idx = _find_mos_start_index(normalized_events)

    # If MOS exists and MOS issuance is visible in the same list,
    # status must be determined only from MOS leg events.
    if mos_id and mos_start_idx is not None:
        status_events = normalized_events[mos_start_idx:]
        scope_reason = "MOS flow detected; final status evaluated from MOS leg only."
    else:
        status_events = normalized_events
        scope_reason = "Status evaluated from article event history."

    cycle_raw, cycle_start_idx = _compute_cycle_state(status_events)
    latest_cycle_events = status_events[cycle_start_idx:] if status_events else []
    cycle = cycle_raw
    loop_label = str(cycle)

    last_scan_date = (
        str(latest_cycle_events[-1].get("date"))
        if latest_cycle_events
        else str(status_events[-1].get("date"))
    )
    days_idle = _days_since(last_scan_date)
    first_event_dt = _parse_event_datetime(status_events[0]) if status_events else datetime.min
    pending_hours = _pending_age_hours(first_event_dt)

    has_delivered = any(_is_delivered(_desc(e)) for e in latest_cycle_events)
    has_return = any(_is_return_completed(_desc(e)) for e in latest_cycle_events)

    if mos_id and mos_start_idx is not None:
        if has_delivered:
            final_status = "Delivered"
            reason = "MOS cycle contains delivered event."
        elif has_return:
            final_status = "Return"
            reason = "MOS cycle ended with return event."
        else:
            final_status = "Pending"
            reason = "MOS cycle has no terminal event yet."
    else:
        if has_delivered:
            final_status = "Delivered"
            reason = "Delivered event found in latest cycle."
        elif has_return:
            final_status = "Return"
            reason = "Return-to-sender event found in latest cycle."
        else:
            final_status = "Pending"
            if pending_hours is None:
                reason = "No terminal event in latest cycle."
            elif pending_hours <= 24:
                reason = "Pending under 24 hours since booking."
            elif pending_hours <= 48:
                reason = "Pending between 24 and 48 hours since booking."
            elif pending_hours <= 72:
                reason = "Pending between 48 and 72 hours since booking."
            else:
                reason = "Pending over 72 hours since booking."

    complaint_enabled = (
        final_status == "Pending"
        and (
            bool(manual_pending_override)
            or (days_idle is not None and days_idle > 7)
        )
    )

    return {
        "final_status": final_status,
        "current_cycle": cycle,
        "cycle_description": f"{final_status} Loop {loop_label}",
        "complaint_enabled": complaint_enabled,
        "is_complaint_enabled": complaint_enabled,
        "mos_id": mos_id,
        "last_scan_date": last_scan_date,
        "article_type": str(article_type or "").strip().upper() or None,
        "amount": amount,
        "reason": f"{scope_reason} {reason}",
    }
