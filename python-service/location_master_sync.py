#!/usr/bin/env python3
"""
location_master_sync.py — Scrape Pakistan Post ep.gov.pk live location hierarchy
and save to city/post-office-list.csv (also updates city/post office list.csv).

Scheduler mode runs weekly; keeps backups in city/backups/.

Usage:
    python python-service/location_master_sync.py           # one-shot sync
    python python-service/location_master_sync.py --daemon  # weekly scheduler
    python python-service/location_master_sync.py --force   # force overwrite
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# ─── constants ────────────────────────────────────────────────────────────────

COMPLAINT_ENTRY_URL = "https://ep.gov.pk/complaints.asp"
COMPLAINT_FORM_URL = "https://ep.gov.pk/Complaint.aspx"

TIMEOUT = 60          # seconds per HTTP call
RETRY_DELAYS = [5, 15, 30]   # seconds between retries on AJAX fetches
POLITE_DELAY = 0.4    # seconds between AJAX calls

# Relative to this file → project root
ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_TARGET = ROOT_DIR / "city" / "post-office-list.csv"
CSV_LEGACY = ROOT_DIR / "city" / "post office list.csv"
BACKUP_DIR = ROOT_DIR / "city" / "backups"
BACKUP_LIMIT = 10     # keep latest N backup files

SCHEDULER_INTERVAL_DAYS = 7
SCHEDULER_FALLBACK_DAYS = 14


# ─── helpers ──────────────────────────────────────────────────────────────────

def _headers(referer: str = COMPLAINT_ENTRY_URL) -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Referer": referer,
        "Origin": "https://ep.gov.pk",
    }


def _decode(resp: requests.Response) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return resp.content.decode(enc)
        except Exception:
            pass
    return resp.text


def _normalize(value: str) -> str:
    text = str(value or "").upper()
    for tok in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
        text = text.replace(tok, "")
    return re.sub(r"\s+", " ", text).strip()


def _parse_options(markup: str) -> list[tuple[str, str]]:
    """Return [(label, value), ...] from an HTML <option> fragment."""
    soup = BeautifulSoup(f"<select>{markup}</select>", "html.parser")
    result = []
    for opt in soup.find_all("option"):
        label = opt.get_text(" ", strip=True)
        value = str(opt.get("value") or "").strip()
        if label and value:
            result.append((label, value))
    return result


# ─── scraping ─────────────────────────────────────────────────────────────────

def _get_form_and_districts(
    session: requests.Session,
) -> tuple[str, list[tuple[str, str]]]:
    """
    Load complaint form page, return (form_url, [(district_label, district_value), ...]).
    Prefers Complaint.aspx direct; falls back through complaints.asp iframe.
    """
    # Try direct Complaint.aspx
    try:
        resp = session.get(COMPLAINT_FORM_URL, timeout=TIMEOUT, headers=_headers())
        resp.raise_for_status()
        html = _decode(resp)
        soup = BeautifulSoup(html, "html.parser")
        dd = soup.find("select", attrs={"name": "DDDistrict"})
        if dd:
            opts = _parse_options(str(dd))
            if opts:
                return COMPLAINT_FORM_URL, opts
    except Exception as e:
        print(f"[Sync] Direct Complaint.aspx load failed: {e}")

    # Fallback: complaints.asp → find iframe
    resp2 = session.get(COMPLAINT_ENTRY_URL, timeout=TIMEOUT, headers=_headers())
    resp2.raise_for_status()
    html2 = _decode(resp2)
    soup2 = BeautifulSoup(html2, "html.parser")

    iframe = (
        soup2.find("iframe", attrs={"name": re.compile(r"^ifr$", re.IGNORECASE)})
        or soup2.find("iframe")
    )
    if iframe and iframe.get("src"):
        iframe_url = urljoin(COMPLAINT_ENTRY_URL, str(iframe.get("src") or ""))
        resp3 = session.get(iframe_url, timeout=TIMEOUT, headers=_headers(COMPLAINT_ENTRY_URL))
        resp3.raise_for_status()
        html3 = _decode(resp3)
        soup3 = BeautifulSoup(html3, "html.parser")
        dd = soup3.find("select", attrs={"name": "DDDistrict"})
        if dd:
            opts = _parse_options(str(dd))
            if opts:
                return iframe_url, opts

    raise RuntimeError("Could not find DDDistrict dropdown on ep.gov.pk complaint form")


def _fetch_dependent(
    session: requests.Session,
    form_url: str,
    endpoint: str,
    param_name: str,
    param_value: str,
) -> list[tuple[str, str]]:
    """Call ASP.NET JSON web-service endpoint to get dependent dropdown options."""
    url = urljoin(form_url, endpoint)
    body = json.dumps({param_name: param_value})
    resp = session.post(
        url,
        data=body,
        timeout=TIMEOUT,
        headers={
            **_headers(form_url),
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
        },
    )
    resp.raise_for_status()
    try:
        data = resp.json()
        markup = str(data.get("d") or "")
    except Exception:
        markup = resp.text
    return _parse_options(markup)


def _fetch_with_retry(
    session: requests.Session,
    form_url: str,
    endpoint: str,
    param_name: str,
    param_value: str,
    label: str = "",
) -> list[tuple[str, str]]:
    for attempt, delay in enumerate([0] + RETRY_DELAYS[:2], start=1):
        if delay:
            time.sleep(delay)
        try:
            return _fetch_dependent(session, form_url, endpoint, param_name, param_value)
        except Exception as e:
            print(f"  [Warn] {label} fetch attempt {attempt} failed: {e}")
    return []


def scrape_hierarchy(verbose: bool = True) -> list[dict[str, str]]:
    """
    Scrape full district → tehsil → location hierarchy from ep.gov.pk.
    Returns list of dicts: {district, tehsil, location, normalized_location}.
    """
    session = requests.Session()
    session.headers.update(_headers())

    form_url, district_options = _get_form_and_districts(session)

    if verbose:
        print(f"[Sync] Form URL : {form_url}")
        print(f"[Sync] Districts: {len(district_options)}")

    rows: list[dict[str, str]] = []

    for d_label, d_value in district_options:
        if not d_value:
            continue
        if verbose:
            print(f"[Sync] District: {d_label}")

        tehsil_options = _fetch_with_retry(
            session, form_url,
            "Default.aspx/GetTehsil", "DistrictId", d_value,
            label=f"Tehsil({d_label})",
        )
        if not tehsil_options:
            if verbose:
                print(f"  [Warn] No tehsils for {d_label}, skipping")
            continue

        for t_label, t_value in tehsil_options:
            if not t_value:
                continue
            if verbose:
                print(f"  Tehsil: {t_label}")

            location_options = _fetch_with_retry(
                session, form_url,
                "Default.aspx/GetLocations", "TehsilId", t_value,
                label=f"Locations({d_label}/{t_label})",
            )

            for loc_label, _loc_value in location_options:
                if not loc_label:
                    continue
                rows.append({
                    "district": d_label,
                    "tehsil": t_label,
                    "location": loc_label,
                    "normalized_location": _normalize(loc_label),
                })

            time.sleep(POLITE_DELAY)

        time.sleep(POLITE_DELAY)

    return rows


# ─── persistence ──────────────────────────────────────────────────────────────

def _has_changed(new_rows: list[dict[str, str]]) -> bool:
    """Return True if new_rows differs from the current saved CSV."""
    path = CSV_TARGET if CSV_TARGET.exists() else (CSV_LEGACY if CSV_LEGACY.exists() else None)
    if not path:
        return True
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            existing = [
                (
                    str(r.get("district") or r.get("District") or "").strip(),
                    str(r.get("tehsil") or r.get("Tehsil") or "").strip(),
                    str(r.get("location") or r.get("Location") or "").strip(),
                )
                for r in reader
            ]
        new_set = {(r["district"], r["tehsil"], r["location"]) for r in new_rows}
        old_set = set(existing)
        return new_set != old_set
    except Exception:
        return True


def _backup_current() -> None:
    """Backup current CSV to city/backups/post-office-list-YYYY-MM-DD.csv."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    source = CSV_TARGET if CSV_TARGET.exists() else (CSV_LEGACY if CSV_LEGACY.exists() else None)
    if not source:
        return
    date_str = datetime.now().strftime("%Y-%m-%d")
    dest = BACKUP_DIR / f"post-office-list-{date_str}.csv"
    shutil.copy2(source, dest)
    # Prune old backups
    backups = sorted(BACKUP_DIR.glob("post-office-list-*.csv"), reverse=True)
    for old in backups[BACKUP_LIMIT:]:
        old.unlink(missing_ok=True)
    print(f"[Sync] Backup written → {dest}")


def save_rows(rows: list[dict[str, str]]) -> None:
    """Write rows to both CSV_TARGET and CSV_LEGACY, after backing up current."""
    if not rows:
        raise ValueError("No rows to save — aborting to avoid overwriting with empty file")

    # Ensure directories exist
    CSV_TARGET.parent.mkdir(parents=True, exist_ok=True)
    CSV_LEGACY.parent.mkdir(parents=True, exist_ok=True)

    _backup_current()

    fieldnames = ["district", "tehsil", "location", "normalized_location"]
    for target in (CSV_TARGET, CSV_LEGACY):
        with target.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    print(f"[Sync] Saved {len(rows)} rows → {CSV_TARGET}")
    print(f"[Sync] Also updated legacy → {CSV_LEGACY}")


# ─── orchestration ────────────────────────────────────────────────────────────

def sync_once(force: bool = False, verbose: bool = True) -> bool:
    """
    Run one scrape + save pass.
    Returns True if the CSV was updated, False otherwise.
    """
    try:
        rows = scrape_hierarchy(verbose=verbose)
    except Exception as e:
        print(f"[Sync] ERROR during scrape: {e}", file=sys.stderr)
        return False

    if not rows:
        print("[Sync] WARNING: scraped 0 rows — skipping save", file=sys.stderr)
        return False

    if not force and not _has_changed(rows):
        print(f"[Sync] No changes detected ({len(rows)} rows unchanged)")
        return False

    save_rows(rows)
    return True


def run_scheduler() -> None:
    """
    Run sync on startup, then every SCHEDULER_INTERVAL_DAYS days.
    Falls back to SCHEDULER_FALLBACK_DAYS if previous sync failed.
    """
    print("[Scheduler] Pakistan Post location master sync daemon started")
    last_success: float = 0.0
    fail_streak = 0

    while True:
        now = time.time()
        elapsed_days = (now - last_success) / 86400.0

        should_run = (
            last_success == 0.0
            or elapsed_days >= SCHEDULER_INTERVAL_DAYS
            or (fail_streak > 0 and elapsed_days >= SCHEDULER_FALLBACK_DAYS)
        )

        if should_run:
            print(f"[Scheduler] Triggering sync (elapsed={elapsed_days:.1f}d fail_streak={fail_streak})")
            ok = sync_once(verbose=False)
            if ok:
                last_success = time.time()
                fail_streak = 0
                print("[Scheduler] Sync succeeded")
            else:
                fail_streak += 1
                print(f"[Scheduler] Sync failed (fail_streak={fail_streak})")
        else:
            next_run_h = max(0.0, (SCHEDULER_INTERVAL_DAYS - elapsed_days) * 24)
            print(f"[Scheduler] Next run in ~{next_run_h:.1f}h")

        # Check every hour
        time.sleep(3600)


# ─── entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Pakistan Post location master sync")
    parser.add_argument("--daemon", action="store_true", help="Run as weekly scheduler")
    parser.add_argument("--force", action="store_true", help="Force overwrite even if unchanged")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-row progress output")
    args = parser.parse_args()

    if args.daemon:
        run_scheduler()
    else:
        updated = sync_once(force=args.force, verbose=not args.quiet)
        # Exit 0 = updated; Exit 1 = no changes or error (both are non-fatal)
        sys.exit(0 if updated else 1)


if __name__ == "__main__":
    main()
