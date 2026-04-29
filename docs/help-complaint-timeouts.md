# Help: Complaint Timeout Troubleshooting

## Overview
Complaints are submitted to Pakistan Post's ASP.NET portal (ep.gov.pk). The portal is hosted in Pakistan and may experience slow response times, especially during peak hours.

## Timeout Configuration
```python
# python-service/app.py
COMPLAINT_FORM_TIMEOUT_SECONDS = 90   # per HTTP request to ep.gov.pk
COMPLAINT_MAX_RETRIES = 3             # total attempts
COMPLAINT_RETRY_DELAYS = [2, 4, 8]   # seconds between retries
```

## Retry Behaviour
Each complaint submission attempt:
1. Opens a new `requests.Session`
2. GETs complaint form URL
3. POSTs Article No postback
4. POSTs DDDistrict postback
5. POSTs DDTehsil postback
6. Resolves DDLocations
7. POSTs final form submission

If any step raises `ReadTimeout`, `ConnectionReset`, `ConnectionError`, or `ProtocolError`, the entire flow retries from step 1 with a new session after the configured delay.

## Common Timeout Symptoms

### ReadTimeout on Article No Postback
```
[ComplaintAPI] Tracking=VPL... Attempt=1 failed: ReadTimeout. Retrying in 2s with new session.
```
- Portal took >90s to respond to the initial postback
- Retry will attempt with fresh session
- If all 3 attempts fail, user sees "Connection reset by remote server" error

### ConnectionReset on Final Submit
```
[ComplaintAPI] Tracking=VPL... Attempt=2 failed: ConnectionResetError(10054). Retrying in 4s with new session.
```
- Pakistan Post server reset the connection during form submission
- Likely the complaint was partially submitted — check Pakistan Post tracking before re-submitting

### All 3 Attempts Failed
```
[ComplaintAPI] failed: ConnectionResetError | Tracking=VPL...
```
- Try again after a few minutes
- Pakistan Post portal may be temporarily down
- Check https://ep.gov.pk in browser to verify availability

## When to Contact Pakistan Post
- If all retries fail consistently over >1 hour
- If complaints are submitted but no complaint ID is returned
- Check https://ep.gov.pk manually and try the portal in a browser

## Railway Service Logs
To check timeout errors in production:
```
railway logs --service Python --lines 200
```
Look for `[ComplaintAPI]` lines with `Attempt=` and `failed:` to diagnose retry patterns.
