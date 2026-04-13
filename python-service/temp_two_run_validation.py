"""
Two-run live complaint validation.

Run 1  → submit (SUCCESS or existing DUPLICATE)
Run 2  → confirm DUPLICATE, capture complaint ID + due date

NON-REGRESSION RULES
- NEVER touch article field after auto-population
- NO hard rebind
- Preserve ASP.NET lifecycle state exactly
"""
from __future__ import annotations

import json
import re
import time
from datetime import date, datetime
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

# ── Config ────────────────────────────────────────────────────────────────────
TRACKING_ID         = "VPL26030759"
MOBILE              = "03331234567"
COMPLAINANT_NAME    = "Global Suppliers"
SENDER_NAME         = "Global Suppliers"
ADDRESSEE_NAME      = "Addressee"
SENDER_ADDRESS      = "Sahiwal"
ADDRESSEE_ADDRESS   = "Bahawalpur"
REMARKS             = "Pending delivery complaint for article VPL26030759. Kindly process urgently."
ENTRY_URL           = "https://ep.gov.pk/complaints.asp"
PREFERRED_DISTRICT  = "Bahawalpur"
PREFERRED_TEHSIL    = "Bahawalpur"
PREFERRED_LOCATION  = "Bahawalpur GPO"


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value: str) -> str:
    text = clean(value).upper()
    for token in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
        text = text.replace(token, "")
    return re.sub(r"\s+", " ", text).strip()


def build_driver() -> webdriver.Chrome:
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)


def ready(driver: webdriver.Chrome, wait: WebDriverWait) -> None:
    wait.until(lambda d: d.execute_script("return document.readyState") == "complete")


def into_iframe(driver: webdriver.Chrome, wait: WebDriverWait) -> None:
    driver.switch_to.default_content()
    wait.until(EC.frame_to_be_available_and_switch_to_it((By.TAG_NAME, "iframe")))
    ready(driver, wait)


def stale_retry(action):
    last = None
    for _ in range(3):
        try:
            return action()
        except StaleElementReferenceException as exc:
            last = exc
    raise last


def all_fields(driver: webdriver.Chrome) -> dict[str, str]:
    script = """
        const data = {};
        for (const el of document.querySelectorAll('input, select, textarea')) {
            const name = (el.getAttribute('name') || '').trim();
            const id   = (el.getAttribute('id')   || '').trim();
            if (name || id) data[name || id] = el.tagName.toLowerCase();
        }
        return data;
    """
    return driver.execute_script(script)


def discover(driver: webdriver.Chrome) -> dict[str, str]:
    fields = all_fields(driver)
    names  = list(fields.keys())

    def pick(patterns: list[str], tag: str | None = None) -> str:
        for pat in patterns:
            rx = re.compile(pat, re.IGNORECASE)
            for n in names:
                if tag and fields.get(n) != tag:
                    continue
                if rx.search(n):
                    return n
        return ""

    return {
        "article":          pick([r"txt_?ArticleNo", r"\bArticleNo\b"], "input"),
        "complainant_name": pick([r"Complainant.*Name"], "input"),
        "mobile":           pick([r"ComplainantPhNo", r"Complainant.*Mobile", r"txtMobileNo", r"\bMobile\b"], "input"),
        "booking_date":     pick([r"BookingDate"], "input"),
        "booking_office":   pick([r"BookingOffice", r"CustomBookingOffice"], "input"),
        "sender_name":      pick([r"Sender.*Name"], "input"),
        "sender_address":   pick([r"Sender.*Address"], "textarea") or pick([r"Sender.*Address"], "input"),
        "addressee_name":   pick([r"Addressee.*Name", r"Receiver.*Name", r"recipent.*name"], "input"),
        "addressee_address":pick([r"Addressee.*Address", r"Receiver.*Address", r"recipent.*address"], "textarea")
                            or pick([r"Addressee.*Address", r"Receiver.*Address", r"recipent.*address"], "input"),
        "remarks":          pick([r"_Remarks", r"\bRemarks\b"], "textarea") or pick([r"_Remarks", r"\bRemarks\b"], "input"),
        "service":          pick([r"ServiceType"], "select"),
        "reply":            pick([r"PreferredModeOfReply", r"ReplyMode"], "select"),
        "problem":          pick([r"ProblemCategory"], "select"),
        "sender_city":      pick([r"SenderCity"], "select"),
        "addressee_city":   pick([r"AddresseeCity", r"ReceiverCity"], "select"),
        "district":         pick([r"DDDistrict", r"District"], "select"),
        "tehsil":           pick([r"DDTehsil", r"Tehsil"], "select"),
        "location":         pick([r"DDLocations", r"Location"], "select"),
        "submit":           pick([r"btnSubmit", r"ImageButton", r"Submit"], "input"),
    }


def get_el(driver: webdriver.Chrome, name: str):
    return driver.find_element(By.NAME, name)


def refresh_after(driver: webdriver.Chrome, wait: WebDriverWait, old) -> None:
    try:
        wait.until(EC.staleness_of(old))
    except Exception:
        pass
    ready(driver, wait)
    into_iframe(driver, wait)


def set_text(driver: webdriver.Chrome, wait: WebDriverWait, name: str, value: str, blur: bool = False) -> None:
    def _w():
        el = get_el(driver, name)
        old = el
        el.clear()
        el.send_keys(value)
        if blur:
            el.send_keys(Keys.TAB)
            refresh_after(driver, wait, old)
    stale_retry(_w)


def select_with_postback(driver: webdriver.Chrome, wait: WebDriverWait, name: str,
                         preferred: str, require: bool = True) -> tuple[str, str]:
    def _s():
        el  = get_el(driver, name)
        old = el
        sel = Select(el)
        opts = [(clean(o.get_attribute("value")), clean(o.text)) for o in sel.options]
        pref = normalize(preferred)
        cv, ct = "", ""
        # Exact match
        for v, t in opts:
            if v and normalize(t) == pref:
                cv, ct = v, t
                break
        # Partial
        if not cv:
            for v, t in opts:
                if v and pref:
                    nt = normalize(t)
                    if pref in nt or nt in pref:
                        cv, ct = v, t
                        break
        # 3-char prefix
        if not cv and len(pref) >= 3:
            pfx = pref[:3]
            for v, t in opts:
                if v and normalize(t).startswith(pfx):
                    cv, ct = v, t
                    break
        # First non-empty
        if not cv:
            for v, t in opts:
                tl = t.lower()
                if v and "select" not in tl and tl not in ("-", "--"):
                    cv, ct = v, t
                    break
        if require and not cv:
            raise RuntimeError(f"No valid option for {name}")
        if cv:
            sel.select_by_value(cv)
            refresh_after(driver, wait, old)
        return cv, ct
    return stale_retry(_s)


def select_value(driver: webdriver.Chrome, name: str, value: str) -> None:
    if name and value:
        stale_retry(lambda: Select(get_el(driver, name)).select_by_value(value))


def select_value_with_postback(driver: webdriver.Chrome, wait: WebDriverWait, name: str, value: str) -> None:
    if not name or not value:
        return
    def _s():
        el  = get_el(driver, name)
        old = el
        Select(el).select_by_value(value)
        refresh_after(driver, wait, old)
    stale_retry(_s)


def cur_value(driver: webdriver.Chrome, name: str) -> str:
    if not name:
        return ""
    return stale_retry(lambda: clean(Select(get_el(driver, name)).first_selected_option.get_attribute("value")))


def cur_text(driver: webdriver.Chrome, name: str) -> str:
    if not name:
        return ""
    return stale_retry(lambda: clean(Select(get_el(driver, name)).first_selected_option.text))


def valid_selected(driver: webdriver.Chrome, name: str) -> bool:
    if not name:
        return False
    v = cur_value(driver, name)
    t = cur_text(driver, name).lower()
    return bool(v) and "select" not in t and t not in ("-", "--")


def wait_autopopulation(driver: webdriver.Chrome, wait: WebDriverWait) -> dict[str, str]:
    state: dict[str, str] = {}
    data: dict[str, str]  = {}
    ready_since = None

    for _ in range(2):
        into_iframe(driver, wait)

        def _cond(_d):
            nonlocal ready_since
            ctrl = discover(driver)
            bd   = ctrl.get("booking_date", "")
            sc   = ctrl.get("sender_city", "")
            ac   = ctrl.get("addressee_city", "")
            bv   = clean(get_el(driver, bd).get_attribute("value")) if bd else ""
            sok  = valid_selected(driver, sc)
            aok  = valid_selected(driver, ac)
            data["booking_date"]   = bv
            data["sender_city"]    = cur_value(driver, sc) if sc else ""
            data["addressee_city"] = cur_value(driver, ac) if ac else ""
            is_ok = bool(bv) and sok and aok
            if not is_ok:
                ready_since = None
                return False
            now = time.monotonic()
            if ready_since is None:
                ready_since = now
                return False
            return (now - ready_since) >= 1.2

        try:
            wait.until(_cond)
            break
        except TimeoutException:
            continue

    return data


def lifecycle_registration(driver: webdriver.Chrome, wait: WebDriverWait, ctrl: dict[str, str]) -> dict[str, str]:
    """
    Force ASP.NET to register the auto-populated controls by toggling a safe
    select field (sender city first, service as fallback) to an alternate value
    and back, using real Selenium interaction only.
    """
    sc_name = ctrl.get("sender_city")
    if sc_name and valid_selected(driver, sc_name):
        current = cur_value(driver, sc_name)
        all_vals = [clean(o.get_attribute("value"))
                    for o in Select(get_el(driver, sc_name)).options
                    if clean(o.get_attribute("value"))]
        alt = next((v for v in all_vals if v != current), "")
        if alt:
            select_value_with_postback(driver, wait, sc_name, alt)
            ctrl = discover(driver)
            sc_name = ctrl.get("sender_city", sc_name)
            select_value_with_postback(driver, wait, sc_name, current)
            return discover(driver)

    svc_name = ctrl.get("service")
    if svc_name and valid_selected(driver, svc_name):
        current = cur_value(driver, svc_name)
        all_vals = [clean(o.get_attribute("value"))
                    for o in Select(get_el(driver, svc_name)).options
                    if clean(o.get_attribute("value"))]
        alt = next((v for v in all_vals if v != current), "")
        if alt:
            select_value_with_postback(driver, wait, svc_name, alt)
            ctrl = discover(driver)
            svc_name = ctrl.get("service", svc_name)
            select_value_with_postback(driver, wait, svc_name, current)
            return discover(driver)

    return discover(driver)


def parse_due_date(text: str) -> str:
    """
    Extract a due date string from a server response.
    Tries DD/MM/YYYY, then any date-like patterns.
    """
    hit = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
    if hit:
        return hit.group(1)
    hit = re.search(r"\b(\d{1,2}\s+\w+\s+\d{4})\b", text)
    return hit.group(1) if hit else ""


def extract_complaint_id(text: str) -> str:
    hit = re.search(r"Complaint\s*(?:No|ID|No\.)\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.IGNORECASE)
    if hit:
        return hit.group(1)
    # Fallback: bare number following "ID"
    hit = re.search(r"\bID\s+(\d+)\b", text, re.IGNORECASE)
    return hit.group(1) if hit else ""


def read_page_message(driver: webdriver.Chrome) -> str:
    for sel in [(By.ID, "lblErrorMessage"), (By.CSS_SELECTOR, "body")]:
        try:
            t = clean(driver.find_element(*sel).text)
            if t:
                return t
        except Exception:
            continue
    return ""


def find_submit(driver: webdriver.Chrome, ctrl: dict[str, str]):
    if ctrl.get("submit"):
        try:
            return get_el(driver, ctrl["submit"])
        except Exception:
            pass
    for btn in driver.find_elements(By.CSS_SELECTOR, "input[type='submit'], input[type='image'], button"):
        label = clean(btn.get_attribute("value") or btn.text)
        if "submit" in label.lower() or "complaint" in label.lower():
            return btn
    raise RuntimeError("Submit button not found")


# ── Core single-run function ──────────────────────────────────────────────────

def run_once(driver: webdriver.Chrome, wait: WebDriverWait) -> dict[str, Any]:
    """Execute exactly one complaint submission pass and return a structured result."""

    driver.get(ENTRY_URL)
    ready(driver, wait)
    into_iframe(driver, wait)

    # Step 1: Enter article number with Tab blur only
    ctrl = discover(driver)
    if not ctrl.get("article"):
        return {"status": "FAILED", "message": "Article field not found"}
    set_text(driver, wait, ctrl["article"], TRACKING_ID, blur=True)

    # Step 2: Wait for full ASP.NET auto-population
    auto = wait_autopopulation(driver, wait)
    if not (auto.get("booking_date") and auto.get("sender_city") and auto.get("addressee_city")):
        return {
            "status": "FAILED",
            "message": "Auto-population incomplete",
            "auto_state": auto,
        }

    # Step 3: Lifecycle registration (safe postback, no article touch)
    ctrl = discover(driver)
    ctrl = lifecycle_registration(driver, wait, ctrl)

    # Verify booking date is still present after registration
    bd_name = ctrl.get("booking_date", "")
    bd_val  = clean(get_el(driver, bd_name).get_attribute("value")) if bd_name else ""
    if not bd_val:
        return {
            "status": "LIFECYCLE_BREAK",
            "message": "Booking date lost after lifecycle registration; article field was NOT touched",
        }

    # Step 4: Service type
    if ctrl.get("service"):
        select_with_postback(driver, wait, ctrl["service"], "VPL")
        ctrl = discover(driver)

    # Step 5: Problem category
    if ctrl.get("problem"):
        select_with_postback(driver, wait, ctrl["problem"], "Pending Delivery")
        ctrl = discover(driver)

    # Step 6: Reply mode
    if ctrl.get("reply"):
        select_with_postback(driver, wait, ctrl["reply"], "Post")
        ctrl = discover(driver)

    # Step 7: District cascade
    district_v, _ = select_with_postback(driver, wait, ctrl["district"], PREFERRED_DISTRICT, require=True)
    ctrl = discover(driver)
    tehsil_v, _   = select_with_postback(driver, wait, ctrl["tehsil"],   PREFERRED_TEHSIL,   require=True)
    ctrl = discover(driver)
    location_v, _ = select_with_postback(driver, wait, ctrl["location"], PREFERRED_LOCATION, require=True)
    ctrl = discover(driver)

    # Step 8: Remaining text fields — NO article rewrite
    if ctrl.get("complainant_name"):  set_text(driver, wait, ctrl["complainant_name"],  COMPLAINANT_NAME)
    if ctrl.get("mobile"):            set_text(driver, wait, ctrl["mobile"],             MOBILE)
    if ctrl.get("booking_office"):    set_text(driver, wait, ctrl["booking_office"],     "Sahiwal")
    if ctrl.get("sender_name"):       set_text(driver, wait, ctrl["sender_name"],        SENDER_NAME)
    if ctrl.get("sender_address"):    set_text(driver, wait, ctrl["sender_address"],     SENDER_ADDRESS)
    if ctrl.get("addressee_name"):    set_text(driver, wait, ctrl["addressee_name"],     ADDRESSEE_NAME)
    if ctrl.get("addressee_address"): set_text(driver, wait, ctrl["addressee_address"],  ADDRESSEE_ADDRESS)
    if ctrl.get("remarks"):            set_text(driver, wait, ctrl["remarks"],            REMARKS)

    # Re-assert cascade without postback (keeps server state intact)
    if ctrl.get("district"):  select_value(driver, ctrl["district"],  district_v)
    if ctrl.get("tehsil"):    select_value(driver, ctrl["tehsil"],    tehsil_v)
    if ctrl.get("location"):  select_value(driver, ctrl["location"],  location_v)

    # Step 9: Submit
    find_submit(driver, ctrl).click()
    ready(driver, wait)
    into_iframe(driver, wait)

    msg = read_page_message(driver)
    cid = extract_complaint_id(msg)
    dd  = parse_due_date(msg)

    if cid and "submitted successfully" in msg.lower():
        return {"status": "SUCCESS", "complaint_id": cid, "message": clean(msg)}

    if "under process" in msg.lower() or "already" in msg.lower():
        return {"status": "DUPLICATE", "complaint_id": cid, "due_date": dd, "message": clean(msg)}

    # Required-fields retry (one extra fill pass, still NO article touch)
    if "required" in msg.lower():
        ctrl = discover(driver)
        if ctrl.get("complainant_name"):  set_text(driver, wait, ctrl["complainant_name"],  COMPLAINANT_NAME)
        if ctrl.get("mobile"):            set_text(driver, wait, ctrl["mobile"],             MOBILE)
        if ctrl.get("sender_name"):       set_text(driver, wait, ctrl["sender_name"],        SENDER_NAME)
        if ctrl.get("sender_address"):    set_text(driver, wait, ctrl["sender_address"],     SENDER_ADDRESS)
        if ctrl.get("addressee_name"):    set_text(driver, wait, ctrl["addressee_name"],     ADDRESSEE_NAME)
        if ctrl.get("addressee_address"): set_text(driver, wait, ctrl["addressee_address"],  ADDRESSEE_ADDRESS)
        if ctrl.get("remarks"):            set_text(driver, wait, ctrl["remarks"],            REMARKS)
        if ctrl.get("district"):  select_value(driver, ctrl["district"],  district_v)
        if ctrl.get("tehsil"):    select_value(driver, ctrl["tehsil"],    tehsil_v)
        if ctrl.get("location"):  select_value(driver, ctrl["location"],  location_v)
        find_submit(driver, ctrl).click()
        ready(driver, wait)
        into_iframe(driver, wait)
        msg = read_page_message(driver)
        cid = extract_complaint_id(msg)
        dd  = parse_due_date(msg)
        if cid and "submitted successfully" in msg.lower():
            return {"status": "SUCCESS",   "complaint_id": cid, "message": clean(msg)}
        if "under process" in msg.lower() or "already" in msg.lower():
            return {"status": "DUPLICATE", "complaint_id": cid, "due_date": dd, "message": clean(msg)}

    return {"status": "FAILED", "message": clean(msg) or "No recognisable response"}


# ── Two-run orchestration ─────────────────────────────────────────────────────

def two_run_validation() -> dict[str, Any]:
    results: dict[str, Any] = {
        "first_submission":  {},
        "second_submission": {},
    }

    # ── Run 1 ─────────────────────────────────────────────────────────────────
    driver = build_driver()
    wait   = WebDriverWait(driver, 30)
    try:
        r1 = run_once(driver, wait)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    results["first_submission"] = r1

    if r1.get("status") == "LIFECYCLE_BREAK":
        results["second_submission"] = {"status": "SKIPPED", "reason": "Lifecycle break in run 1"}
        return results

    # ── Run 2 ─────────────────────────────────────────────────────────────────
    driver = build_driver()
    wait   = WebDriverWait(driver, 30)
    try:
        r2 = run_once(driver, wait)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    results["second_submission"] = r2
    return results


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        result = two_run_validation()
        print(json.dumps(result, indent=2))
    except WebDriverException as exc:
        print(json.dumps({"status": "FAILED", "message": f"ChromeDriver: {exc}"}))
    except Exception as exc:
        print(json.dumps({"status": "FAILED", "message": str(exc)}))
