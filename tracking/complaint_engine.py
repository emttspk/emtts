import re
import time
import datetime
import gspread

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from oauth2client.service_account import ServiceAccountCredentials


# ---------------- GOOGLE SHEETS SETUP ----------------

scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

creds = ServiceAccountCredentials.from_json_keyfile_name(
    "credentials.json", scope
)

client = gspread.authorize(creds)
spreadsheet = client.open("PakistanPost Tracking System")

tracking_sheet = spreadsheet.worksheet("Tracking_data")
district_sheet = spreadsheet.worksheet("District_Data")
complaint_sheet = spreadsheet.worksheet("Complaint_File")
shipper_sheet = spreadsheet.worksheet("Shipper_Master")


# ---------------- LOAD DISTRICT DATA ----------------

district_records = district_sheet.get_all_records()

district_data = []

for row in district_records:
    district_data.append({
    "district": str(row.get("District", "")).strip().upper(),
    "tehsil": str(row.get("Tehsil", "")).strip().upper(),
    "location": str(row.get("Location", "")).strip().upper()
})


# ---------------- LOAD SHIPPER MASTER ----------------

shipper = shipper_sheet.get_all_records()[0]

SHIPPER_NAME = shipper["Name"]
SHIPPER_ADDRESS = shipper["Address"]
SHIPPER_PHONE = shipper["Contact No"]
SHIPPER_EMAIL = shipper["Email"]
SHIPPER_BOOKING_OFFICE = shipper["Booking Office"]


# ---------------- HELPER FUNCTIONS ----------------

def normalize(text):
    text = text.upper()
    text = text.replace("POST OFFICE", "")
    text = text.replace("DELIVERY OFFICE", "")
    text = text.replace("OFFICE", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def match_delivery_office(delivery_office):
    delivery_norm = normalize(delivery_office)

    matches = []

    for row in district_data:
        location_norm = normalize(row["location"])

        if delivery_norm == location_norm:
            matches.append((3, row))

        elif delivery_norm in location_norm:
            matches.append((2, row))

        elif location_norm in delivery_norm:
            matches.append((1, row))

    if not matches:
        return None

    matches.sort(key=lambda x: x[0], reverse=True)
    return matches[0][1]


def extract_mobile(address):
    match = re.search(r"03\d{9}", address)
    if match:
        return match.group()
    return ""


def clean_address(address):
    return re.sub(r"03\d{9}", "", address).replace(":", "").strip()


# ---------------- TRACKING FUNCTION ----------------

from selenium.common.exceptions import NoAlertPresentException

def get_delivery_office(tracking_number):

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 20)

    try:
        driver.get("https://ep.gov.pk/international_tracking.asp")

        wait.until(EC.presence_of_element_located((By.NAME, "textfieldz")))

        input_box = driver.find_element(By.NAME, "textfieldz")
        input_box.clear()
        input_box.send_keys(tracking_number)

        input_box.submit()
        time.sleep(3)

        # Handle alert
        try:
            alert = driver.switch_to.alert
            print("Tracking alert:", alert.text)
            alert.accept()
            driver.quit()
            return None
        except NoAlertPresentException:
            pass

        # IMPORTANT: Switch into iframe where result appears
        iframes = driver.find_elements(By.TAG_NAME, "iframe")

        if len(iframes) > 0:
            driver.switch_to.frame(iframes[0])

        page_text = driver.find_element(By.TAG_NAME, "body").text

        print("\n--- TRACKING TEXT ---")
        print(page_text)
        print("--- END TEXT ---\n")

        # Extract Delivery Office
        match = re.search(r"Delivery Office\s*:\s*(.+)", page_text, re.IGNORECASE)

        driver.quit()

        if match:
            delivery_line = match.group(1).strip()
            delivery_office = delivery_line.split("\n")[0].strip()
            print("Delivery Office Extracted:", delivery_office)
            return delivery_office

        return None

    except Exception as e:
        print("Tracking error:", e)
        driver.quit()
        return None


# ---------------- COMPLAINT SUBMIT ----------------

def submit_complaint(row_index, row):

    barcode = row["BarCode"].strip()
    addressee_name = row["Name"].strip()
    address_full = row["Address & Contact No"].strip()

    mobile = extract_mobile(address_full)
    clean_addr = clean_address(address_full)

    delivery_office = get_delivery_office(barcode)

    if not delivery_office:
        complaint_sheet.update_cell(row_index, 5, "ERROR")
        return

    matched = match_delivery_office(delivery_office)

    if not matched:
        complaint_sheet.update_cell(row_index, 5, "ERROR")
        return

    district = matched["district"]
    tehsil = matched["tehsil"]
    location = matched["location"]

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 20)

    try:
        driver.get("https://ep.gov.pk/complaints.asp")

        wait.until(EC.frame_to_be_available_and_switch_to_it((By.NAME, "IFR")))
        wait.until(EC.presence_of_element_located((By.NAME, "txt_ArticleNo")))

        # Article Number
        article_box = driver.find_element(By.NAME, "txt_ArticleNo")
        article_box.clear()
        article_box.send_keys(barcode)

        # Wait for ServiceType to load after postback
        wait.until(lambda d: len(Select(d.find_element(By.NAME, "ddlServiceType")).options) > 1)

        # Complainant Info
        driver.find_element(By.NAME, "txt_ComplainantName").send_keys(SHIPPER_NAME)
        driver.find_element(By.NAME, "txt_ComplainantPhNo").send_keys(SHIPPER_PHONE)

        Select(driver.find_element(By.NAME, "ddlPreferredModeOfReply")).select_by_visible_text("SMS")

        # Wait for Problem Category to populate
        wait.until(lambda d: len(Select(d.find_element(By.NAME, "ddl_ProblemCategory")).options) > 1)

        problem_dropdown = Select(driver.find_element(By.NAME, "ddl_ProblemCategory"))

        for option in problem_dropdown.options:
            if "NON" in option.text.upper():
                problem_dropdown.select_by_visible_text(option.text)
                break

        # Sender Info
        driver.find_element(By.NAME, "txtSenderName").send_keys(SHIPPER_NAME)
        driver.find_element(By.NAME, "txtSenderAddress").send_keys(SHIPPER_ADDRESS)
        driver.find_element(By.NAME, "txtSenderEmail").send_keys(SHIPPER_EMAIL)
        driver.find_element(By.NAME, "txtSenderMobile").send_keys(SHIPPER_PHONE)
        driver.find_element(By.NAME, "TextBoxCustomBookingOffice").send_keys(SHIPPER_BOOKING_OFFICE)

        # Addressee Info
        driver.find_element(By.NAME, "txtAddresseeName").send_keys(addressee_name)
        driver.find_element(By.NAME, "txtAddresseeAddress").send_keys(clean_addr)
        driver.find_element(By.NAME, "txtAddresseeMobile").send_keys(mobile)

        # District Selection
        Select(driver.find_element(By.NAME, "DDDistrict")).select_by_visible_text(district)
        time.sleep(2)

        Select(driver.find_element(By.NAME, "DDTehsil")).select_by_visible_text(tehsil)
        time.sleep(2)

        Select(driver.find_element(By.NAME, "DDLocations")).select_by_visible_text(location)

        # Submit
        driver.find_element(By.NAME, "ImageButton1").click()
        time.sleep(5)

        page_text = driver.page_source

        comp_match = re.search(r"Complaint No\s*[:\-]?\s*(\d+)", page_text)

        if comp_match:
            complaint_no = comp_match.group(1)
            today = datetime.date.today().strftime("%d-%m-%Y")

            complaint_sheet.update_cell(row_index, 5, "FILED")
            complaint_sheet.update_cell(row_index, 6, complaint_no)
            complaint_sheet.update_cell(row_index, 7, today)
        else:
            complaint_sheet.update_cell(row_index, 5, "ERROR")

    except Exception as e:
        print("Complaint submission error:", e)
        complaint_sheet.update_cell(row_index, 5, "ERROR")

    finally:
        driver.quit()


# ---------------- MAIN LOOP ----------------

records = complaint_sheet.get_all_records()

print("Total rows found:", len(records))

for idx, row in enumerate(records, start=2):

    print("Row Status:", row.get("Complaint Status"))

    if str(row.get("Complaint Status", "")).strip().upper() == "PENDING":

        print("Processing:", row["BarCode"])
        submit_complaint(idx, row)

print("Complaint processing completed.")