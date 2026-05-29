# Support Tickets Operations Runbook

## Scope
Operational guidance for support tickets, admin handling, and attachment safety.

## Runtime Components
- API routes in `apps/api/src/routes/support.ts` and `apps/api/src/routes/adminSupport.ts`
- Shared validation and SLA logic in `apps/api/src/services/supportTickets.ts`
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

Admin:
- List: `GET /api/admin/support/tickets`
- Summary: `GET /api/admin/support/summary`
- Detail: `GET /api/admin/support/tickets/:id`
- Status update: `PATCH /api/admin/support/tickets/:id/status`
- Priority update: `PATCH /api/admin/support/tickets/:id/priority`
- Reply: `POST /api/admin/support/tickets/:id/messages`

## Admin Console Usage
- Open Admin Command Center and switch to Support tab.
- Use filters for search/status/date.
- Open ticket detail to inspect thread.
- Use status/priority controls for workflow progression.
- Send admin replies from detail panel.

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
