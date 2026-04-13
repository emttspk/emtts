import time
import re
import gspread
from datetime import datetime, timedelta
from oauth2client.service_account import ServiceAccountCredentials
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select
from webdriver_manager.chrome import ChromeDriverManager


# ================= GOOGLE SHEET SETUP ================= #

scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
client = gspread.authorize(creds)

sheet = client.open("PakistanPost Tracking System").sheet1
headers = sheet.row_values(1)
records = sheet.get_all_records()

def col(name):
    return headers.index(name) + 1


# ================= SELENIUM SETUP ================= #

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--window-size=1920,1080")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)


# ================= TRACKING PARSER ================= #

def get_full_tracking(tracking_number):

    driver.get("https://ep.gov.pk/international_tracking.asp")
    time.sleep(3)

    input_box = driver.find_element(By.NAME, "textfieldz")
    input_box.clear()
    input_box.send_keys(tracking_number)
    input_box.send_keys(Keys.RETURN)

    time.sleep(5)

    driver.switch_to.frame(driver.find_elements(By.TAG_NAME, "iframe")[0])
    page_text = driver.find_element(By.TAG_NAME, "body").text
    driver.switch_to.default_content()

    lines = [line.strip() for line in page_text.split("\n") if line.strip()]

    # Extended parser for complete multi-section extraction (VPL + MOS cycles).
    date_pattern = r"^[A-Za-z]+ \d{1,2}, \d{4}$"
    time_pattern = r"^\d{1,2}:\d{2}\s*(AM|PM)$"
    article_header_pattern = re.compile(r"Article\s+Tracking\s+No\s*:\s*([A-Za-z0-9]+)", re.IGNORECASE)

    def _extract_offices(src_lines):
        b = ""
        d = ""
        for raw_line in src_lines:
            line = str(raw_line)
            if "Booking Office" in line:
                parts = line.split("Delivery Office")
                b = parts[0].replace("Booking Office :", "").strip()
                if len(parts) > 1:
                    d = parts[1].replace(":", "").strip()
        return b, d

    def _extract_history(src_lines):
        out = []
        current_date = ""
        i = 0
        while i < len(src_lines):
            line = str(src_lines[i]).strip()
            if re.match(date_pattern, line):
                current_date = line
                i += 1
                continue
            if current_date and re.match(time_pattern, line, re.IGNORECASE):
                j = i + 1
                status_line = ""
                while j < len(src_lines):
                    candidate = str(src_lines[j]).strip()
                    if not candidate:
                        j += 1
                        continue
                    if re.match(date_pattern, candidate):
                        break
                    if re.match(time_pattern, candidate, re.IGNORECASE):
                        j += 1
                        continue
                    status_line = candidate
                    break
                if status_line:
                    out.append((current_date, line.upper(), status_line))
                i = max(i + 1, j)
                continue
            i += 1

        # Preserve original ordering guarantee.
        def _parse_dt_local(entry):
            try:
                return datetime.strptime(entry[0] + " " + entry[1], "%B %d, %Y %I:%M %p")
            except Exception:
                return datetime.min

        out.sort(key=_parse_dt_local)
        return out

    # Split complete page into independent article sections.
    sections = []
    marker_indexes = [idx for idx, l in enumerate(lines) if article_header_pattern.search(str(l))]
    if marker_indexes:
        marker_indexes.append(len(lines))
        for k in range(len(marker_indexes) - 1):
            start = marker_indexes[k]
            end = marker_indexes[k + 1]
            sec_lines = lines[start:end]
            header_match = article_header_pattern.search(str(sec_lines[0])) if sec_lines else None
            sec_tn = header_match.group(1).strip().upper() if header_match else ""
            sections.append({"tracking_number": sec_tn, "lines": sec_lines})
    else:
        sections.append({"tracking_number": str(tracking_number).strip().upper(), "lines": lines})

    # Priority: If MOS section exists anywhere, use MOS cycle.
    requested_tn = str(tracking_number).strip().upper()
    selected_section = None
    mos_sections = [s for s in sections if str(s.get("tracking_number", "")).upper().startswith("MOS")]
    if mos_sections:
        selected_section = mos_sections[-1]
    else:
        for s in sections:
            if str(s.get("tracking_number", "")).upper() == requested_tn:
                selected_section = s
                break
        if selected_section is None and sections:
            selected_section = sections[0]

    selected_lines = selected_section["lines"] if selected_section else lines
    selected_tracking_number = str(selected_section.get("tracking_number", "")).strip().upper() if selected_section else ""
    booking_office, delivery_office = _extract_offices(selected_lines)
    if not booking_office and not delivery_office:
        booking_office, delivery_office = _extract_offices(lines)

    history = _extract_history(selected_lines)
    if not history and selected_lines is not lines:
        history = _extract_history(lines)

    if not history:
        return None

    # Step 2: Sort history ascending by datetime so order is always correct
    def _parse_dt_local(entry):
        try:
            return datetime.strptime(entry[0] + " " + entry[1], "%B %d, %Y %I:%M %p")
        except Exception:
            return datetime.min

    history.sort(key=_parse_dt_local)

    # Step 4: Latest event = max by datetime; after sort this is always history[-1]
    latest_date, latest_time, latest_status = history[-1]
    first_date = history[0][0]

    clean_status = re.sub(r"\(BagID:.*?\)", "", latest_status).strip()

    # Step 6: Extract city by splitting before known status keywords, not just first word
    _CITY_SPLIT_KW = ["Dispatch", "Received", "Sent", "Delivered", "Undelivered", "Arrival", "Return"]
    latest_city = ""
    for _kw in _CITY_SPLIT_KW:
        _idx = clean_status.lower().find(_kw.lower())
        if _idx > 0:
            _candidate = clean_status[:_idx].strip()
            if _candidate:
                latest_city = _candidate
                break
    if not latest_city:
        latest_city = clean_status.split(" ")[0] if clean_status else ""

    # Step 10: Debug log – sorted history and detected latest event
    print(f"[TrackDebug] {history[0][0] if history else '?'} Sorted history ({len(history)} entries):")
    for _e in history:
        print(f"  {_e[0]} {_e[1]} | {_e[2]}")
    print(f"[TrackDebug] Latest event: {latest_date} {latest_time} | {latest_status}")

    # Section 5: Scan ALL lines for every MOS ID on the page
    _mos_full_re = re.compile(r"(MOS[A-Z0-9]+)", re.IGNORECASE)
    _all_mos_ids = list({m.strip().upper() for l in lines for m in _mos_full_re.findall(str(l))})

    return {
        "booking_office": booking_office,
        "delivery_office": delivery_office,
        "first_date": first_date,
        "latest_date": latest_date,
        "latest_time": latest_time,
        "latest_city": latest_city,
        "latest_status": clean_status,
        "selected_tracking_number": selected_tracking_number or str(tracking_number).strip().upper(),
        "all_mos_ids": _all_mos_ids,
        "history": history
    }


# ================= TRACKING INTERPRETER ================= #

import re as _re

_NORM_MAP = [
    ("delivered to addressee",      "DELIVERED"),
    ("delivered to consignee",       "DELIVERED"),
    ("return to sender",             "RETURNED"),
    ("returned to sender",           "RETURNED"),
    ("sent out for delivery",        "OUT_FOR_DELIVERY"),
    ("out for delivery",             "OUT_FOR_DELIVERY"),
    ("arrival at delivery office",   "AT_DELIVERY_OFFICE"),
    ("arrived at delivery office",   "AT_DELIVERY_OFFICE"),
    ("received at delivery office",  "AT_DELIVERY_OFFICE"),
    ("dispatch from dmo",            "IN_TRANSIT"),
    ("dispatched from dmo",          "IN_TRANSIT"),
    ("in transit",                   "IN_TRANSIT"),
    ("dispatch",                     "IN_TRANSIT"),
    ("received at dmo",              "BOOKED"),
    ("received at origin",           "BOOKED"),
    ("booking",                      "BOOKED"),
    ("booked",                       "BOOKED"),
    ("undelivered",                  "FAILED_DELIVERY"),
    ("not delivered",                "FAILED_DELIVERY"),
    ("return",                       "RETURN_IN_PROCESS"),
    ("delivered",                    "DELIVERED"),
]

_STEP_RANK = {
    "BOOKED": 1, "IN_TRANSIT": 2, "AT_DELIVERY_OFFICE": 3,
    "OUT_FOR_DELIVERY": 4, "FAILED_DELIVERY": 4,
    "RETURN_IN_PROCESS": 3, "RETURNED": 5, "DELIVERED": 5,
}

def _normalize_status(raw):
    cleaned = _re.sub(r"\(BagID:.*?\)", "", raw).strip().lower()
    for key, value in _NORM_MAP:
        if key in cleaned:
            return value
    return raw.strip().upper()

def _interpret_tracking_flow(history, booking_office="", delivery_office=""):
    if not history:
        return "BOOKED"
    highest_rank = 0
    latest_norm = "BOOKED"
    delivered = returned_final = return_in_process = failed_delivery = False
    for _, _, raw in history:
        norm = _normalize_status(raw)
        rank = _STEP_RANK.get(norm, 0)
        if norm == "DELIVERED":
            delivered = True; highest_rank = 5; latest_norm = norm
        elif norm == "RETURNED":
            returned_final = True; highest_rank = 5; latest_norm = norm
        elif norm == "RETURN_IN_PROCESS":
            return_in_process = True
            highest_rank = max(highest_rank, 3); latest_norm = norm
        elif norm == "FAILED_DELIVERY":
            failed_delivery = True
            highest_rank = max(highest_rank, 4); latest_norm = norm
        elif rank >= highest_rank:
            highest_rank = rank; latest_norm = norm
    if delivered:          return "DELIVERED"
    if returned_final:     return "RETURNED"
    if return_in_process:  return "RETURN_IN_PROCESS"
    if failed_delivery:    return "FAILED_DELIVERY"
    return latest_norm

def classify_shipment(data, tracking_number):
    """Strict priority-based classification."""
    tn = str(tracking_number).strip().upper()
    # Step 6: fresh copy – never carry state from previous call
    full_history = list(data.get("history") or [])

    # Section 2/6: If MOS section was selected for this article → DELIVERED
    _sel_tn = str(data.get("selected_tracking_number", "")).strip().upper()
    _all_mos = list(data.get("all_mos_ids") or [])
    if not tn.startswith("MOS"):
        if _sel_tn.startswith("MOS"):
            print(f"[Classification] {tracking_number} | DELIVERED | MOS section selected: {_sel_tn}")
            return "DELIVERED"
        if _all_mos:
            print(f"[Classification] {tracking_number} | DELIVERED | MOS in full page: {_all_mos[0]}")
            return "DELIVERED"

    # Step 5: MOS is always independent tracking; never mixed with VPL
    if tn.startswith("MOS"):
        for _, _, raw in full_history:
            _t = raw.lower()
            # "delivered" but not "undelivered" (substring guard)
            if "delivered" in _t and "undelivered" not in _t:
                print(f"[Classification] {tracking_number} | DELIVERED | MOS + delivered event: {raw[:60]}")
                return "DELIVERED"
        print(f"[Classification] {tracking_number} | IN_TRANSIT | MOS, no delivery event found")
        return "IN_TRANSIT"

    # Rule 1: ANY "delivered" event (excludes lines containing "undelivered") → DELIVERED
    for _, _, raw in full_history:
        _t = raw.lower()
        if "delivered" in _t and "undelivered" not in _t:
            print(f"[Classification] {tracking_number} | DELIVERED | delivered event: {raw[:60]}")
            return "DELIVERED"

    # Rule 2: ANY "undelivered" event (no delivered found above) → UNDELIVERED
    for _, _, raw in full_history:
        if "undelivered" in str(raw).lower():
            print(f"[Classification] {tracking_number} | UNDELIVERED | undelivered event: {raw[:60]}")
            return "UNDELIVERED"

    # Rule 3: Return to sender
    for _, _, raw in full_history:
        _t = raw.lower()
        if "return to sender" in _t or "returned to sender" in _t:
            print(f"[Classification] {tracking_number} | RETURN | return to sender event: {raw[:60]}")
            return "RETURN"

    # Rule 4: Latest sorted event is sent out for delivery
    if full_history:
        _latest_t = full_history[-1][2].lower()
        if "sent out for delivery" in _latest_t:
            print(f"[Classification] {tracking_number} | OUT_FOR_DELIVERY | latest event: {full_history[-1][2][:60]}")
            return "OUT_FOR_DELIVERY"

    # Rule 5: Any dispatch / received at / arrival → IN_TRANSIT; never PENDING with movement
    for _, _, raw in full_history:
        _t = str(raw).lower()
        if "dispatch" in _t or "received at" in _t or "arrival" in _t or "sent out" in _t:
            print(f"[Classification] {tracking_number} | IN_TRANSIT | movement event: {raw[:60]}")
            return "IN_TRANSIT"

    # Rule 6: Only when absolutely no valid events
    _reason = "no meaningful tracking events" if full_history else "empty history"
    print(f"[Classification] {tracking_number} | PENDING | {_reason}")
    return "PENDING"

def _is_complaint_enabled(first_date_str):
    """Return True only when >= 8 days have elapsed since booking."""
    if not first_date_str:
        return False
    try:
        booked = datetime.strptime(first_date_str, "%B %d, %Y")
        return (datetime.today() - booked).days >= 8
    except Exception:
        return False


# ================= INTELLIGENCE LAYER (ADDITIVE ONLY) ================= #

def _safe_col(name):
    return headers.index(name) + 1 if name in headers else None


def _safe_update_cell(row_idx, column_name, value):
    c = _safe_col(column_name)
    if c:
        sheet.update_cell(row_idx, c, value)


def _extract_mos_number(tracking_number, history):
    tn = str(tracking_number or "").strip().upper()
    if tn.startswith("MOS"):
        return tn
    for _, _, status_text in history:
        match = re.search(r"\b(MOS[A-Z0-9]{4,})\b", str(status_text), re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return "-"


def _contains_delivery_city(status_text, delivery_city):
    if not delivery_city:
        return False
    return delivery_city.lower() in str(status_text).lower()


def _extract_city_token(status_text):
    words = re.findall(r"[A-Za-z]+", str(status_text))
    if not words:
        return ""
    return words[0].upper()


def map_tracking_stage(history):
    stage = "INITIATED"
    seen_destination = False

    for _, _, raw_status in history:
        text = str(raw_status).lower()

        if "mos" in text:
            stage = "MOS_GENERATED"

        if "return to sender" in text or "returned to sender" in text:
            stage = "RETURNED"
            continue

        if (
            "undelivered" in text or
            "refused" in text or
            "deposit" in text or
            "not found" in text
        ):
            stage = "FAILED"
            continue

        if "delivered to addressee" in text:
            stage = "DELIVERED"
            continue

        if "sent out for delivery" in text:
            stage = "OUT_FOR_DELIVERY"
            continue

        if "dispatch to delivery office" in text:
            seen_destination = True
            stage = "ARRIVED_DESTINATION"
            continue

        if "dispatch from district mail office" in text or "dispatch from dmo" in text:
            stage = "IN_TRANSIT"
            continue

        if "received at dmo" in text or "booked" in text:
            if stage == "INITIATED":
                stage = "INITIATED"

        if seen_destination and ("dispatch" in text and "origin" in text):
            stage = "RETURN_IN_PROGRESS"

    return stage


def _detect_return_flag(history, booking_office, delivery_office):
    booking_token = _extract_city_token(booking_office)
    delivery_token = _extract_city_token(delivery_office)

    reached_delivery = False
    moved_to_origin = False

    for _, _, status_text in history:
        status_upper = str(status_text).upper()
        if delivery_token and delivery_token in status_upper:
            reached_delivery = True
        if reached_delivery and booking_token and booking_token in status_upper:
            moved_to_origin = True

    return "YES" if moved_to_origin else "NO"


def _inactivity_bucket(latest_datetime):
    delta = datetime.today() - latest_datetime
    if delta > timedelta(hours=72):
        return "CRITICAL_DELAY"
    if delta > timedelta(hours=48):
        return "NO_MOVEMENT_48H"
    if delta > timedelta(hours=24):
        return "SLOW_MOVEMENT"
    return "ACTIVE"


def _derive_system_status(data, tracking_number, shipment_status, lifecycle_stage, mos_number):
    history = data.get("history", [])
    booking_office = str(data.get("booking_office", ""))
    delivery_office = str(data.get("delivery_office", ""))
    latest_status_text = str(data.get("latest_status", ""))
    tn = str(tracking_number or "").strip().upper()

    booking_token = _extract_city_token(booking_office)
    delivery_token = _extract_city_token(delivery_office)

    # MOS has highest priority and overrides all other states.
    if tn.startswith("MOS"):
        return "DELIVERED"

    # A. Delivered at delivery office with delivery city match
    for _, _, status_text in history:
        s = str(status_text)
        sl = s.lower()
        su = s.upper()
        if "delivered at delivery office" in sl:
            city_match = (delivery_token and delivery_token in su) or _contains_delivery_city(s, delivery_office)
            if city_match:
                return "DELIVERED"

    # B3. Returned final: reached booking office again + closure signal
    returned_keywords_seen = any(
        any(k in str(st).lower() for k in ("return", "refused", "deposit", "return to vp clerk"))
        for _, _, st in history
    )
    reached_booking_after_delivery = False
    reached_delivery_first = False
    for _, _, status_text in history:
        su = str(status_text).upper()
        if delivery_token and delivery_token in su:
            reached_delivery_first = True
        if reached_delivery_first and booking_token and booking_token in su:
            reached_booking_after_delivery = True
    closure_seen = any(
        any(k in str(st).lower() for k in ("delivered", "closed", "final", "disposed", "completed"))
        for _, _, st in history
    )
    if reached_booking_after_delivery and closure_seen and returned_keywords_seen:
        return "RETURNED"

    # B2. Return initiated
    if returned_keywords_seen:
        return "RETURN_INITIATED"

    # B1. Reverse direction (delivery city -> booking city)
    if reached_booking_after_delivery:
        return "RETURN_IN_PROCESS"

    # D2. Out for delivery
    if any("sent out for delivery" in str(st).lower() for _, _, st in history):
        return "OUT_FOR_DELIVERY"

    # D1. Arrived at delivery city / office
    arrived_delivery_city = any(
        ("dispatch to delivery office" in str(st).lower())
        or ("delivery office" in str(st).lower() and _contains_delivery_city(st, delivery_office))
        for _, _, st in history
    )
    if arrived_delivery_city:
        return "ARRIVED_AT_DELIVERY_CITY"

    # E4. Held at RLO
    if any("rlo" in str(st).lower() and "held" in str(st).lower() for _, _, st in history):
        return "HELD_AT_RLO"

    # E1/E2/E3 pending windows based on latest timestamp
    latest_dt = None
    try:
        latest_dt = datetime.strptime(
            str(data.get("latest_date", "")) + " " + str(data.get("latest_time", "")),
            "%B %d, %Y %I:%M %p"
        )
    except Exception:
        latest_dt = None

    if latest_dt is not None:
        age_hours = (datetime.today() - latest_dt).total_seconds() / 3600.0
        stuck_delivery_office = "delivery office" in latest_status_text.lower() and age_hours >= 72
        reached_delivery_city = any(_contains_delivery_city(st, delivery_office) for _, _, st in history)
        if stuck_delivery_office:
            return "CRITICAL_DELAY"
        if age_hours >= 72:
            return "PENDING_72H"
        if age_hours >= 48 and reached_delivery_city:
            return "PENDING_48H"

    # C. In transit movement
    transit_seen = any(
        ("dispatch" in str(st).lower()) or ("received at" in str(st).lower()) or ("arrival" in str(st).lower())
        for _, _, st in history
    )
    if transit_seen:
        return "IN_TRANSIT"

    return "ACTIVE"


def _derive_tracking_category(system_status, inactivity_status, return_flag):
    if system_status == "DELIVERED":
        return "DELIVERED_COMPLETE"
    if system_status == "FAILED":
        return "FAILED_ATTEMPT"
    if return_flag == "YES" or system_status in ("RETURN_IN_PROGRESS", "RETURNED"):
        return "RETURN_ACTION_REQUIRED"
    if inactivity_status == "CRITICAL_DELAY":
        return "PENDING_72H"
    if inactivity_status == "NO_MOVEMENT_48H":
        return "PENDING_48H"
    if inactivity_status == "SLOW_MOVEMENT":
        return "PENDING_24H"
    return "ACTIVE"


def build_intelligence_layer(data, tracking_number, shipment_status, days_passed, latest_datetime, base_log):
    history = data.get("history", [])
    lifecycle_stage = map_tracking_stage(history)
    mos_number = _extract_mos_number(tracking_number, history)
    # Section 5: Supplement MOS extraction from selected section and full-page scan
    if mos_number == "-":
        _sel = str(data.get("selected_tracking_number", "")).strip().upper()
        if _sel.startswith("MOS"):
            mos_number = _sel
        else:
            for _m in (data.get("all_mos_ids") or []):
                _m_upper = str(_m).strip().upper()
                if _m_upper.startswith("MOS"):
                    mos_number = _m_upper
                    break
    inactivity_status = _inactivity_bucket(latest_datetime)
    return_flag = _detect_return_flag(history, data.get("booking_office", ""), data.get("delivery_office", ""))
    system_status = _derive_system_status(data, tracking_number, shipment_status, lifecycle_stage, mos_number)
    complaint_eligible = "YES" if days_passed >= 8 else "NO"
    tracking_category = _derive_tracking_category(system_status, inactivity_status, return_flag)

    # Append inactivity signal to current log (do not overwrite base message).
    if inactivity_status != "ACTIVE":
        last_log = f"{base_log} | {inactivity_status}"
    else:
        last_log = base_log

    return {
        "system_status": system_status,
        "return_flag": return_flag,
        "mos_number": mos_number,
        "complaint_eligible": complaint_eligible,
        "tracking_category": tracking_category,
        "last_log": last_log,
    }


# ================= COMPLAINT SUBMISSION ================= #

from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def submit_complaint(tracking_number, phone_number):

    driver.get("https://ep.gov.pk/complaints.asp")
    time.sleep(3)

    driver.switch_to.frame(driver.find_element(By.ID, "IFR"))

    wait = WebDriverWait(driver, 15)

    # Fill Article Number
    article_input = wait.until(EC.presence_of_element_located((By.NAME, "txt_ArticleNo")))
    article_input.clear()
    article_input.send_keys(tracking_number)

    # Wait for ASP.NET postback to complete
    time.sleep(4)

    # Fill Phone Number
    phone_input = wait.until(EC.presence_of_element_located((By.NAME, "txt_ComplainantPhNo")))
    phone_input.clear()
    phone_input.send_keys(phone_number)

    # Wait until dropdown has more than 1 option
    wait.until(lambda d: len(d.find_elements(By.XPATH, "//select[@name='ddl_ProblemCategory']/option")) > 1)

    problem_dropdown = driver.find_element(By.NAME, "ddl_ProblemCategory")
    Select(problem_dropdown).select_by_index(1)

    time.sleep(2)

    submit_btn = driver.find_element(By.NAME, "ImageButton1")
    submit_btn.click()

    time.sleep(5)

    page_text = driver.find_element(By.TAG_NAME, "body").text

    driver.switch_to.default_content()

    return page_text


# ================= MAIN PROCESS LOOP ================= #

for index, row in enumerate(records):

    tracking_number = row["Tracking_Number"]
    if not tracking_number:
        continue

    print("Processing:", tracking_number)

    data = get_full_tracking(tracking_number)
    if not data:
        continue

    # Update tracking fields
    sheet.update_cell(index+2, col("Booking_Office"), data["booking_office"])
    sheet.update_cell(index+2, col("Delivery_Office"), data["delivery_office"])
    sheet.update_cell(index+2, col("First_Scan_Date"), data["first_date"])
    sheet.update_cell(index+2, col("Latest_Date"), data["latest_date"])
    sheet.update_cell(index+2, col("Latest_Time"), data["latest_time"])
    sheet.update_cell(index+2, col("Latest_City"), data["latest_city"])
    sheet.update_cell(index+2, col("Latest_Status"), data["latest_status"])

    # Days calculation
    first_scan = datetime.strptime(data["first_date"], "%B %d, %Y")
    days_passed = (datetime.today() - first_scan).days
    sheet.update_cell(index+2, col("Days_Since_Booking"), days_passed)

    shipment_status = classify_shipment(data, tracking_number)
    sheet.update_cell(index+2, col("Shipment_Status"), shipment_status)

    # 48 hour inactivity
    latest_datetime = datetime.strptime(
        data["latest_date"] + " " + data["latest_time"],
        "%B %d, %Y %I:%M %p"
    )

    if datetime.today() - latest_datetime > timedelta(hours=48):
        inactivity_flag = "No movement 48+ hrs"
    else:
        inactivity_flag = "Active"

    # Complaint logic  (enabled only when >= 8 days since booking)
    if _is_complaint_enabled(data["first_date"]) and shipment_status not in ("DELIVERED", "RETURNED", "RETURN_IN_PROCESS"):

        if row["Complaint_Status"] != "FILED":

            print("Submitting complaint for:", tracking_number)

            response_text = submit_complaint(tracking_number, "03001234567")

            if "Complaint No" in response_text:
                complaint_status = "FILED"
                match = re.search(r"Complaint\s*No[:\s]*([A-Za-z0-9]+)", response_text)
                if match:
                    complaint_number = match.group(1)
                    log_message = f"Complaint Submitted | No: {complaint_number}"
                else:
                    log_message = "Complaint Submitted"

            elif "already" in response_text.lower():
                complaint_status = "FILED"
                log_message = "Complaint Already Logged"

            else:
                complaint_status = "ERROR"
                log_message = "Complaint Failed"

        else:
            complaint_status = row["Complaint_Status"]
            log_message = "Already Filed"

        delay_status = "DELAYED"

    else:
        complaint_status = "NOT_REQUIRED"
        delay_status = "NORMAL"
        log_message = inactivity_flag

    intelligence = build_intelligence_layer(
        data=data,
        tracking_number=tracking_number,
        shipment_status=shipment_status,
        days_passed=days_passed,
        latest_datetime=latest_datetime,
        base_log=log_message,
    )

    sheet.update_cell(index+2, col("Delay_Status"), delay_status)
    sheet.update_cell(index+2, col("Complaint_Status"), complaint_status)
    sheet.update_cell(index+2, col("Last_Log"), intelligence["last_log"])

    # Additive intelligence columns (writes only when columns already exist).
    _safe_update_cell(index+2, "System_Status", intelligence["system_status"])
    _safe_update_cell(index+2, "Return_Flag", intelligence["return_flag"])
    _safe_update_cell(index+2, "MOS_Number", intelligence["mos_number"])
    _safe_update_cell(index+2, "Complaint_Eligible", intelligence["complaint_eligible"])
    _safe_update_cell(index+2, "Tracking_Category", intelligence["tracking_category"])

    print(tracking_number, "|", shipment_status, "|", delay_status)

    time.sleep(5)


driver.quit()
print("Automation completed successfully.")
