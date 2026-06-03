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
