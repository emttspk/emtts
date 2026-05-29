# Support Tickets Operations Runbook

## Scope
Operational guidance for support tickets, admin handling, and attachment safety.

## Runtime Components
- API routes in `apps/api/src/routes/support.ts` and `apps/api/src/routes/adminSupport.ts`
- Shared validation and SLA logic in `apps/api/src/services/supportTickets.ts`
- Notification persistence and read-state logic in `apps/api/src/services/supportNotifications.ts`
- Admin UI tab in `apps/web/src/pages/admin/AdminCommandCenter.tsx`

## Required Services
- PostgreSQL for ticket/message/audit metadata
- Cloudflare R2 for attachment objects

## Storage Rules
- Support attachments are persisted in R2 object storage only.
- Local disk is not used as permanent storage for support attachments.
- Attachment metadata (name, mime, size, object key) is stored in PostgreSQL.

## Security Rules
- Customer can access only own tickets and own attachments.
- Admin can access all tickets through admin endpoints.
- Attachment download requires authorized API call before signed URL is issued.

## API Operations
Customer:
- Create: `POST /api/support/tickets`
- List: `GET /api/support/tickets`
- Detail: `GET /api/support/tickets/:id`
- Reply: `POST /api/support/tickets/:id/messages`
- Upload attachment: `POST /api/support/tickets/:id/attachments`
- Download link: `GET /api/support/tickets/:ticketId/attachments/:attachmentId/download`
- Notifications: `GET /api/support/notifications`
- Mark read: `POST /api/support/notifications/read`

Admin:
- List: `GET /api/admin/support/tickets`
- Summary: `GET /api/admin/support/summary`
- Detail: `GET /api/admin/support/tickets/:id`
- Status update: `PATCH /api/admin/support/tickets/:id/status`
- Priority update: `PATCH /api/admin/support/tickets/:id/priority`
- Preserve toggle: `PATCH /api/admin/support/tickets/:id/preserve`
- Reply: `POST /api/admin/support/tickets/:id/messages`
- Notifications: `GET /api/admin/support/notifications`
- Mark read: `POST /api/admin/support/notifications/read`

## Create Ticket Attachments
- Customer create-ticket modal supports selecting up to 5 files before submit.
- Allowed types: PDF, JPG, JPEG, PNG, WEBP, CSV, XLS, XLSX, DOC, DOCX, TXT.
- File limits: max 5 files per upload, max 10 MB per file.
- Unsupported extensions are rejected in the UI before upload.
- Ticket is created first, then attachments are uploaded through the existing secure support attachment API.
- If attachment upload fails, ticket creation remains successful and the UI shows a warning.

## Admin Console Usage
- Open Admin Command Center and switch to Support tab.
- Use filters for search/status/date.
- Open ticket detail to inspect thread.
- Use status/priority controls for workflow progression.
- Use preserve toggle to keep tickets out of cleanup eligibility.
- Send admin replies from detail panel.
- Use topbar bell to review unread support notifications.
- Support detail attachments include View and Download actions via protected signed URLs.

## Retention Policy
- Environment variable: `SUPPORT_TICKET_RETENTION_DAYS` (default `90`).
- Recommended production default: `90`.
- Shorter values are allowed for development/testing scenarios only.
- Closing behavior:
  - If preserve is disabled, `deleteAfter` is scheduled using retention days.
  - If preserve is enabled, `deleteAfter` remains null.
- Preserve toggling on closed tickets updates eligibility immediately.
- R2 objects are not deleted at close time.

## Cleanup Command (Manual Safe Path)
- Command: `npm run support:cleanup --workspace=@labelgen/api`
- Eligible records only: closed tickets where preserve is false and deleteAfter is due.
- Cleanup order:
  - delete support attachment objects from R2
  - delete ticket record in DB (cascade removes messages, attachments, audit logs, notifications)
- No automatic scheduler hookup is enabled by default in this phase.

## Support Storage Summary Card
- Admin Support summary now includes:
  - total support tickets
  - open tickets
  - closed tickets
  - total support attachment count
  - total support R2 storage used in MB

## Closed Ticket Rule
- Customers cannot reply to or upload attachments on tickets with status `CLOSED`.
- Customer UI hides the reply/upload controls and instructs the user to create a new ticket.
- Backend returns a non-success response if a customer attempts reply/upload against a closed ticket.
- Admin can still view closed tickets and can change status away from `CLOSED` if reopening is needed.

## Notification Rules
- Customer bell shows new admin replies and ticket status updates, including resolved/closed outcomes.
- Admin bell shows new customer tickets, new customer replies, and urgent/high-priority open tickets.
- Notifications are persisted in DB and support unread badges plus mark-all-read.

## Public Entry Points
- Public Support menu routes logged-in users to `/support`.
- Logged-out users are routed to login before ticket creation.
- Footer support/company card exposes support-ticket entry links without changing the home-page layout structure.
- Public footer no longer displays support email and now guides users through support-ticket links.

## Audit Expectations
Each mutation should create support audit rows:
- `status_changed`
- `priority_changed`
- `admin_reply`
- plus customer actions (`ticket_created`, `user_reply`, `attachment_uploaded`)

## Validation Commands
From repository root:
```bash
npm run prisma:generate --workspace=@labelgen/api
npm run lint
npm run typecheck
npm run build
npm run test:support --workspace=@labelgen/api
```

## Migration Handling (Non-Destructive)
If `prisma migrate dev` requests reset due local drift:
- Do not reset local DB.
- Cancel reset prompt.
- Use non-destructive baseline strategy for already-existing historical migrations:
  - `prisma migrate resolve --applied <migration_name>`
- Then use deploy path for pending migration files:
  - `prisma migrate deploy`

## Known Local Drift Note
Some local environments may contain legacy objects that are not fully represented by migration history. This can block `migrate dev` while still allowing controlled deploy-path migration for additive support tables.
