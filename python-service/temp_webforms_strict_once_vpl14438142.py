import json
import re
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

import app

TRACKING_ID = "VPL14438142"
MOBILE = "03331234567"


def clean(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def normalize(v: str) -> str:
    t = clean(v).upper()
    for token in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
        t = t.replace(token, "")
    return re.sub(r"\s+", " ", t).strip()


def parse_form(html: str):
    soup = BeautifulSoup(html or "", "html.parser")
    return soup.find("form")


def seed_payload(form) -> dict[str, str]:
    payload: dict[str, str] = {}
    for n in form.find_all(["input", "textarea"]):
        name = clean(n.get("name"))
        if not name:
            continue
        typ = clean(n.get("type")).lower()
        if typ in ("checkbox", "radio") and not n.has_attr("checked"):
            continue
        payload[name] = str(n.get("value") or "")
    return payload


def select_name(form, patterns: list[str]) -> str:
    nodes = form.find_all("select")
    for pat in patterns:
        rx = re.compile(pat, re.IGNORECASE)
        for n in nodes:
            name = clean(n.get("name"))
            nid = clean(n.get("id"))
            if rx.search(name) or rx.search(nid):
                return name
    return ""


def input_name(form, patterns: list[str], tag: str = "input") -> str:
    nodes = form.find_all(tag)
    for pat in patterns:
        rx = re.compile(pat, re.IGNORECASE)
        for n in nodes:
            name = clean(n.get("name"))
            nid = clean(n.get("id"))
            if rx.search(name) or rx.search(nid):
                return name
    return ""


def options(form, name: str) -> list[tuple[str, str]]:
    if not name:
        return []
    sel = form.find("select", attrs={"name": name})
    if sel is None:
        return []
    out = []
    for o in sel.find_all("option"):
        out.append((clean(o.get("value")), clean(o.get_text(" ", strip=True))))
    return out


def first_non_default(opts: list[tuple[str, str]]) -> tuple[str, str]:
    for v, t in opts:
        if not v:
            continue
        tl = t.lower()
        if "select" in tl or tl in ("-", "--"):
            continue
        return v, t
    return "", ""


def pick_option(opts: list[tuple[str, str]], preferred: str) -> tuple[str, str]:
    p = normalize(preferred)
    for v, t in opts:
        if v and p and normalize(t) == p:
            return v, t
    for v, t in opts:
        if not v or not p:
            continue
        nt = normalize(t)
        if p in nt or nt in p:
            return v, t
    if len(p) >= 3:
        key = p[:3]
        for v, t in opts:
            if v and normalize(t).startswith(key):
                return v, t
    return first_non_default(opts)


def extract_names(form) -> dict[str, str]:
    return {
        "article": input_name(form, [r"txt_?ArticleNo", r"\bArticleNo\b"]),
        "complainant": input_name(form, [r"Complainant.*Name"]),
        "mobile": input_name(form, [r"SenderMobile", r"Complainant.*Mobile", r"txtMobileNo", r"\bMobile\b"]),
        "booking_date": input_name(form, [r"BookingDate"]),
        "sender_name": input_name(form, [r"Sender.*Name"]),
        "addressee_name": input_name(form, [r"Addressee.*Name", r"Receiver.*Name", r"recipent.*name"]),
        "remarks": input_name(form, [r"_Remarks", r"\bRemarks\b"], tag="textarea") or input_name(form, [r"_Remarks", r"\bRemarks\b"], tag="input"),
        "service": select_name(form, [r"ServiceType"]),
        "reply": select_name(form, [r"PreferredModeOfReply", r"ReplyMode"]),
        "problem": select_name(form, [r"ProblemCategory", r"ddl_ProblemCategory"]),
        "sender_city": select_name(form, [r"SenderCity"]),
        "addressee_city": select_name(form, [r"AddresseeCity", r"ReceiverCity"]),
        "district": select_name(form, [r"DDDistrict", r"District"]),
        "tehsil": select_name(form, [r"DDTehsil", r"Tehsil"]),
        "location": select_name(form, [r"DDLocations", r"Location"]),
    }


def post(session: requests.Session, form_url: str, form, payload: dict[str, str]):
    action = clean(form.get("action"))
    post_url = urljoin(form_url, action) if action else form_url
    resp = session.post(post_url, data=payload, timeout=45, headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp.raise_for_status()
    return resp.text, parse_form(resp.text)


def set_core_fields(form, payload: dict[str, str], names: dict[str, str], td: dict[str, Any], district: str = "", tehsil: str = "", location: str = ""):
    sender_name = clean(td.get("sender_name")) or "Global Suppliers"
    addressee_name = clean(td.get("consignee_name")) or "Addressee"
    booking_city = clean(td.get("booking_office")) or "Sahiwal"
    receiver_city = clean(td.get("consignee_city")) or clean(td.get("delivery_office"))
    booking_date = clean(payload.get(names.get("booking_date", ""), "")) or "23/09/2024"
    remarks = f"Pending delivery complaint for article {TRACKING_ID}. Kindly process urgently."

    if names.get("article"):
        payload[names["article"]] = TRACKING_ID
    if names.get("complainant"):
        payload[names["complainant"]] = sender_name
    if names.get("mobile"):
        payload[names["mobile"]] = MOBILE
    payload["txtMobileNo"] = MOBILE
    payload["txtComplainantMobile"] = MOBILE

    if names.get("booking_date"):
        payload[names["booking_date"]] = booking_date
    if names.get("sender_name"):
        payload[names["sender_name"]] = sender_name
    if names.get("addressee_name"):
        payload[names["addressee_name"]] = addressee_name
    if names.get("remarks"):
        payload[names["remarks"]] = remarks
    payload["txtRemarks"] = remarks

    if names.get("service"):
        v, _ = pick_option(options(form, names["service"]), "VPL")
        if v:
            payload[names["service"]] = v

    if names.get("reply"):
        v, _ = pick_option(options(form, names["reply"]), "Post")
        if v:
            payload[names["reply"]] = v

    if names.get("problem"):
        prob_opts = options(form, names["problem"])
        v, _ = first_non_default(prob_opts)
        if v:
            payload[names["problem"]] = v

    if names.get("sender_city"):
        v, _ = pick_option(options(form, names["sender_city"]), booking_city)
        if v:
            payload[names["sender_city"]] = v

    if names.get("addressee_city"):
        v, _ = pick_option(options(form, names["addressee_city"]), receiver_city)
        if v:
            payload[names["addressee_city"]] = v

    if names.get("district") and district:
        payload[names["district"]] = district
    if names.get("tehsil") and tehsil:
        payload[names["tehsil"]] = tehsil
    if names.get("location") and location:
        payload[names["location"]] = location


def run_dropdown_postback(session: requests.Session, form_url: str, form, control_name: str, payload: dict[str, str]):
    if not control_name:
        return "", form
    payload["__EVENTTARGET"] = control_name
    payload["__EVENTARGUMENT"] = ""
    return post(session, form_url, form, payload)


def parse_result(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html or "", "html.parser")
    node = soup.find(id="lblErrorMessage")
    msg = clean(node.get_text(" ", strip=True) if node else soup.get_text(" ", strip=True))
    cid = ""
    due = ""
    m = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", msg, flags=re.IGNORECASE)
    if m:
        cid = m.group(1)
    if not cid:
        m2 = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", html or "", flags=re.IGNORECASE)
        if m2:
            cid = m2.group(1)
    d = re.search(r"Due\s*Date\s*(?:on)?\s*([0-3]?\d/[0-1]?\d/\d{4}|\d{4}-\d{1,2}-\d{1,2})", msg, flags=re.IGNORECASE)
    if d:
        due = d.group(1)
    return {
        "message": msg,
        "success": "submitted successfully" in msg.lower() and bool(cid),
        "duplicate": "already under process" in msg.lower(),
        "complaint_id": cid,
        "due_date": due,
        "required_failed": "required" in msg.lower() or "select" in msg.lower(),
    }


def compact(payload: dict[str, str], names: dict[str, str]) -> dict[str, str]:
    wanted = [
        names.get("article", ""), names.get("complainant", ""), names.get("mobile", ""), names.get("booking_date", ""),
        names.get("sender_name", ""), names.get("addressee_name", ""), names.get("remarks", ""),
        names.get("service", ""), names.get("reply", ""), names.get("problem", ""),
        names.get("sender_city", ""), names.get("addressee_city", ""), names.get("district", ""), names.get("tehsil", ""), names.get("location", ""),
        "txtMobileNo", "txtComplainantMobile", "txtRemarks",
    ]
    out = {}
    for k in wanted:
        if k and k in payload:
            out[k] = clean(payload.get(k))
    return out


def selenium_fallback() -> tuple[bool, str, str]:
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--disable-gpu")
        driver = webdriver.Chrome(options=opts)
        wait = WebDriverWait(driver, 30)
        try:
            driver.get(app.COMPLAINT_FORM_URL)
            article = wait.until(EC.presence_of_element_located((By.NAME, "txt_ArticleNo")))
            article.clear()
            article.send_keys(TRACKING_ID)
            article.submit()
            body = driver.page_source
            m = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", body, flags=re.IGNORECASE)
            if m:
                return True, m.group(1), "Selenium complaint ID found"
            if re.search(r"already\s+under\s+process", body, flags=re.IGNORECASE):
                return True, "", "Selenium duplicate detected"
            return False, "", "Selenium executed but no complaint ID/duplicate detected"
        finally:
            driver.quit()
    except Exception as exc:
        return False, "", f"Selenium unavailable or failed: {exc}"


def main():
    td = app.get_full_tracking(TRACKING_ID) or {}
    preferred_geo = app._match_delivery_office(clean(td.get("delivery_office")) or "Khushab") or {}
    pref_district = clean(preferred_geo.get("district")) or "Khushab"

    session = requests.Session()
    session.headers.update(app._complaint_headers())

    last_names = {}
    last_payload = {}
    last_msg = ""

    try:
        # Step 1 initial load
        form_url, html = app._resolve_complaint_form_page(session)
        form = parse_form(html)
        if form is None:
            print(json.dumps({"status": "FAILED", "message": "Form not found", "last_used_control_names": {}}, indent=2))
            return

        # Step 2 article postback mandatory
        names = extract_names(form)
        payload = seed_payload(form)
        article_name = names.get("article") or "txt_ArticleNo"
        payload[article_name] = TRACKING_ID
        payload["__EVENTTARGET"] = article_name
        payload["__EVENTARGUMENT"] = ""
        html, form = post(session, form_url, form, payload)
        if form is None:
            print(json.dumps({"status": "FAILED", "message": "Form missing after article postback", "last_used_control_names": names}, indent=2))
            return

        # one full district cycle only
        names = extract_names(form)
        dname = names.get("district")
        districts = [(v, t) for v, t in options(form, dname) if v]

        def dscore(label: str) -> int:
            n = normalize(label)
            p = normalize(pref_district)
            if p and n == p:
                return 3
            if p and (p in n or n in p):
                return 2
            if p and len(p) >= 3 and n.startswith(p[:3]):
                return 1
            return 0

        districts.sort(key=lambda x: dscore(x[1]), reverse=True)

        for dval, _ in districts:
            # perform full chain for this district
            form_cur = form
            names = extract_names(form_cur)
            payload = seed_payload(form_cur)
            set_core_fields(form_cur, payload, names, td, district=dval)

            # service -> postback
            if names.get("service") and names["service"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["service"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # problem category -> postback
            if names.get("problem") and names["problem"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["problem"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # reply mode -> postback
            if names.get("reply") and names["reply"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["reply"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # sender city -> postback
            if names.get("sender_city") and names["sender_city"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["sender_city"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # addressee city -> postback
            if names.get("addressee_city") and names["addressee_city"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["addressee_city"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # district -> postback
            if names.get("district") and names["district"] in payload:
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["district"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval)

            # tehsil must not be empty
            tehsil_val = ""
            if names.get("tehsil"):
                tv, _ = first_non_default(options(form_cur, names["tehsil"]))
                tehsil_val = tv
                if not tehsil_val:
                    continue
                payload[names["tehsil"]] = tehsil_val
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["tehsil"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval, tehsil=tehsil_val)

            # location must not be empty
            location_val = ""
            if names.get("location"):
                lv, _ = first_non_default(options(form_cur, names["location"]))
                location_val = lv
                if not location_val:
                    continue
                payload[names["location"]] = location_val
                html, form_cur = run_dropdown_postback(session, form_url, form_cur, names["location"], payload)
                if form_cur is None:
                    continue
                names = extract_names(form_cur)
                payload = seed_payload(form_cur)
                set_core_fields(form_cur, payload, names, td, district=dval, tehsil=tehsil_val, location=location_val)

            # final hard rebind
            set_core_fields(form_cur, payload, names, td, district=dval, tehsil=tehsil_val, location=location_val)
            payload["btnSubmit"] = "Submit"
            payload["__EVENTTARGET"] = ""
            payload["__EVENTARGUMENT"] = ""
            if "ImageButton1" in payload:
                payload["ImageButton1"] = "Submit"

            html_submit, form_after_submit = post(session, form_url, form_cur, payload)
            result = parse_result(html_submit)
            last_msg = result["message"]
            last_names = names
            last_payload = compact(payload, names)

            if result["success"]:
                print(json.dumps({"status": "SUCCESS", "complaint_id": result["complaint_id"], "message": result["message"], "last_used_control_names": last_names}, indent=2))
                return
            if result["duplicate"]:
                print(json.dumps({"status": "DUPLICATE", "complaint_id": result["complaint_id"], "due_date": result["due_date"], "message": result["message"], "last_used_control_names": last_names}, indent=2))
                return

            # Step 5 failure check: one retry max with Step 3 only
            if result["required_failed"]:
                form_retry = form_after_submit if form_after_submit is not None else form_cur
                names_retry = extract_names(form_retry)
                payload_retry = seed_payload(form_retry)
                set_core_fields(form_retry, payload_retry, names_retry, td, district=dval, tehsil=tehsil_val, location=location_val)
                payload_retry["btnSubmit"] = "Submit"
                payload_retry["__EVENTTARGET"] = ""
                payload_retry["__EVENTARGUMENT"] = ""
                if "ImageButton1" in payload_retry:
                    payload_retry["ImageButton1"] = "Submit"
                html_retry, _ = post(session, form_url, form_retry, payload_retry)
                result_retry = parse_result(html_retry)
                last_msg = result_retry["message"]
                last_names = names_retry
                last_payload = compact(payload_retry, names_retry)

                if result_retry["success"]:
                    print(json.dumps({"status": "SUCCESS", "complaint_id": result_retry["complaint_id"], "message": result_retry["message"], "last_used_control_names": last_names}, indent=2))
                    return
                if result_retry["duplicate"]:
                    print(json.dumps({"status": "DUPLICATE", "complaint_id": result_retry["complaint_id"], "due_date": result_retry["due_date"], "message": result_retry["message"], "last_used_control_names": last_names}, indent=2))
                    return

        # fallback mode mandatory
        ok, cid, msg = selenium_fallback()
        if ok and cid:
            print(json.dumps({"status": "SUCCESS", "complaint_id": cid, "message": msg, "last_used_control_names": last_names}, indent=2))
            return
        if ok and not cid:
            print(json.dumps({"status": "DUPLICATE", "message": msg, "last_used_control_names": last_names}, indent=2))
            return

        print(json.dumps({"status": "FAILED", "message": last_msg or msg, "last_used_control_names": last_names, "payload_snapshot": last_payload}, indent=2))

    except Exception as exc:
        print(json.dumps({"status": "FAILED", "message": str(exc), "last_used_control_names": last_names, "payload_snapshot": last_payload}, indent=2))
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
