# Attribution Reporting Audit 2026

**Date:** 2026-06-06  
**Status:** Implemented  
**Project:** ePost.pk / Label Generator

## Summary
Analytics attribution and funnel reporting were added in a way that keeps business logic unchanged and stores only safe marketing metadata.

## What Was Added

### Safe Attribution Capture
The frontend analytics helper now captures:

* `utm_source`
* `utm_medium`
* `utm_campaign`
* `referrer`
* `landing_path`
* `session_id`

The capture is stored in browser session storage and sent with analytics events so attribution survives route changes and login flows.

### Reporting Storage
* A dedicated `AnalyticsEvent` table stores safe analytics events.
* The frontend posts safe events to `/api/analytics/collect`.
* The admin dashboard reads `/api/analytics/report` for attribution and funnel reporting.

### Dashboard Visibility
The admin dashboard now surfaces:

* registrations
* logins
* first labels
* purchases
* conversion rates
* source performance
* campaign performance
* top landing pages

## Safety Notes
* No CNIC, phone, address, tracking ID, parcel contents, or customer profile data is stored in the attribution layer.
* The reporting layer only records safe marketing and funnel metadata.

## Remaining Recommendations
* Review dashboard data after a small amount of real traffic accumulates.
* If campaign-level reporting needs deeper historical retention, add a periodic export or warehouse sync later.
