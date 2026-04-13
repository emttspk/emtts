from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
import time
import re

def get_latest_tracking(tracking_number):

    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")  # run in background
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

    driver.get("https://ep.gov.pk/international_tracking.asp")
    time.sleep(3)

    input_box = driver.find_element(By.NAME, "textfieldz")
    input_box.clear()
    input_box.send_keys(tracking_number)
    input_box.send_keys(Keys.RETURN)

    time.sleep(5)

    driver.switch_to.frame(driver.find_elements(By.TAG_NAME, "iframe")[0])

    page_text = driver.find_element(By.TAG_NAME, "body").text

    driver.quit()

    lines = [line.strip() for line in page_text.split("\n") if line.strip()]

    date_pattern = r"^[A-Za-z]+ \d{1,2}, \d{4}$"
    dates = [i for i, line in enumerate(lines) if re.match(date_pattern, line)]

    if not dates:
        return None

    last_date_index = dates[-1]

    latest_date = lines[last_date_index]
    latest_time = lines[last_date_index + 1]
    full_status = lines[last_date_index + 2]

    # Remove BagID
    clean_status = re.sub(r"\(BagID:.*?\)", "", full_status).strip()

    # Extract City (first word)
    city = clean_status.split(" ")[0]

    return {
        "date": latest_date,
        "time": latest_time,
        "city": city,
        "status": clean_status
    }


# 🔹 TEST
tracking_number = "VPL26020317"

result = get_latest_tracking(tracking_number)

if result:
    print("\n---- CLEAN RESULT ----\n")
    print("Date:", result["date"])
    print("Time:", result["time"])
    print("City:", result["city"])
    print("Status:", result["status"])
else:
    print("No tracking data found.")