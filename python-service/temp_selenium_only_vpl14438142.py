from __future__ import annotations

import json
import re
import time
from typing import Any
from datetime import date, datetime

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


TRACKING_ID = "VPL26030759"
MOBILE = "03331234567"
COMPLAINANT_NAME = "Global Suppliers"
SENDER_NAME = "Global Suppliers"
ADDRESSEE_NAME = "Addressee"
SENDER_ADDRESS = "Sahiwal"
ADDRESSEE_ADDRESS = "Bahawalpur"
REMARKS = "Pending delivery complaint for article VPL26030759. Kindly process urgently."
ENTRY_URL = "https://ep.gov.pk/complaints.asp"
PREFERRED_DISTRICT = "Bahawalpur"
PREFERRED_TEHSIL = "Bahawalpur"
PREFERRED_LOCATION = "Bahawalpur GPO"
PREFERRED_SENDER_CITY = "Sahiwal"
PREFERRED_RECEIVER_CITY = "Bahawalpur"


def clean(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value: str) -> str:
  text = clean(value).upper()
  for token in ("POST OFFICE", "DELIVERY OFFICE", "OFFICE"):
    text = text.replace(token, "")
  return re.sub(r"\s+", " ", text).strip()


def compact_message(value: str) -> str:
  msg = clean(value)
  checks = [
    (r"article\s*no\s*required", "Article no required"),
    (r"mobile\s*no\s*required", "Mobile no required"),
    (r"booking\s*date", "Booking date required"),
    (r"sender\s*city", "Sender city required"),
    (r"select\s*recipent\s*city|recipient\s*city", "Recipient city required"),
    (r"remarks\s*are\s*required", "Remarks required"),
    (r"select service|problem category", "Problem category remained default"),
  ]
  hits = [label for pattern, label in checks if re.search(pattern, msg, flags=re.IGNORECASE)]
  return "; ".join(hits) if hits else msg


def parse_booking_date(value: str) -> date | None:
  raw = clean(value)
  if not raw:
    return None
  for fmt in ("%d/%m/%Y", "%B %d, %Y", "%Y-%m-%d", "%d-%m-%Y"):
    try:
      return datetime.strptime(raw, fmt).date()
    except Exception:
      continue
  return None


def build_driver() -> webdriver.Chrome:
  options = Options()
  options.add_argument("--start-maximized")
  options.add_argument("--disable-blink-features=AutomationControlled")
  options.add_experimental_option("excludeSwitches", ["enable-automation"])
  options.add_experimental_option("useAutomationExtension", False)
  return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)


def wait_for_document_ready(driver: webdriver.Chrome, wait: WebDriverWait) -> None:
  wait.until(lambda d: d.execute_script("return document.readyState") == "complete")


def switch_to_form_iframe(driver: webdriver.Chrome, wait: WebDriverWait) -> None:
  driver.switch_to.default_content()
  wait.until(EC.frame_to_be_available_and_switch_to_it((By.TAG_NAME, "iframe")))
  wait_for_document_ready(driver, wait)


def all_inputs_and_selects(driver: webdriver.Chrome) -> dict[str, str]:
  script = """
    const data = {};
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const name = (el.getAttribute('name') || '').trim();
      const id = (el.getAttribute('id') || '').trim();
      if (name || id) {
        data[name || id] = el.tagName.toLowerCase();
      }
    }
    return data;
  """
  return driver.execute_script(script)


def discover_controls(driver: webdriver.Chrome) -> dict[str, str]:
  controls = all_inputs_and_selects(driver)
  names = list(controls.keys())

  def pick(patterns: list[str], tag: str | None = None) -> str:
    for pattern in patterns:
      rx = re.compile(pattern, re.IGNORECASE)
      for name in names:
        if tag is not None and controls.get(name) != tag:
          continue
        if rx.search(name):
          return name
    return ""

  return {
    "article": pick([r"txt_?ArticleNo", r"\bArticleNo\b"], "input"),
    "complainant_name": pick([r"Complainant.*Name"], "input"),
    "mobile": pick([r"ComplainantPhNo", r"Complainant.*Mobile", r"SenderMobile", r"txtMobileNo", r"\bMobile\b"], "input"),
    "booking_date": pick([r"BookingDate"], "input"),
    "booking_office": pick([r"BookingOffice", r"CustomBookingOffice"], "input"),
    "sender_name": pick([r"Sender.*Name"], "input"),
    "sender_address": pick([r"Sender.*Address"], "textarea") or pick([r"Sender.*Address"], "input"),
    "addressee_name": pick([r"Addressee.*Name", r"Receiver.*Name", r"recipent.*name"], "input"),
    "addressee_address": pick([r"Addressee.*Address", r"Receiver.*Address", r"recipent.*address"], "textarea") or pick([r"Addressee.*Address", r"Receiver.*Address", r"recipent.*address"], "input"),
    "remarks": pick([r"_Remarks", r"\bRemarks\b"], "textarea") or pick([r"_Remarks", r"\bRemarks\b"], "input"),
    "service": pick([r"ServiceType"], "select"),
    "reply": pick([r"PreferredModeOfReply", r"ReplyMode"], "select"),
    "problem": pick([r"ProblemCategory"], "select"),
    "sender_city": pick([r"SenderCity"], "select"),
    "addressee_city": pick([r"AddresseeCity", r"ReceiverCity"], "select"),
    "district": pick([r"DDDistrict", r"District"], "select"),
    "tehsil": pick([r"DDTehsil", r"Tehsil"], "select"),
    "location": pick([r"DDLocations", r"Location"], "select"),
    "submit": pick([r"btnSubmit", r"ImageButton", r"Submit"], "input"),
  }


def locate_by_name(driver: webdriver.Chrome, name: str):
  if not name:
    raise ValueError("Control name not provided")
  return driver.find_element(By.NAME, name)


def wait_for_element_refresh(driver: webdriver.Chrome, wait: WebDriverWait, old_element) -> None:
  try:
    wait.until(EC.staleness_of(old_element))
  except Exception:
    pass
  wait_for_document_ready(driver, wait)
  switch_to_form_iframe(driver, wait)


def with_stale_retry(action):
  last_error = None
  for _ in range(3):
    try:
      return action()
    except StaleElementReferenceException as exc:
      last_error = exc
      continue
  if last_error is not None:
    raise last_error


def set_text_value(driver: webdriver.Chrome, wait: WebDriverWait, name: str, value: str, trigger_blur: bool = False) -> None:
  def _write() -> None:
    element = locate_by_name(driver, name)
    old = element
    element.clear()
    element.send_keys(value)
    if trigger_blur:
      element.send_keys(Keys.TAB)
      wait_for_element_refresh(driver, wait, old)
  with_stale_retry(_write)


def select_option_with_postback(driver: webdriver.Chrome, wait: WebDriverWait, name: str, preferred: str, require_non_empty: bool = True) -> tuple[str, str]:
  def _select() -> tuple[str, str]:
    select_el = locate_by_name(driver, name)
    old = select_el
    select = Select(select_el)
    chosen_value = ""
    chosen_text = ""

    select_options = [(clean(o.get_attribute("value")), clean(o.text)) for o in select.options]
    pref = normalize(preferred)

    for value, text in select_options:
      if value and pref and normalize(text) == pref:
        chosen_value, chosen_text = value, text
        break
    if not chosen_value:
      for value, text in select_options:
        if value and pref:
          nt = normalize(text)
          if pref in nt or nt in pref:
            chosen_value, chosen_text = value, text
            break
    if not chosen_value and len(pref) >= 3:
      prefix = pref[:3]
      for value, text in select_options:
        if value and normalize(text).startswith(prefix):
          chosen_value, chosen_text = value, text
          break
    if not chosen_value:
      for value, text in select_options:
        if not value:
          continue
        tl = text.lower()
        if "select" in tl or tl in ("-", "--"):
          continue
        chosen_value, chosen_text = value, text
        break

    if require_non_empty and not chosen_value:
      raise RuntimeError(f"No valid option available for {name}")

    if chosen_value:
      select.select_by_value(chosen_value)
      wait_for_element_refresh(driver, wait, old)
    return chosen_value, chosen_text

  return with_stale_retry(_select)


def safe_select_value(driver: webdriver.Chrome, name: str, value: str) -> None:
  if not name or not value:
    return
  def _set() -> None:
    Select(locate_by_name(driver, name)).select_by_value(value)
  with_stale_retry(_set)


def safe_read_value(driver: webdriver.Chrome, name: str) -> str:
  if not name:
    return ""
  def _read() -> str:
    return clean(locate_by_name(driver, name).get_attribute("value"))
  return with_stale_retry(_read)


def select_value_with_postback(driver: webdriver.Chrome, wait: WebDriverWait, name: str, value: str) -> None:
  if not name or not value:
    return
  def _select() -> None:
    select_el = locate_by_name(driver, name)
    old = select_el
    Select(select_el).select_by_value(value)
    wait_for_element_refresh(driver, wait, old)
  with_stale_retry(_select)


def read_message(driver: webdriver.Chrome) -> str:
  for selector in [
    (By.ID, "lblErrorMessage"),
    (By.CSS_SELECTOR, "body"),
  ]:
    try:
      text = clean(driver.find_element(*selector).text)
      if text:
        return text
    except Exception:
      continue
  return ""


def extract_complaint_id(message: str) -> str:
  hit = re.search(r"Complaint\s*(?:No|ID)\s*[:\-]?\s*([A-Z0-9\-]+)", message, flags=re.IGNORECASE)
  return hit.group(1) if hit else ""


def find_submit_button(driver: webdriver.Chrome, controls: dict[str, str]):
  if controls.get("submit"):
    try:
      return locate_by_name(driver, controls["submit"])
    except Exception:
      pass
  candidates = driver.find_elements(By.CSS_SELECTOR, "input[type='submit'], input[type='image'], button")
  for btn in candidates:
    text = clean(btn.get_attribute("value") or btn.text)
    if "submit" in text.lower() or "complaint" in text.lower():
      return btn
  raise RuntimeError("Submit button not found")


def current_select_value(driver: webdriver.Chrome, name: str) -> str:
  if not name:
    return ""
  return with_stale_retry(lambda: clean(Select(locate_by_name(driver, name)).first_selected_option.get_attribute("value")))


def current_select_text(driver: webdriver.Chrome, name: str) -> str:
  if not name:
    return ""
  return with_stale_retry(lambda: clean(Select(locate_by_name(driver, name)).first_selected_option.text))


def is_valid_selected(driver: webdriver.Chrome, name: str) -> bool:
  value = current_select_value(driver, name)
  text = current_select_text(driver, name).lower()
  return bool(value) and "select" not in text and text not in ("-", "--")


def wait_for_article_autopopulation(driver: webdriver.Chrome, wait: WebDriverWait) -> dict[str, str]:
  last_state = {"booking_date": "", "sender_city": "", "addressee_city": ""}
  ready_since = None
  for _ in range(2):
    switch_to_form_iframe(driver, wait)

    def _condition(_driver):
      nonlocal ready_since
      controls = discover_controls(driver)
      booking_name = controls.get("booking_date", "")
      sender_city_name = controls.get("sender_city", "")
      addressee_city_name = controls.get("addressee_city", "")
      booking_value = safe_read_value(driver, booking_name) if booking_name else ""
      sender_ok = is_valid_selected(driver, sender_city_name) if sender_city_name else False
      addressee_ok = is_valid_selected(driver, addressee_city_name) if addressee_city_name else False
      last_state["booking_date"] = booking_value
      last_state["sender_city"] = current_select_value(driver, sender_city_name) if sender_city_name else ""
      last_state["addressee_city"] = current_select_value(driver, addressee_city_name) if addressee_city_name else ""
      is_ready = bool(booking_value) and sender_ok and addressee_ok
      if not is_ready:
        ready_since = None
        return False
      now = time.monotonic()
      if ready_since is None:
        ready_since = now
        return False
      return (now - ready_since) >= 1.2

    try:
      wait.until(_condition)
      break
    except TimeoutException:
      continue
  return last_state


def trigger_safe_registration_postback(driver: webdriver.Chrome, wait: WebDriverWait, controls: dict[str, str]) -> dict[str, str]:
  sender_city_name = controls.get("sender_city")
  if sender_city_name and is_valid_selected(driver, sender_city_name):
    sender_select = Select(locate_by_name(driver, sender_city_name))
    current_value = current_select_value(driver, sender_city_name)
    valid_values = [clean(opt.get_attribute("value")) for opt in sender_select.options if clean(opt.get_attribute("value"))]
    alternate_value = next((value for value in valid_values if value != current_value), "")
    if alternate_value:
      select_value_with_postback(driver, wait, sender_city_name, alternate_value)
      controls = discover_controls(driver)
      if sender_city_name in controls.values() or controls.get("sender_city"):
        select_value_with_postback(driver, wait, controls.get("sender_city", sender_city_name), current_value)
        return discover_controls(driver)
    return discover_controls(driver)

  service_name = controls.get("service")
  if service_name and is_valid_selected(driver, service_name):
    service_select = Select(locate_by_name(driver, service_name))
    current_value = current_select_value(driver, service_name)
    valid_values = [clean(opt.get_attribute("value")) for opt in service_select.options if clean(opt.get_attribute("value"))]
    alternate_value = next((value for value in valid_values if value != current_value), "")
    if alternate_value:
      select_value_with_postback(driver, wait, service_name, alternate_value)
      controls = discover_controls(driver)
      if service_name in controls.values() or controls.get("service"):
        select_value_with_postback(driver, wait, controls.get("service", service_name), current_value)
        return discover_controls(driver)
    return discover_controls(driver)

  booking_name = controls.get("booking_date")
  if booking_name:
    booking_el = locate_by_name(driver, booking_name)
    driver.execute_script(
      """
        const el = arguments[0];
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      """,
      booking_el,
    )
    wait_for_document_ready(driver, wait)
    switch_to_form_iframe(driver, wait)
  return discover_controls(driver)


def run() -> dict[str, Any]:
  driver = build_driver()
  wait = WebDriverWait(driver, 30)
  last_controls: dict[str, str] = {}

  try:
    driver.get(ENTRY_URL)
    wait_for_document_ready(driver, wait)
    switch_to_form_iframe(driver, wait)

    # Article number with real user interaction
    controls = discover_controls(driver)
    article_name = controls.get("article")
    if not article_name:
      raise RuntimeError("Article field not found")
    set_text_value(driver, wait, article_name, TRACKING_ID, trigger_blur=True)

    # Mandatory wait for ASP.NET auto-population before any further interaction.
    auto_state = wait_for_article_autopopulation(driver, wait)
    if not (auto_state.get("booking_date") and auto_state.get("sender_city") and auto_state.get("addressee_city")):
      return {
        "status": "FAILED",
        "message": "Auto-population did not complete after tracking number input",
        "last_used_control_names": discover_controls(driver),
      }

    booking_date_value = auto_state.get("booking_date", "")
    booking_date = parse_booking_date(booking_date_value)
    if booking_date is None:
      return {
        "status": "FAILED",
        "message": f"Unable to parse booking date: {booking_date_value}",
        "last_used_control_names": discover_controls(driver),
      }

    days_elapsed = (date.today() - booking_date).days
    if days_elapsed < 7:
      return {
        "status": "BLOCKED",
        "reason": "Complaint cannot be registered yet (due delivery time not reached)",
        "booking_date": booking_date.strftime("%d/%m/%Y"),
        "days_elapsed": days_elapsed,
        "last_used_control_names": discover_controls(driver),
      }

    controls = discover_controls(driver)
    controls = trigger_safe_registration_postback(driver, wait, controls)

    # Verify booking date survived registration trigger.
    booking_name = controls.get("booking_date")
    if not booking_name or not safe_read_value(driver, booking_name):
      return {
        "status": "FAILED",
        "message": "Booking date lost after registration trigger",
        "last_used_control_names": controls,
      }

    # Field-by-field postback chain
    last_controls = controls

    if controls.get("service"):
      select_option_with_postback(driver, wait, controls["service"], "VPL")
      controls = discover_controls(driver)

    if controls.get("problem"):
      select_option_with_postback(driver, wait, controls["problem"], "Pending Delivery")
      controls = discover_controls(driver)

    if controls.get("reply"):
      select_option_with_postback(driver, wait, controls["reply"], "Post")
      controls = discover_controls(driver)

    if controls.get("sender_city") and not is_valid_selected(driver, controls["sender_city"]):
      select_option_with_postback(driver, wait, controls["sender_city"], PREFERRED_SENDER_CITY)
      controls = discover_controls(driver)

    if controls.get("addressee_city") and not is_valid_selected(driver, controls["addressee_city"]):
      select_option_with_postback(driver, wait, controls["addressee_city"], PREFERRED_RECEIVER_CITY)
      controls = discover_controls(driver)

    # One full district cycle only; district -> tehsil -> location all non-empty
    district_value, _ = select_option_with_postback(driver, wait, controls["district"], PREFERRED_DISTRICT, require_non_empty=True)
    controls = discover_controls(driver)
    tehsil_value, _ = select_option_with_postback(driver, wait, controls["tehsil"], PREFERRED_TEHSIL, require_non_empty=True)
    controls = discover_controls(driver)
    location_value, _ = select_option_with_postback(driver, wait, controls["location"], PREFERRED_LOCATION, require_non_empty=True)
    controls = discover_controls(driver)
    last_controls = controls

    # Final field fill. Do not touch the article field again here; changing it after
    # the auto-population/postback chain can break the server-side booking-date state.
    if controls.get("complainant_name"):
      set_text_value(driver, wait, controls["complainant_name"], COMPLAINANT_NAME)
    if controls.get("mobile"):
      set_text_value(driver, wait, controls["mobile"], MOBILE)
    if controls.get("booking_office"):
      set_text_value(driver, wait, controls["booking_office"], PREFERRED_SENDER_CITY)
    if controls.get("sender_name"):
      set_text_value(driver, wait, controls["sender_name"], SENDER_NAME)
    if controls.get("sender_address"):
      set_text_value(driver, wait, controls["sender_address"], SENDER_ADDRESS)
    if controls.get("addressee_name"):
      set_text_value(driver, wait, controls["addressee_name"], ADDRESSEE_NAME)
    if controls.get("addressee_address"):
      set_text_value(driver, wait, controls["addressee_address"], ADDRESSEE_ADDRESS)
    if controls.get("remarks"):
      set_text_value(driver, wait, controls["remarks"], REMARKS)

    # Re-assert selected dropdowns without postback before submit
    if controls.get("service"):
      current_service = with_stale_retry(lambda: clean(Select(locate_by_name(driver, controls["service"])).first_selected_option.get_attribute("value")))
      safe_select_value(driver, controls["service"], current_service)
    if controls.get("reply"):
      # Keep currently selected valid option after chain.
      pass
    if controls.get("problem"):
      current_problem_value = with_stale_retry(lambda: clean(Select(locate_by_name(driver, controls["problem"])).first_selected_option.get_attribute("value")))
      current_problem_text = with_stale_retry(lambda: clean(Select(locate_by_name(driver, controls["problem"])).first_selected_option.text))
      if not current_problem_value or "select" in current_problem_text.lower():
        problem_options = with_stale_retry(lambda: [(clean(o.get_attribute("value")), clean(o.text)) for o in Select(locate_by_name(driver, controls["problem"])).options])
        for value, text in problem_options:
          if value and "select" not in text.lower():
            safe_select_value(driver, controls["problem"], value)
            break
    if controls.get("district"):
      safe_select_value(driver, controls["district"], district_value)
    if controls.get("tehsil"):
      safe_select_value(driver, controls["tehsil"], tehsil_value)
    if controls.get("location"):
      safe_select_value(driver, controls["location"], location_value)

    # Final submit, then one hard-rebind retry max on required failure
    for attempt in range(2):
      submit_btn = find_submit_button(driver, controls)
      submit_btn.click()
      wait_for_document_ready(driver, wait)
      switch_to_form_iframe(driver, wait)
      message = read_message(driver)
      complaint_id = extract_complaint_id(message)

      if complaint_id and "submitted successfully" in message.lower():
        return {"status": "SUCCESS", "complaint_id": complaint_id, "message": clean(message), "last_used_control_names": controls}
      if "already under process" in message.lower():
        return {"status": "DUPLICATE", "complaint_id": complaint_id, "message": clean(message), "last_used_control_names": controls}

      if attempt == 0 and "required" in message.lower():
        controls = discover_controls(driver)
        last_controls = controls
        if controls.get("complainant_name"):
          set_text_value(driver, wait, controls["complainant_name"], COMPLAINANT_NAME)
        if controls.get("mobile"):
          set_text_value(driver, wait, controls["mobile"], MOBILE)
        if controls.get("booking_office"):
          set_text_value(driver, wait, controls["booking_office"], PREFERRED_SENDER_CITY)
        if controls.get("sender_name"):
          set_text_value(driver, wait, controls["sender_name"], SENDER_NAME)
        if controls.get("sender_address"):
          set_text_value(driver, wait, controls["sender_address"], SENDER_ADDRESS)
        if controls.get("addressee_name"):
          set_text_value(driver, wait, controls["addressee_name"], ADDRESSEE_NAME)
        if controls.get("addressee_address"):
          set_text_value(driver, wait, controls["addressee_address"], ADDRESSEE_ADDRESS)
        if controls.get("remarks"):
          set_text_value(driver, wait, controls["remarks"], REMARKS)
        if controls.get("district"):
          safe_select_value(driver, controls["district"], district_value)
        if controls.get("tehsil"):
          safe_select_value(driver, controls["tehsil"], tehsil_value)
        if controls.get("location"):
          safe_select_value(driver, controls["location"], location_value)
        continue

      return {"status": "FAILED", "message": compact_message(message), "last_used_control_names": controls}

    return {"status": "FAILED", "message": "Binding retry exhausted", "last_used_control_names": last_controls}

  finally:
    try:
      driver.quit()
    except Exception:
      pass


if __name__ == "__main__":
  try:
    print(json.dumps(run(), indent=2))
  except WebDriverException as exc:
    print(json.dumps({"status": "FAILED", "message": f"ChromeDriver runtime failure: {exc}"}, indent=2))
  except Exception as exc:
    print(json.dumps({"status": "FAILED", "message": str(exc)}, indent=2))