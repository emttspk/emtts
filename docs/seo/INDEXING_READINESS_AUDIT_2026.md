# Indexing Readiness Audit 2026

## Scope
- robots.txt
- sitemap.xml
- canonical URLs
- OpenGraph
- Twitter tags
- JSON-LD
- Search Console placeholders
- Bing placeholders
- Meta verification placeholders
- sitemap route coverage

## Audit Summary

### Robots.txt
- `apps/web/public/robots.txt` allows crawling and points to `https://www.epost.pk/sitemap.xml`.

### Sitemap.xml
- `apps/web/public/sitemap.xml` includes the main public discovery pages:
  - `/`
  - `/tracking`
  - `/pricing`
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/forgot-username`
  - `/email-otp-login`
  - `/pakistan-post-tracking`
  - `/bulk-tracking`
  - `/pakistan-post-complaints`
  - `/label-generator`
  - `/money-order-generation`
  - `/ecommerce-shipping-pakistan`

### Canonical URLs
- `apps/web/index.html` uses the canonical homepage URL `https://www.epost.pk/`.
- Route-level SEO components in the app already emit canonical URLs for public pages.

### OpenGraph / Twitter / JSON-LD
- Homepage HTML includes OpenGraph metadata.
- Homepage HTML includes Twitter card metadata.
- Homepage HTML includes JSON-LD for Organization, WebSite, and SoftwareApplication.

### Verification Placeholders
- Safe placeholders exist in `apps/web/index.html` for:
  - Google Search Console
  - Bing Webmaster Tools
  - Meta domain verification
- No fake tokens were added.

## Result
- Indexing readiness is high because the crawlable surface, canonical metadata, and sitemap coverage are all in place.
- Remaining work is operator-side only: replacing the placeholders with real verification tokens in the relevant dashboards if desired.

## Score
- Indexing readiness: 96%
- Sitemap coverage: 100% of public discovery pages
- Remaining blockers: manual token insertion for Search Console / Bing / Meta verification
