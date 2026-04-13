import json
import re
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

import app

TRACKING_ID = "VPL14438142"
MOBILE = "03331234567"
REMARKS = "Pending delivery complaint for article VPL14438142. Kindly process urgently."


BINDING_ERROR_PATTERNS = [
    (r"article\s*no\s*required", "Article no required"),
    (r"mobile\s*no\s*required", "Mobile no required"),
    (r"booking\s*date", "Booking date required"),
    (r"sender\s*city", "Sender city required"),
    (r"select\s*recipent\s*city|recipient\s*city", "Recipient city required"),
    (r"remarks\s*are\s*required", "Remarks required"),
    (r"--\s*select\s*service\s*--", "Problem category still default"),
]


def clean_text(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def normalize(v: str) -> str:
    t = clean_text(v).upper()
    for token in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
        t = t.replace(token, "")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def seed_payload(form: Any) -> dict[str, str]:
    payload: dict[str, str] = {}
    for node in form.find_all(["input", "textarea"]):
        name = clean_text(node.get("name"))
        if not name:
            continue
        typ = clean_text(node.get("type")).lower()
        if typ in ("checkbox", "radio") and not node.has_attr("checked"):
            continue
        payload[name] = str(node.get("value") or "")
    return payload


def find_select(form: Any, patterns: list[str]) -> str:
    selects = form.find_all("select")
    for pattern in patterns:
        rx = re.compile(pattern, re.IGNORECASE)
        for s in selects:
            name = clean_text(s.get("name"))
            sid = clean_text(s.get("id"))
            if rx.search(name) or rx.search(sid):
                return name
    return ""


def find_input(form: Any, patterns: list[str], node_tag: str = "input") -> str:
    nodes = form.find_all(node_tag)
    for pattern in patterns:
        rx = re.compile(pattern, re.IGNORECASE)
        for n in nodes:
            name = clean_text(n.get("name"))
            nid = clean_text(n.get("id"))
            if rx.search(name) or rx.search(nid):
                return name
    return ""


def options(form: Any, select_name: str) -> list[tuple[str, str]]:
    if not select_name:
        return []
    sel = form.find("select", attrs={"name": select_name})
    if sel is None:
        return []
    out: list[tuple[str, str]] = []
    for o in sel.find_all("option"):
        out.append((clean_text(o.get("value")), clean_text(o.get_text(" ", strip=True))))
    return out


def first_valid_option(opts: list[tuple[str, str]]) -> tuple[str, str]:
    for val, txt in opts:
        if val and "select" not in txt.lower():
            return val, txt
    return "", ""


def match_option(opts: list[tuple[str, str]], preferred: str) -> tuple[str, str]:
    pref = normalize(preferred)
    for val, txt in opts:
        if not val:
            continue
        if normalize(txt) == pref and pref:
            return val, txt
    for val, txt in opts:
        if not val:
            continue
        nt = normalize(txt)
        if pref and (pref in nt or nt in pref):
            return val, txt
    if len(pref) >= 3:
        key = pref[:3]
        for val, txt in opts:
            if not val:
                continue
            if normalize(txt).startswith(key):
                return val, txt
    return first_valid_option(opts)


def parse_message(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html or "", "html.parser")
    node = soup.find(id="lblErrorMessage")
    message = clean_text(node.get_text(" ", strip=True) if node else "")
    if not message:
        message = clean_text(soup.get_text(" ", strip=True))

    low = message.lower()
    success = "submitted successfully" in low
    duplicate = "already under process" in low

    cid = ""
    m = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", message, flags=re.IGNORECASE)
    if m:
        cid = m.group(1)
    if not cid:
        m2 = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", html or "", flags=re.IGNORECASE)
        if m2:
            cid = m2.group(1)

    due = ""
    d = re.search(r"Due\s*Date\s*(?:on)?\s*([0-3]?\d/[0-1]?\d/\d{4}|\d{4}-\d{1,2}-\d{1,2})", message, flags=re.IGNORECASE)
    if d:
        due = d.group(1)

    binding_errors = []
    for pattern, label in BINDING_ERROR_PATTERNS:
        if re.search(pattern, message, flags=re.IGNORECASE):
            binding_errors.append(label)

    return {
        "message": message,
        "success": success,
        "duplicate": duplicate,
        "complaint_id": cid,
        "due_date": due,
        "binding_errors": binding_errors,
    }


def post_form(session: requests.Session, form_url: str, form: Any, payload: dict[str, str]) -> tuple[str, Any]:
    action = clean_text(form.get("action"))
    post_url = urljoin(form_url, action) if action else form_url
    resp = session.post(
        post_url,
        data=payload,
        timeout=45,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")
    return html, soup.find("form")


def extract_live_field_names(form: Any) -> dict[str, str]:
    return {
        "article": find_input(form, [r"txt_?ArticleNo", r"ArticleNo"]),
        "complainant_name": find_input(form, [r"Complainant.*Name"]),
        "mobile": find_input(form, [r"Complainant.*Mobile", r"txtMobileNo", r"Mobile"]),
        "booking_date": find_input(form, [r"BookingDate"]),
        "booking_office": find_input(form, [r"BookingOffice"]),
        "sender_name": find_input(form, [r"Sender.*Name"]),
        "sender_address": find_input(form, [r"Sender.*Address"]),
        "addressee_name": find_input(form, [r"Addressee.*Name", r"Receiver.*Name", r"recipent.*name"]),
        "addressee_address": find_input(form, [r"Addressee.*Address", r"Receiver.*Address", r"recipent.*address"]),
        "remarks": find_input(form, [r"Remarks"], node_tag="textarea") or find_input(form, [r"Remarks"], node_tag="input"),
        "problem_category": find_select(form, [r"ProblemCategory", r"ddl_ProblemCategory"]),
        "reply_mode": find_select(form, [r"PreferredModeOfReply", r"ReplyMode"]),
        "service_type": find_select(form, [r"ServiceType"]),
        "sender_city": find_select(form, [r"SenderCity"]),
        "addressee_city": find_select(form, [r"AddresseeCity", r"ReceiverCity"]),
        "district": find_select(form, [r"DDDistrict", r"District"]),
        "tehsil": find_select(form, [r"DDTehsil", r"Tehsil"]),
        "location": find_select(form, [r"DDLocations", r"Location"]),
    }


def bind_required_fields(form: Any, payload: dict[str, str], names: dict[str, str], tracking: dict[str, Any], district_value: str = "", tehsil_value: str = "", location_value: str = "") -> dict[str, str]:
    sender_name = clean_text(tracking.get("sender_name")) or "Global Suppliers"
    sender_address = clean_text(tracking.get("sender_address")) or "-"
    addressee_name = clean_text(tracking.get("consignee_name")) or "Addressee"
    addressee_address = clean_text(tracking.get("consignee_address")) or "-"
    booking_office = clean_text(tracking.get("booking_office"))
    delivery_city = clean_text(tracking.get("delivery_office")) or clean_text(tracking.get("consignee_city"))

    if names["article"]:
        payload[names["article"]] = TRACKING_ID

    if names["complainant_name"]:
        payload[names["complainant_name"]] = sender_name

    if names["mobile"]:
        payload[names["mobile"]] = MOBILE
    payload["txtComplainantMobile"] = MOBILE
    payload["txtMobileNo"] = MOBILE

    if names["booking_date"]:
        current_bd = clean_text(payload.get(names["booking_date"], ""))
        payload[names["booking_date"]] = current_bd or "23/09/2024"

    if names["booking_office"] and booking_office:
        payload[names["booking_office"]] = booking_office

    if names["sender_name"]:
        payload[names["sender_name"]] = sender_name
    if names["sender_address"]:
        payload[names["sender_address"]] = sender_address
    if names["addressee_name"]:
        payload[names["addressee_name"]] = addressee_name
    if names["addressee_address"]:
        payload[names["addressee_address"]] = addressee_address

    if names["remarks"]:
        payload[names["remarks"]] = REMARKS
    payload["txtRemarks"] = REMARKS

    if names["service_type"]:
        svc_opts = options(form, names["service_type"])
        v, _ = match_option(svc_opts, "VPL")
        if v:
            payload[names["service_type"]] = v

    if names["reply_mode"]:
        rm_opts = options(form, names["reply_mode"])
        v, _ = match_option(rm_opts, "Post")
        if v:
            payload[names["reply_mode"]] = v

    if names["problem_category"]:
        pc_opts = options(form, names["problem_category"])
        v, _ = match_option(pc_opts, "Pending Delivery")
        if not v:
            v, _ = first_valid_option(pc_opts)
        if v:
            payload[names["problem_category"]] = v

    if names["sender_city"]:
        sc_opts = options(form, names["sender_city"])
        v, _ = match_option(sc_opts, booking_office or "Sahiwal")
        if not v:
            v, _ = first_valid_option(sc_opts)
        if v:
            payload[names["sender_city"]] = v

    if names["addressee_city"]:
        rc_opts = options(form, names["addressee_city"])
        v, _ = match_option(rc_opts, delivery_city)
        if not v:
            v, _ = first_valid_option(rc_opts)
        if v:
            payload[names["addressee_city"]] = v

    if names["district"] and district_value:
        payload[names["district"]] = district_value
    if names["tehsil"] and tehsil_value:
        payload[names["tehsil"]] = tehsil_value
    if names["location"] and location_value:
        payload[names["location"]] = location_value

    payload["__EVENTTARGET"] = ""
    payload["__EVENTARGUMENT"] = ""

    return payload


def sanitized_payload(payload: dict[str, str], names: dict[str, str]) -> dict[str, str]:
    keys = {
        names.get("article", ""),
        names.get("mobile", ""),
        names.get("booking_date", ""),
        names.get("problem_category", ""),
        names.get("reply_mode", ""),
        names.get("service_type", ""),
        names.get("sender_city", ""),
        names.get("addressee_city", ""),
        names.get("district", ""),
        names.get("tehsil", ""),
        names.get("location", ""),
        names.get("remarks", ""),
        "txtComplainantMobile",
        "txtMobileNo",
        "txtRemarks",
    }
    out = {}
    for k in keys:
        if k and k in payload:
            out[k] = clean_text(payload.get(k))
    return out


def main() -> None:
    tracking = app.get_full_tracking(TRACKING_ID) or {}
    preferred_delivery = clean_text(tracking.get("delivery_office")) or "Khushab"
    preferred_geo = app._match_delivery_office(preferred_delivery) or {}

    session = requests.Session()
    session.headers.update(app._complaint_headers())

    last_errors: list[str] = []
    last_snapshot: dict[str, str] = {}
    last_field_names: dict[str, str] = {}

    try:
        # Initial load
        form_url, html = app._resolve_complaint_form_page(session)
        soup = BeautifulSoup(html, "html.parser")
        form = soup.find("form")
        if form is None:
            print(json.dumps({"result": "FAILED", "errors": ["Complaint form not found"]}, indent=2))
            return

        # Mandatory article postback
        names = extract_live_field_names(form)
        article_name = names.get("article") or "txt_ArticleNo"
        payload = seed_payload(form)
        payload[article_name] = TRACKING_ID
        payload["__EVENTTARGET"] = article_name
        payload["__EVENTARGUMENT"] = ""
        _, form = post_form(session, form_url, form, payload)
        if form is None:
            print(json.dumps({"result": "FAILED", "errors": ["Form missing after article postback"]}, indent=2))
            return

        # Controlled one-cycle district sweep only
        names = extract_live_field_names(form)
        district_name = names.get("district")
        district_opts = [(v, t) for v, t in options(form, district_name) if v]

        def district_score(label: str) -> int:
            lbl = normalize(label)
            pref_d = normalize(clean_text(preferred_geo.get("district")))
            pref_l = normalize(preferred_delivery)
            if pref_d and lbl == pref_d:
                return 3
            if pref_d and (pref_d in lbl or lbl in pref_d):
                return 2
            if pref_l and len(pref_l) >= 3 and lbl.startswith(pref_l[:3]):
                return 1
            return 0

        district_opts.sort(key=lambda x: district_score(x[1]), reverse=True)

        for dval, dtext in district_opts:
            # Attempt 1 + one same-district rebind retry on binding failure
            for attempt in (1, 2):
                # Step 1: district postback
                names = extract_live_field_names(form)
                payload = seed_payload(form)
                payload = bind_required_fields(form, payload, names, tracking, district_value=dval)
                district_name = names.get("district")
                if district_name:
                    payload[district_name] = dval
                    payload["__EVENTTARGET"] = district_name
                    payload["__EVENTARGUMENT"] = ""
                    _, form_after_d = post_form(session, form_url, form, payload)
                else:
                    form_after_d = form

                if form_after_d is None:
                    last_errors = ["Form missing after district postback"]
                    continue

                # Step 2: re-parse
                names_d = extract_live_field_names(form_after_d)

                # Step 3: tehsil/location select first valid if exists
                payload_d = seed_payload(form_after_d)
                payload_d = bind_required_fields(form_after_d, payload_d, names_d, tracking, district_value=dval)

                tehsil_value = ""
                location_value = ""
                tehsil_name = names_d.get("tehsil")
                if tehsil_name:
                    tehsil_opts = [(v, t) for v, t in options(form_after_d, tehsil_name) if v]
                    if tehsil_opts:
                        tehsil_value = tehsil_opts[0][0]
                        payload_d[tehsil_name] = tehsil_value
                        payload_d["__EVENTTARGET"] = tehsil_name
                        payload_d["__EVENTARGUMENT"] = ""
                        _, form_after_t = post_form(session, form_url, form_after_d, payload_d)
                    else:
                        form_after_t = form_after_d
                else:
                    form_after_t = form_after_d

                if form_after_t is None:
                    last_errors = ["Form missing after tehsil postback"]
                    continue

                names_t = extract_live_field_names(form_after_t)
                payload_t = seed_payload(form_after_t)

                loc_name = names_t.get("location")
                if loc_name:
                    loc_opts = [(v, t) for v, t in options(form_after_t, loc_name) if v]
                    if loc_opts:
                        location_value = loc_opts[0][0]

                # Step 4: rebind all required fields again
                payload_t = bind_required_fields(
                    form_after_t,
                    payload_t,
                    names_t,
                    tracking,
                    district_value=dval,
                    tehsil_value=tehsil_value,
                    location_value=location_value,
                )

                # Step 5: submit
                payload_t["btnSubmit"] = "Submit"
                if "ImageButton1" in payload_t:
                    payload_t["ImageButton1"] = "Submit"
                submit_html, submit_form = post_form(session, form_url, form_after_t, payload_t)
                parsed = parse_message(submit_html)

                last_errors = parsed.get("binding_errors", []) or [parsed.get("message", "Submission rejected")]
                last_snapshot = sanitized_payload(payload_t, names_t)
                last_field_names = names_t

                if parsed.get("success") and parsed.get("complaint_id"):
                    print(json.dumps({
                        "result": "SUCCESS",
                        "complaint_id": parsed.get("complaint_id"),
                        "due_date": parsed.get("due_date", ""),
                        "payload_snapshot": last_snapshot,
                        "field_names": last_field_names,
                    }, indent=2))
                    return

                if parsed.get("duplicate"):
                    print(json.dumps({
                        "result": "DUPLICATE",
                        "message": parsed.get("message", "Already under process"),
                        "complaint_id": parsed.get("complaint_id", ""),
                        "due_date": parsed.get("due_date", ""),
                        "payload_snapshot": last_snapshot,
                        "field_names": last_field_names,
                    }, indent=2))
                    return

                # Same district retry only for binding failure conditions.
                if attempt == 1 and parsed.get("binding_errors"):
                    form = submit_form if submit_form is not None else form_after_t
                    continue

                form = submit_form if submit_form is not None else form_after_t
                break

        print(json.dumps({
            "result": "FAILED",
            "last_validation_errors": last_errors,
            "payload_snapshot": last_snapshot,
            "field_names": last_field_names,
        }, indent=2))

    except Exception as exc:
        print(json.dumps({
            "result": "FAILED",
            "last_validation_errors": [str(exc)],
            "payload_snapshot": last_snapshot,
            "field_names": last_field_names,
        }, indent=2))
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
