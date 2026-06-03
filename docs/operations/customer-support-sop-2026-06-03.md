# Customer Support SOP (2026-06-03)

## Scope
- Frontline and Tier-2 support handling for ePost.pk production users.
- Covers the most common incident categories and escalation path.
- Process/documentation guidance only; no product logic changes.

## Severity and Response Targets
- P1 (Platform down, login outage, payment outage): acknowledge <= 10 min, escalate immediately.
- P2 (Feature blocked for single user/group): acknowledge <= 30 min, investigate same shift.
- P3 (How-to, minor UI confusion): acknowledge <= 4 hours.

## General Intake Template
Capture before troubleshooting:
- Customer full name and account email/username.
- Phone/contact and preferred callback method.
- Exact issue summary and first-seen timestamp (local + UTC if possible).
- Device model, OS version, browser/app version.
- URL where issue occurred.
- One full screenshot and one short screen recording if possible.

## 1) Login Problem SOP
1. Confirm exact error text shown on screen.
2. Confirm email/username format and typing issues (spaces/case mistakes).
3. Ask user to retry once in private/incognito window.
4. Confirm whether issue affects one account or multiple users.
5. Escalate to Auth/Platform if repeated failures occur with correct credentials.

## 2) Email Verification Problem SOP
1. Confirm registered email address exactly.
2. Ask user to check spam/junk/promotions folders.
3. Confirm whether user clicked an older/expired verification link.
4. Ask user to request a fresh verification email from the latest session.
5. Escalate with email address + timestamps if email never arrives.

## 3) Camera Permission Problem SOP
1. Confirm user tapped Scan Barcode manually (no auto-open expected).
2. Ask user to tap browser lock/site settings icon and allow Camera.
3. Ask user to retry scanner using Retry button.
4. If still blocked, ask user to reload page and retry once.
5. If unresolved, capture device/browser details and escalate to frontend team.

## 4) Label Generation Problem SOP
1. Confirm input file/template used and route URL.
2. Confirm exact step where generation fails.
3. Capture on-screen error text and network status screenshot if possible.
4. Ask user to retry with a small sample dataset.
5. Escalate with sample file (if allowed), error text, and timestamp.

## 5) Tracking Problem SOP
1. Confirm tracking ID(s) exactly as entered/scanned.
2. Check if single ID fails or all IDs fail.
3. Confirm route used (public tracking vs internal tools).
4. Capture returned status/error screenshot.
5. Escalate with affected IDs and timestamp window.

## 6) Payment/Package Problem SOP
1. Confirm selected package/plan name and expected amount.
2. Confirm payment result shown (`success`, `failed`, `pending`).
3. Ask customer for transaction reference/order ID if available.
4. Verify if issue is UI-only or account entitlement not updated.
5. Escalate to billing/finance ops with transaction evidence.

## 7) Complaint Filing Problem SOP
1. Confirm complaint form URL and complaint category selected.
2. Capture validation/error message text exactly.
3. Confirm required fields and attachments were provided.
4. Ask user to retry submit once after page refresh.
5. Escalate with screenshots and payload details (non-sensitive only).

## Required Evidence From Customer
Always request these for any unresolved issue:
- Full-page screenshot including URL bar and timestamp.
- Short screen recording showing reproduction steps.
- Account email/username.
- Device + OS + browser version.
- Time issue occurred.
- Any reference ID (tracking ID, complaint ID, payment ID, order ID).

## Escalation Matrix
- Auth/Login/Verification -> Auth + Platform team
- Camera/Scanner/UI -> Frontend team
- Label/Money Order/Tracking/Complaint functional errors -> Operations product team
- Payment/Package mismatch -> Billing + Finance ops
- Infra outage (domain/API/500s widespread) -> Platform on-call immediately

## Customer Communication Standards
- Use plain, non-technical language.
- Never promise immediate fix without verification.
- Give next update ETA in every escalation handoff.
- Confirm resolution with customer before closing ticket.

## Ticket Closure Checklist
- Root cause category recorded.
- Evidence attached and sanitized.
- Resolution steps documented.
- Customer confirmation logged.
- Follow-up action item created if systemic issue detected.
