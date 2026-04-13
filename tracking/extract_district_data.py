import time
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from webdriver_manager.chrome import ChromeDriverManager


# ================= GOOGLE SHEET SETUP ================= #

scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
client = gspread.authorize(creds)

spreadsheet = client.open("PakistanPost Tracking System")
sheet = spreadsheet.worksheet("District_Data")

existing = sheet.get_all_values()

last_district = None
row_number = 2

if len(existing) > 1:
    last_district = existing[-1][0]
    row_number = len(existing) + 1
    print("Resuming after:", last_district)
else:
    print("Starting fresh extraction")


# ================= SELENIUM SETUP ================= #

options = webdriver.ChromeOptions()
options.add_argument("--window-size=1920,1080")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

driver.get("https://ep.gov.pk/complaints.asp")
time.sleep(3)

wait = WebDriverWait(driver, 20)


def enter_iframe():
    driver.switch_to.default_content()
    driver.switch_to.frame(driver.find_element(By.ID, "IFR"))


enter_iframe()

district_select = Select(wait.until(
    EC.presence_of_element_located((By.NAME, "DDDistrict"))
))

district_options = district_select.options


# Find start index
start_index = 1

if last_district:
    for i in range(1, len(district_options)):
        if district_options[i].text.strip() == last_district:
            start_index = i + 1
            break

print("Starting from index:", start_index)


# ================= EXTRACTION ================= #

buffer = []
BATCH_SIZE = 200
total_written = 0


for d_index in range(start_index, len(district_options)):

    try:
        enter_iframe()

        district_select = Select(driver.find_element(By.NAME, "DDDistrict"))

        # Capture current tehsil HTML before change
        old_tehsil_html = driver.find_element(By.NAME, "DDTehsil").get_attribute("innerHTML")

        district_select.select_by_index(d_index)
        district_name = district_select.options[d_index].text.strip()

        print("\nDistrict:", district_name)

        # Wait until tehsil changes
        try:
            wait.until(lambda d: d.find_element(By.NAME, "DDTehsil").get_attribute("innerHTML") != old_tehsil_html)
        except TimeoutException:
            print("   No tehsil change detected, skipping district.")
            continue

        enter_iframe()

        tehsil_select = Select(driver.find_element(By.NAME, "DDTehsil"))
        tehsil_options = tehsil_select.options

        if len(tehsil_options) <= 1:
            print("   No tehsil available.")
            continue

        for t_index in range(1, len(tehsil_options)):

            try:
                enter_iframe()

                tehsil_select = Select(driver.find_element(By.NAME, "DDTehsil"))

                old_location_html = driver.find_element(By.NAME, "DDLocations").get_attribute("innerHTML")

                tehsil_select.select_by_index(t_index)
                tehsil_name = tehsil_select.options[t_index].text.strip()

                print("   Tehsil:", tehsil_name)

                try:
                    wait.until(lambda d: d.find_element(By.NAME, "DDLocations").get_attribute("innerHTML") != old_location_html)
                except TimeoutException:
                    print("      No location change detected.")
                    continue

                enter_iframe()

                location_select = Select(driver.find_element(By.NAME, "DDLocations"))
                location_options = location_select.options

                if len(location_options) <= 1:
                    print("      No locations found.")
                    continue

                for opt in location_options[1:]:
                    location_name = opt.text.strip()

                    buffer.append([district_name, tehsil_name, location_name])

                    if len(buffer) >= BATCH_SIZE:
                        sheet.update(
                            range_name=f"A{row_number}:C{row_number + len(buffer) - 1}",
                            values=buffer
                        )

                        row_number += len(buffer)
                        total_written += len(buffer)

                        print("   Batch written:", total_written)

                        buffer = []

            except Exception as tehsil_error:
                print("   Tehsil error:", tehsil_error)
                continue

    except Exception as district_error:
        print("District error:", district_error)
        continue


# Final write
if buffer:
    sheet.update(
        range_name=f"A{row_number}:C{row_number + len(buffer) - 1}",
        values=buffer
    )
    total_written += len(buffer)


driver.quit()

print("\nExtraction completed.")
print("Total rows written this run:", total_written)