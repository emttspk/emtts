from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

options = webdriver.ChromeOptions()
options.add_argument("--start-maximized")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

# Open Pakistan Post tracking page
driver.get("https://ep.gov.pk/international_tracking.asp")

time.sleep(10)

driver.quit()

print("Tracking page opened successfully.")