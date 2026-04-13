import importlib.util
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(root))
module_path = root / 'app.py'
spec = importlib.util.spec_from_file_location('complaint_app', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

result = module.submit_complaint(
    'VPL26030726',
    '03001234567',
    {
        'sender_name': 'Test Sender',
        'sender_address': '123 Test Rd',
        'sender_city': 'Lahore',
        'receiver_name': 'Test Receiver',
        'receiver_address': 'Chak No 186 TDA',
        'receiver_city': 'Sahiwal',
        'recipient_district': 'Sahiwal',
        'recipient_tehsil': 'Sahiwal',
        'recipient_location': 'Fareed Town Sahiwal',
        'booking_date': '2026-03-27',
        'complaint_text': 'Test complaint',
        'complaint_reason': 'Pending Delivery',
    },
)
print(json.dumps(result, indent=2))
