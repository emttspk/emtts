# Firebase Production Console Checklist - 2026-06-03

Project target: `epost-auth`
Environment target: production (`www.epost.pk` / `epost.pk`)

## Manual Checklist
- [ ] `epost.pk` is listed in Authorized domains.
- [ ] `www.epost.pk` is listed in Authorized domains.
- [ ] Firebase auth domain is correct for the production project.
- [ ] Email/Password provider is enabled.
- [ ] Google provider is enabled if Google sign-in is used in production.
- [ ] Email verification template content and links are correct.
- [ ] Password reset template content and links are correct.
- [ ] Action URL opens the production domain.
- [ ] Abuse protection and quota settings were reviewed.
- [ ] Test email was delivered to inbox and spam folder was checked.

## Notes
- Do not record secrets, API keys, or email addresses in this file.
- Validate all links from a controlled test account only.
- If any item fails, auth production readiness is blocked until corrected and re-tested.

## Safe Production Smoke Execution
Use env variables only and do not print passwords or tokens:

```bash
railway variables --service Api --environment production
railway variables --set "SMOKE_EMAIL=your-smoke-user@example.com" --service Api --environment production
railway variables --set "SMOKE_PASSWORD=REPLACE_WITH_SECRET" --service Api --environment production
railway run --service Api --environment production -- npm run auth:smoke:prod
```
