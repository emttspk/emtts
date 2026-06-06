# Search Console Setup Guide

This guide covers the safe verification steps for Google Search Console, Bing Webmaster Tools, and Meta domain verification for `ePost.pk`.

## 1. Google Search Console Setup

1. Open Google Search Console.
2. Add the property for `https://www.epost.pk/`.
3. Complete verification using one of:
   - HTML meta tag
   - DNS TXT record
   - Google Analytics / Google Tag Manager, if available
4. If using the HTML tag method, replace the Google placeholder in [apps/web/index.html](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/index.html) with the real token.
5. Confirm verification status inside Search Console.

Recommended settings:
- Use the `https://www.epost.pk/` property, not a URL prefix for `http`.
- Keep the canonical `www` domain as the main property.
- Submit the live sitemap after deployment.

## 2. Bing Webmaster Tools Setup

1. Open Bing Webmaster Tools.
2. Add the `https://www.epost.pk/` site.
3. Verify using:
   - HTML meta tag
   - XML file upload
   - DNS CNAME/TXT
4. If using the HTML tag method, replace the Bing placeholder in [apps/web/index.html](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/index.html) with the real token.

Recommended settings:
- Submit the same canonical sitemap used by Google.
- Keep the preferred domain aligned with `https://www.epost.pk/`.

## 3. Meta Domain Verification

1. Open Meta Business Suite / Events Manager / Brand Safety domain settings.
2. Add the `epost.pk` domain.
3. Verify using:
   - HTML meta tag
   - DNS TXT record
4. If using the HTML tag method, replace the Meta placeholder in [apps/web/index.html](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/index.html) with the real token.

Recommended settings:
- Verify the exact production domain used by the site.
- Keep the verification token private and do not commit real tokens.

## 4. Verification Methods

Supported methods:
- HTML meta tag
- DNS TXT/CNAME
- Search-console-owned property verification

Notes:
- This repository currently contains safe placeholders only.
- Do not replace the placeholders until you have the real token from the relevant platform.

## 5. Sitemap Submission

Submit the live sitemap URL:

`https://www.epost.pk/sitemap.xml`

Before submitting:
- Confirm the sitemap returns HTTP 200.
- Confirm the URLs are canonical and match the public site.
- Confirm `robots.txt` allows crawling and includes the sitemap directive.

## 6. Recommended Settings

- Property: `https://www.epost.pk/`
- Canonical domain: `https://www.epost.pk/`
- Sitemap: `https://www.epost.pk/sitemap.xml`
- Robots directive: allow crawling and point to the sitemap
- Verification token handling: keep tokens out of git history unless you intentionally replace the placeholder with the live token in a secure change

