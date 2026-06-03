# Auth Layout Flip Audit (2026-06-03)

## Scope
- Auth layout UI only.
- Shared auth shell/component only.
- Mobile responsiveness only.
- No auth logic, Firebase logic, validation logic, backend, business modules, or postal workflows changed.

## Requirement
Flip desktop auth layout so:
- form block appears on the left
- branding block appears on the right

And on mobile:
- form appears first
- branding appears below

## Files Inspected
- `apps/web/src/components/AuthShell.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `apps/web/src/pages/ForgotPassword.tsx`
- `apps/web/src/pages/RegisterProfile.tsx`

## Exact Change
- Updated section ordering and divider borders in `AuthShell.tsx` only:
  - Branding section set to `order-2` and `md:order-2`
  - Form section set to `order-1` and `md:order-1`
  - Desktop separator moved to left border on branding panel
  - Mobile separator adjusted to top border on branding panel

## Outcome
- Desktop (`md+`): form is left, branding is right.
- Mobile: form appears first, branding appears below.
- Existing premium visual styling preserved.
- No field behavior, login/register/Firebase/Google/forgot-password/remember-me logic changed.

## Verification Targets
- `/login`
- `/register`
- `/forgot-password`
- `/register/profile`

## Validation
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run build` -> PASS

## Risk Assessment
- Low risk: shared shell ordering only; no data flow or auth execution path modified.
