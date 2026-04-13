import re
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

import app

TRACKING_ID = "VPL14438142"
MOBILE = "03331234567"
MAX_CYCLES = 5


def normalize(text: str) -> str:
    t = str(text or "").upper()
    for token in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
        t = t.replace(token, "")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def extract_hidden(form):
    hidden = {}
    for n in form.find_all("input"):
        name = str(n.get("name") or "").strip()
        if not name:
            continue
        if str(n.get("type") or "").lower() == "hidden":
            hidden[name] = str(n.get("value") or "")
    return hidden


def seed_payload(form):
    payload = {}
    for n in form.find_all(["input", "textarea"]):
        name = str(n.get("name") or "").strip()
        if not name:
            continue
        typ = str(n.get("type") or "").lower().strip()
        if typ in ("checkbox", "radio") and not n.has_attr("checked"):
            continue
        payload[name] = str(n.get("value") or "")
    return payload


def get_select(form, name):
    return form.find("select", attrs={"name": name})


def option_list(select):
    if select is None:
        return []
    out = []
    for o in select.find_all("option"):
        val = str(o.get("value") or "").strip()
        txt = str(o.get_text(" ", strip=True) or "").strip()
        out.append((val, txt))
    return out


def first_valid_option(select):
    for val, txt in option_list(select):
        if val:
            return val, txt
    return "", ""


def match_option_by_text(select, preferred_text: str):
    opts = option_list(select)
    wanted = normalize(preferred_text)
    if not opts:
        return "", "", "none"
    for val, txt in opts:
        if not val:
            continue
        if normalize(txt) == wanted and wanted:
            return val, txt, "exact"
    for val, txt in opts:
        if not val:
            continue
        nt = normalize(txt)
        if wanted and (wanted in nt or nt in wanted):
            return val, txt, "contains"
    if len(wanted) >= 3:
        key = wanted[:3]
        for val, txt in opts:
            if not val:
                continue
            if normalize(txt).startswith(key):
                return val, txt, "prefix3"
    fv, ft = first_valid_option(select)
    if fv:
        return fv, ft, "first"
    return "", "", "none"


def parse_message(html: str):
    soup = BeautifulSoup(html or "", "html.parser")
    node = soup.find(id="lblErrorMessage")
    message = node.get_text(" ", strip=True) if node else ""
    if not message:
        message = " ".join(soup.get_text(" ", strip=True).split())
    msg_lower = message.lower()
    complaint_id = ""
    due_date = ""
    m = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", message, flags=re.IGNORECASE)
    if m:
        complaint_id = m.group(1)
    if not complaint_id:
        m2 = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", html or "", flags=re.IGNORECASE)
        if m2:
            complaint_id = m2.group(1)
    d = re.search(r"Due\s*Date\s*(?:on)?\s*([0-3]?\d/[0-1]?\d/\d{4}|\d{4}-\d{1,2}-\d{1,2})", message, flags=re.IGNORECASE)
    if d:
        due_date = d.group(1)
    success = "submitted successfully" in msg_lower
    duplicate = "already under process" in msg_lower
    return {
        "message": message,
        "success": success,
        "duplicate": duplicate,
        "complaint_id": complaint_id,
        "due_date": due_date,
    }


def post_form(session, form_url, form, payload):
    action = str(form.get("action") or "").strip()
    post_url = urljoin(form_url, action) if action else form_url
    resp = session.post(
        post_url,
        data=payload,
        timeout=40,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")
    next_form = soup.find("form")
    return html, next_form


def apply_core_fields(form, payload, tracking_data, city_strategy="preferred"):
    article_field = "txt_ArticleNo" if form.find("input", attrs={"name": "txt_ArticleNo"}) else "ArticleNo"
    payload[article_field] = TRACKING_ID

    sender_name = (str(tracking_data.get("sender_name") or "").strip() or "Global Suppliers")
    sender_addr = str(tracking_data.get("sender_address") or "").strip() or "-"
    consignee_name = str(tracking_data.get("consignee_name") or "").strip() or "Addressee"
    consignee_addr = str(tracking_data.get("consignee_address") or "").strip() or "-"
    booking_office = str(tracking_data.get("booking_office") or "").strip()
    delivery_office = str(tracking_data.get("delivery_office") or "").strip()

    payload["txtComplainantName"] = sender_name
    payload["txtComplainantMobile"] = MOBILE
    payload["txtMobileNo"] = MOBILE

    if "txtBookingDate" in payload:
        booking_date = str(payload.get("txtBookingDate") or "").strip()
        payload["txtBookingDate"] = booking_date
    if "txtBookingOffice" in payload:
        payload["txtBookingOffice"] = booking_office or payload.get("txtBookingOffice", "")

    payload["txtSenderName"] = sender_name
    payload["txtSenderAddress"] = sender_addr
    payload["txtAddresseeName"] = consignee_name
    payload["txtReceiverName"] = consignee_name
    payload["txtAddresseeAddress"] = consignee_addr
    payload["txtReceiverAddress"] = consignee_addr

    payload["txtRemarks"] = (
        f"Pending delivery complaint for article {TRACKING_ID}. Kindly update delivery status and process urgently."
    )

    svc = get_select(form, "ddlServiceType") or get_select(form, "ServiceType")
    if svc is not None:
        v, _, _ = match_option_by_text(svc, "VPL")
        if v:
            payload[svc.get("name")] = v

    reply = get_select(form, "ddlReplyMode") or get_select(form, "ddlPreferredModeOfReply")
    if reply is not None:
        v, _, _ = match_option_by_text(reply, "Post")
        if v:
            payload[reply.get("name")] = v

    prob = get_select(form, "ddl_ProblemCategory")
    if prob is not None:
        v, _, _ = match_option_by_text(prob, "Pending Delivery")
        if v:
            payload["ddl_ProblemCategory"] = v

    sender_sel = get_select(form, "ddlSenderCity")
    if sender_sel is not None:
        preferred = booking_office or "Sahiwal"
        v, _, mode = match_option_by_text(sender_sel, preferred)
        if city_strategy == "first" and mode == "none":
            v, _, _ = first_valid_option(sender_sel)
        if v:
            payload["ddlSenderCity"] = v

    recv_sel = get_select(form, "ddlAddresseeCity")
    if recv_sel is not None:
        preferred = str(tracking_data.get("consignee_city") or "").strip() or delivery_office
        v, _, mode = match_option_by_text(recv_sel, preferred)
        if city_strategy == "first" and mode == "none":
            v, _, _ = first_valid_option(recv_sel)
        if v:
            payload["ddlAddresseeCity"] = v

    payload["__EVENTTARGET"] = ""
    payload["__EVENTARGUMENT"] = ""


def log_pre_submit(payload):
    print("[DEBUG_PRE_SUBMIT]", json.dumps({
        "senderCity": payload.get("ddlSenderCity", ""),
        "addresseeCity": payload.get("ddlAddresseeCity", ""),
        "district": payload.get("DDDistrict", ""),
        "tehsil": payload.get("DDTehsil", ""),
        "location": payload.get("DDLocations", ""),
        "remarks": payload.get("txtRemarks", ""),
        "mobile": payload.get("txtComplainantMobile") or payload.get("txtMobileNo", ""),
    }, ensure_ascii=False))


def choose_district_order(form, preferred):
    dsel = get_select(form, "DDDistrict")
    opts = [(v, t) for v, t in option_list(dsel) if v]
    if not opts:
        return []
    pref = normalize(preferred)
    ranked = []
    for v, t in opts:
        nt = normalize(t)
        score = 0
        if pref and nt == pref:
            score = 3
        elif pref and (pref in nt or nt in pref):
            score = 2
        elif pref and len(pref) >= 3 and nt.startswith(pref[:3]):
            score = 1
        ranked.append((score, v, t))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [(v, t) for _, v, t in ranked]


def run():
    tracking_data = app.get_full_tracking(TRACKING_ID) or {}
    if not tracking_data:
        print(json.dumps({"success": False, "error": "Tracking data unavailable"}, indent=2))
        return

    preferred_delivery = str(tracking_data.get("delivery_office") or "").strip() or "Khushab"
    matched = app._match_delivery_office(preferred_delivery)

    final_result = None

    for cycle in range(1, MAX_CYCLES + 1):
        city_strategy = "preferred" if cycle <= 3 else "first"
        print(f"\\n=== CYCLE {cycle}/{MAX_CYCLES} city_strategy={city_strategy} ===")

        session = requests.Session()
        session.headers.update(app._complaint_headers())
        try:
            # STEP 1: initial load
            form_url, html = app._resolve_complaint_form_page(session)
            soup = BeautifulSoup(html, "html.parser")
            form = soup.find("form")
            if form is None:
                print("[ERROR] form not found on initial page")
                continue

            hidden = extract_hidden(form)
            print("[STEP1] hidden keys:", sorted(hidden.keys()))
            print("[STEP1] __VIEWSTATE present:", bool(hidden.get("__VIEWSTATE")))
            print("[STEP1] __EVENTVALIDATION present:", bool(hidden.get("__EVENTVALIDATION")))
            for sname in ["ddlSenderCity", "ddlAddresseeCity", "DDDistrict", "DDTehsil", "DDLocations", "ddl_ProblemCategory"]:
                sel = get_select(form, sname)
                print(f"[STEP1] {sname} options:", len(option_list(sel)))

            # STEP 2: article postback mandatory
            payload = seed_payload(form)
            article_field = "txt_ArticleNo" if form.find("input", attrs={"name": "txt_ArticleNo"}) else "ArticleNo"
            payload[article_field] = TRACKING_ID
            payload["__EVENTTARGET"] = article_field
            payload["__EVENTARGUMENT"] = ""
            html2, form2 = post_form(session, form_url, form, payload)
            if form2 is None:
                print("[ERROR] form missing after article postback")
                continue

            payload2 = seed_payload(form2)
            booking_date = str(payload2.get("txtBookingDate") or "").strip()
            auto_sender = str(payload2.get("txtSenderName") or "").strip()
            auto_addressee = str(payload2.get("txtAddresseeName") or payload2.get("txtReceiverName") or "").strip()
            hidden2 = extract_hidden(form2)
            print("[STEP2] postback __VIEWSTATE present:", bool(hidden2.get("__VIEWSTATE")))
            print("[STEP2] postback __EVENTVALIDATION present:", bool(hidden2.get("__EVENTVALIDATION")))
            print("[STEP2] booking_date:", booking_date)
            print("[STEP2] auto sender/addressee:", auto_sender, "/", auto_addressee)

            # STEP 3/4 core + cities
            apply_core_fields(form2, payload2, tracking_data, city_strategy=city_strategy)

            # STEP 5/6 delivery cascade with district retries
            preferred_district = (matched or {}).get("district") or "Khushab"
            preferred_tehsil = (matched or {}).get("tehsil") or "Khushab"
            preferred_location = (matched or {}).get("location") or preferred_delivery

            districts = choose_district_order(form2, preferred_district)
            if not districts:
                print("[WARN] No district options available after article postback")

            for idx, (dval, dtext) in enumerate(districts, start=1):
                form_cur = form2
                payload_cur = dict(payload2)
                apply_core_fields(form_cur, payload_cur, tracking_data, city_strategy=city_strategy)
                payload_cur["DDDistrict"] = dval
                payload_cur["__EVENTTARGET"] = "DDDistrict"
                payload_cur["__EVENTARGUMENT"] = ""
                h_d, form_d = post_form(session, form_url, form_cur, payload_cur)
                if form_d is None:
                    continue
                payload_d = seed_payload(form_d)
                apply_core_fields(form_d, payload_d, tracking_data, city_strategy=city_strategy)
                payload_d["DDDistrict"] = dval

                tehsil_sel = get_select(form_d, "DDTehsil")
                tehsil_opts = [(v, t) for v, t in option_list(tehsil_sel) if v]
                location_opts = []
                chosen_tehsil = ""
                chosen_location = ""

                if tehsil_opts:
                    tv, tt, _ = match_option_by_text(tehsil_sel, preferred_tehsil)
                    if not tv:
                        tv, tt = tehsil_opts[0]
                    chosen_tehsil = tv
                    payload_d["DDTehsil"] = tv
                    payload_d["__EVENTTARGET"] = "DDTehsil"
                    payload_d["__EVENTARGUMENT"] = ""
                    h_t, form_t = post_form(session, form_url, form_d, payload_d)
                    if form_t is not None:
                        payload_t = seed_payload(form_t)
                        apply_core_fields(form_t, payload_t, tracking_data, city_strategy=city_strategy)
                        payload_t["DDDistrict"] = dval
                        payload_t["DDTehsil"] = tv
                        loc_sel = get_select(form_t, "DDLocations")
                        location_opts = [(v, t) for v, t in option_list(loc_sel) if v]
                        if location_opts:
                            lv, lt, _ = match_option_by_text(loc_sel, preferred_location)
                            if not lv:
                                lv, lt = location_opts[0]
                            chosen_location = lv
                            payload_t["DDLocations"] = lv
                        payload_submit = payload_t
                        form_submit = form_t
                    else:
                        payload_submit = payload_d
                        form_submit = form_d
                else:
                    payload_submit = payload_d
                    form_submit = form_d

                print(f"[STEP5] district_try={idx}/{len(districts)} district={dtext}({dval}) tehsil_opts={len(tehsil_opts)} loc_opts={len(location_opts)}")

                # STEP 7/8 final submit attempt
                payload_submit["__EVENTTARGET"] = ""
                payload_submit["__EVENTARGUMENT"] = ""
                payload_submit["btnSubmit"] = "Submit"
                if "ImageButton1" in payload_submit:
                    payload_submit["ImageButton1"] = "Submit"

                log_pre_submit(payload_submit)

                h_final, _ = post_form(session, form_url, form_submit, payload_submit)
                parsed = parse_message(h_final)
                print("[SUBMIT_RESULT]", json.dumps(parsed, ensure_ascii=False))

                if parsed["success"] or parsed["duplicate"]:
                    final_result = {
                        "success": True,
                        "status": "duplicate" if parsed["duplicate"] else "submitted",
                        "tracking_id": TRACKING_ID,
                        "complaint_id": parsed["complaint_id"],
                        "due_date": parsed["due_date"],
                        "message": parsed["message"],
                        "cycle": cycle,
                        "district_value": payload_submit.get("DDDistrict", ""),
                        "tehsil_value": payload_submit.get("DDTehsil", ""),
                        "location_value": payload_submit.get("DDLocations", ""),
                    }
                    print("\\n=== SUCCESS ===")
                    print(json.dumps(final_result, indent=2, ensure_ascii=False))
                    return

            print(f"[CYCLE_END] cycle={cycle} exhausted all district options")

        except Exception as exc:
            print(f"[CYCLE_ERROR] cycle={cycle} error={exc}")
        finally:
            try:
                session.close()
            except Exception:
                pass

    if final_result is None:
        fail = {
            "success": False,
            "tracking_id": TRACKING_ID,
            "message": "All district options exhausted across retry cycles. No complaint ID returned.",
        }
        print("\\n=== FINAL FAIL ===")
        print(json.dumps(fail, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    run()
