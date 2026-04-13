import sys, pathlib, os, json
cwd=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(cwd))
os.chdir(cwd)
from app import submit_complaint
result = submit_complaint('VPL26030726', '03354299783', {
    'sender_name':'Hoja Seeds',
    'sender_address':'C/o City Post office Sahiwal',
    'sender_city':'Sahiwal',
    'receiver_name':'Addressee',
    'receiver_address':'CHAK NO 186 TDA',
    'receiver_city':'CHAK NO 186 TDA',
    'booking_office':'Sahiwal',
    'service_type':'VPL',
    'complaint_reason':'Pending Delivery',
    'complaint_text':'Dear Complaint Team, I respectfully request assistance regarding VPL26030726. It is pending and needs verification. Thank you.',
    'recipient_district':'Shikarpur',
    'recipient_tehsil':'Lakhi Ghulam Shah',
    'recipient_location':'Chak',
})
print('RESULT_START')
print(json.dumps(result, indent=2))
