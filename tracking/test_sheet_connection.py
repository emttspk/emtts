import gspread
from oauth2client.service_account import ServiceAccountCredentials

# Google API scope
scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

# Load credentials
creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
client = gspread.authorize(creds)

# 🔹 Replace with your exact sheet name
sheet = client.open("PakistanPost Tracking System").sheet1

data = sheet.get_all_records()

print("Total rows found:", len(data))

for row in data[:5]:
    print(row)