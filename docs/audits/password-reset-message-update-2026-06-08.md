# Password Reset Message Update

**Date:** 2026-06-08
**Status:** COMPLETE

## Summary

Updated the forgot password success message to be more user-friendly while maintaining security protection (identical response for registered and unregistered emails).

## Changes

### Frontend: `apps/web/src/pages/ForgotPassword.tsx`
- Changed to use API response `data.message` instead of hardcoded string
- This ensures the frontend always displays the same message the API returns

### API: `apps/api/src/routes/auth.ts`
- Updated response message at line 602

## Message

**Before:** `"If this account exists, a password reset email has been sent."`

**After:** `"If the email address is registered, a password reset email has been sent. Please check your inbox and spam folder."`

## Security Audit

- ✅ Same response for registered and unregistered emails
- ✅ Does not reveal if email exists
- ✅ Does not reveal user not found
- ✅ Does not reveal account does not exist

## Build Verification

- `npm run build -w apps/web` - PASS
- `npm run build -w apps/api` - PASS

## Files Changed

- `apps/web/src/pages/ForgotPassword.tsx` - Use API response message
- `apps/api/src/routes/auth.ts` - Update response message string

## Commit

- Commit hash: (pending push)
