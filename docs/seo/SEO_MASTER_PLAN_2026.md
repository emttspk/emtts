# SEO Master Plan 2026 - ePost.pk

## Phase 1 Implementation Status (2026-06-04)

- Phase 1 technical SEO foundation implemented in web frontend:
    - `apps/web/public/robots.txt` added with sitemap reference.
    - `apps/web/public/sitemap.xml` added with core discovery URLs.
    - `apps/web/index.html` updated with static title, description, canonical, OpenGraph, and Twitter meta tags.

## Phase 2 Implementation Status (2026-06-04)

- Phase 2 social and structured data completed:
    - Added social preview image metadata (`og:image`, `twitter:image`) using existing public logo asset.
    - Added static hardening tags: `og:site_name`, `twitter:site`, `robots`, `theme-color`, `application-name`.
    - Added JSON-LD for `Organization`, `WebSite` (+ `SearchAction`), and `SoftwareApplication` with safe verified public details only.

## Phase 3 Implementation Status (2026-06-04)

- Phase 3 dynamic route SEO completed for public-facing routes:
    - Added Helmet provider at app root.
    - Added reusable SEO component for route-level title/description/canonical/social metadata.
    - Implemented route metadata on Home, Tracking, Pricing, Login, Register, and Support pages.

## robots.txt Fix Status (2026-06-04)

- robots.txt sitemap directive fixed and ready for redeploy verification.

## Current Status (Audit Date: 2026-06-04)

**OVERALL SCORE: 15/100 (CRITICAL GAPS)**

| Component | Status | Finding |
|-----------|--------|---------|
| **Meta Titles** | ⚠️ Partial | Static title "Bulk Dispatch & Tracking System" in `index.html`. Lacks "ePost.pk" branding. |
| **Meta Descriptions** | ❌ Missing | No description tags found. |
| **OpenGraph Tags** | ❌ Missing | No OG tags for Facebook/WhatsApp/LinkedIn sharing. |
| **sitemap.xml** | ❌ Missing | Search engines have no map of the public site. |
| **robots.txt** | ❌ Missing | No crawling instructions. |
| **Canonical URLs** | ❌ Missing | Risk of duplicate content indexing. |
| **Structured Data** | ❌ Missing | No JSON-LD for Organization, Website, or FAQ. |
| **Internal Linking** | ✅ Good | Navbar and Footer have logical hierarchical links. |
| **Sitelink Readiness** | ✅ Good | Footer columns (Products, Shipping Tools, Help) are well-structured for sitelinks. |
| **Keyword Placement** | ✅ Good | "Pakistan Post", "Bulk Tracking", and "Label Generation" used naturally in UI. |
| **Page Speed** | ⚠️ Average | Basic Vite chunking active. Lacks Gzip/Brotli and modern image format (WebP) support. |

---

## Master Plan 2026: Implementation Roadmap

### Phase 1: Technical Foundation (Immediate)
1.  **robots.txt**: Create `apps/web/public/robots.txt` to allow crawling and point to sitemap.
2.  **sitemap.xml**: Create `apps/web/public/sitemap.xml` listing `/`, `/tracking`, `/login`, `/register`, `/forgot-password`.
3.  **Base Metadata**: Inject standard meta tags into `apps/web/index.html`:
    -   Title: `ePost.pk | Bulk Pakistan Post Label Generation & Tracking`
    -   Description: `Pakistan's #1 platform for bulk Pakistan Post label generation, shipment tracking, and money order management for online sellers.`
4.  **Canonical Tags**: Add `<link rel="canonical" href="https://www.epost.pk/" />`.

### Phase 2: Social & Structured Data (Short-term)
1.  **OpenGraph**: Add `og:title`, `og:description`, `og:image` (Logo), and `og:url` to `index.html`.
2.  **Twitter Cards**: Add `twitter:card`, `twitter:title`, and `twitter:description`.
3.  **JSON-LD**: Implement structured data in `index.html`:
    -   `Organization`: ePost.pk logo and social profiles.
    -   `WebSite`: Search action for tracking IDs.

### Phase 3: Dynamic SEO (Medium-term)
1.  **React Helmet**: Install `react-helmet-async` to manage dynamic titles for `/tracking/:id` and `/register`.
2.  **Dynamic Descriptions**: Set specific descriptions for tools (e.g., "Real-time Pakistan Post tracking engine").

### Phase 4: Performance & Sitelinks (Long-term)
1.  **Image Optimization**: Convert assets to WebP.
2.  **Breadcrumbs**: Implement BreadcrumbList structured data on sub-pages.
3.  **Gzip/Brotli**: Ensure Railway/Cloudflare is configured for compression.

---

## Targeted Keywords
- **Primary**: Pakistan Post Tracking, Bulk Label Generation, Pakistan Post Courier, ePost Pakistan.
- **Secondary**: Cash on Delivery Pakistan, Parcel Booking Pakistan, UMS Tracking, Pakistan Post Complaint.

## Testing & Validation Checklist
- [ ] Verify `www.epost.pk/robots.txt` is reachable.
- [ ] Verify `www.epost.pk/sitemap.xml` is reachable.
- [ ] Use [Google Rich Results Test](https://search.google.com/test/rich-results) for JSON-LD.
- [ ] Use [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/) for OG tags.
- [ ] Monitor Google Search Console for index status.

## Production Indexing Runbook

- [ ] Verify Google Search Console property exists for `https://www.epost.pk/`.
- [ ] Submit sitemap: `https://www.epost.pk/sitemap.xml`.
- [ ] Check robots file in browser: `https://www.epost.pk/robots.txt`.
- [ ] Inspect homepage URL and request indexing.
- [ ] Repeat URL inspection/index request for `/tracking`, `/pricing`, `/register`, and `/support` when publicly accessible.
- [ ] Optionally submit sitemap in Bing Webmaster Tools.

## SEO Evidence Capture Checklist

- [ ] Screenshot Search Console sitemap submission status.
- [ ] Screenshot `robots.txt` opened in browser.
- [ ] Store screenshots outside this repository unless a dedicated docs artifact folder is approved.

## Production Verification Attempt (2026-06-03 23:00 UTC)

- No PII used during this verification attempt.
- Verification focused on public SEO endpoints and public routes only.

| Check | Result | Notes |
|------|------|------|
| `https://www.epost.pk/` returns 200 | PASS | Production homepage reachable. |
| `https://www.epost.pk/robots.txt` returns 200 | PASS | Reachable in browser/curl. |
| `robots.txt` includes sitemap directive | FAIL | Current production robots content did not include a `Sitemap:` line during this attempt. |
| `https://www.epost.pk/sitemap.xml` returns 200 | PASS | Sitemap reachable. |
| Sitemap includes public URLs (`/`, `/tracking`, `/pricing`, `/register`, `/support`) | PASS | Expected public URLs present. |
| Public routes `/tracking`, `/pricing`, `/register`, `/support` load without blank page | PASS | HTTP 200 and root app shell present for each route. |
| Static meta tags exist in production HTML | PASS | Title, description, canonical, OG, and Twitter markers detected. |
| JSON-LD exists in production HTML | PASS | `Organization`, `WebSite`, and `SoftwareApplication` markers detected. |
| Search Console property + indexing request workflow | NEEDS MANUAL CONFIRMATION | Requires Search Console access and operator execution. |
| Bing Webmaster submission (optional) | NEEDS MANUAL CONFIRMATION | Optional operator step. |

## Production robots/sitemap Recheck (2026-06-03 23:17 UTC)

| Check | Result | Notes |
|------|------|------|
| `https://www.epost.pk/robots.txt` returns 200 | PASS | Reachable after Web redeploy. |
| `robots.txt` includes `Sitemap: https://www.epost.pk/sitemap.xml` | PASS | Directive present in production response. |
| `https://www.epost.pk/sitemap.xml` returns 200 | PASS | Reachable after Web redeploy. |
| Sitemap includes `/`, `/tracking`, `/pricing`, `/register`, `/support` | PASS | All required public URLs present. |
| `https://www.epost.pk/` returns 200 and contains canonical + JSON-LD | PASS | Canonical and JSON-LD markers detected in homepage HTML. |

- Search Console URL inspection/submission and Bing submission remain manual operator steps.

## Final Manual Evidence Checklist (SEO)

- Google Search Console property verified: pending/manual.
- Sitemap submitted: pending/manual.
- Homepage inspected: pending/manual.
- `/tracking` inspected: pending/manual.
- `/pricing` inspected: pending/manual.
- `/register` inspected: pending/manual.
- `/support` inspected: pending/manual.
- Bing Webmaster submission: optional pending.

## Metadata Strengthening Note (2026-06-04)

- Homepage search metadata strengthened for Pakistan Post, bulk tracking, 1 click complaints, labels and money orders.

## Keyword Priority Strategy (From Local Marketing Keyword List)

Source reviewed: `marketing/Keyword Stats 2026-06-04 at 02_49_24.csv` (local only, not committed).

### Primary Keywords

- Pakistan Post
- Pakistan Post Tracking
- Pak Post Tracking
- Bulk Tracking
- Post Office Tracking
- Pakistan Mail Tracking

### Secondary Keywords

- Pakistan Post Complaints
- 1 Click Complaints
- Label Generation
- Money Order Generation
- Ecommerce Shipping Pakistan

### Long-Tail Keywords

- Pakistan Post tracking for ecommerce orders
- Bulk parcel tracking for Pakistan Post shipments
- 1 click Pakistan Post complaint submission online
- Pakistan Post label generation for bulk dispatch
- Money order generation and dispatch workflow Pakistan
- Ecommerce shipping Pakistan with tracking and complaints

### Keyword-to-Page Usage Map

- `/`: Pakistan Post, Ecommerce Shipping Pakistan, Label Generation (high-level service summary copy).
- `/tracking`: Pakistan Post Tracking, Pak Post Tracking, Post Office Tracking, Pakistan Mail Tracking, Bulk Tracking.
- `/support`: Pakistan Post Complaints, 1 Click Complaints.
- Label generation flow pages: Label Generation.
- Money order generation flow pages: Money Order Generation.
- Pricing/service overview pages: Ecommerce Shipping Pakistan, Bulk Tracking.

### Guardrails

- Avoid keyword stuffing: prioritize natural language and user intent over repeated exact-match phrases.
- Do not claim official Pakistan Post affiliation unless explicitly authorized; use wording that positions ePost.pk as a platform/service provider.

### Recommended Future Landing Pages

- `/pakistan-post-tracking`
- `/bulk-tracking`
- `/pakistan-post-complaints`
- `/label-generator`
- `/money-order-generation`
- `/ecommerce-shipping-pakistan`

- Raw marketing keyword exports are kept outside commits; only final keyword strategy is documented.
