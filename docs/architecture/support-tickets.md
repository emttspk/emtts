# Support Tickets Architecture

## Purpose
Support tickets provide customer-to-admin issue handling with structured status tracking, threaded replies, attachment support, and audit logging.

## Data Model
Prisma models:
- `SupportTicket`
- `SupportTicketMessage`
- `SupportTicketAttachment`
- `SupportTicketAuditLog`
- `SupportTicketNotification`

Model behavior:
- `SupportTicket` stores ownership (`userId`), lifecycle (`status`, `priority`, `category`), subject, and SLA timestamps.
- `SupportTicket` also stores retention fields (`isPreserved`, `deleteAfter`) for safe cleanup eligibility.
- `SupportTicketMessage` stores thread messages with `authorRole` (`USER`/`ADMIN`).
- `SupportTicketAttachment` stores metadata and object key only.
- `SupportTicketAuditLog` stores sensitive workflow mutations (`status_changed`, `priority_changed`, `admin_reply`, etc.).
- `SupportTicketNotification` stores persisted customer/admin support notifications with unread state.

## API Surface
Customer routes:
- `POST /api/support/tickets`
- `GET /api/support/tickets`
- `GET /api/support/tickets/:id`
- `POST /api/support/tickets/:id/messages`
- `POST /api/support/tickets/:id/attachments`
- `GET /api/support/tickets/:ticketId/attachments/:attachmentId/download`
- `GET /api/support/notifications`
- `POST /api/support/notifications/read`

Admin routes:
- `GET /api/admin/support/tickets`
- `GET /api/admin/support/summary`
- `GET /api/admin/support/tickets/:id`
- `PATCH /api/admin/support/tickets/:id/status`
- `PATCH /api/admin/support/tickets/:id/priority`
- `PATCH /api/admin/support/tickets/:id/preserve`
- `POST /api/admin/support/tickets/:id/messages`
- `GET /api/admin/support/notifications`
- `POST /api/admin/support/notifications/read`

## Authorization and Ownership
- Customer routes are guarded by `requireAuth` and enforce ticket ownership.
- Admin routes are guarded by `requireAuth + requireAdmin`.
- Attachment download route allows ticket owner or admin only.

## Attachment Storage
- Attachments are stored in Cloudflare R2 under `support-tickets/` object scope.
- Storage is R2-only for permanent support attachments.
- No local permanent support-attachment storage is used.
- Database stores `objectKey` and metadata; binary payload is not stored in PostgreSQL.
- Create-ticket flow can upload attachments immediately after ticket creation by reusing the same support attachment API.
- If ticket creation succeeds but upload fails, ticket creation remains successful and the UI warns the user.
- Attachment limits are enforced at both API and frontend boundaries: max 5 files per upload and max 10 MB per file.

## Download Behavior
- Download API returns signed URL payload (`url`, expiry).
- Signed URLs are generated server-side from R2 provider.
- URL issuance remains auth-protected before link generation.

## Notification Behavior
- Customer notifications are created for admin replies and admin status changes, including resolved/closed updates.
- Admin notifications are created for new customer tickets, customer replies, and high/urgent open tickets.
- Notifications are persisted in PostgreSQL, not browser-only local state.
- Bell UI displays unread count and supports single-read and mark-all-read flows.

## Retention and Preserve Behavior
- Default support retention window is controlled by `SUPPORT_TICKET_RETENTION_DAYS` and defaults to 90 days.
- On close:
	- `isPreserved=false` schedules `deleteAfter` as close time + retention days.
	- `isPreserved=true` clears `deleteAfter`.
- Preserve toggle on closed tickets updates eligibility immediately:
	- enabling preserve clears `deleteAfter`
	- disabling preserve sets `deleteAfter` from current time + retention days.
- Cleanup eligibility is limited to `CLOSED`, `isPreserved=false`, `deleteAfter <= now`.
- Cleanup path deletes R2 support objects first, then deletes the ticket record (DB cascades messages, attachments, audit logs, and notifications).

## Admin UI Integration
- Support tab is integrated into `AdminCommandCenter`.
- Admin can list, inspect detail threads, update status, update priority, and post replies.
- Summary cards expose open/pending/resolved/overdue counts.
- Admin notification clicks can deep-link into the Support tab and open the related ticket.
- Support tab also exposes ticket/storage metrics: total tickets, closed tickets, attachment count, and total R2 storage MB.
- Support attachment rows expose protected View and Download actions.
- Support panel layout is constrained with truncation and overflow guards to avoid horizontal cut-off.

## Customer UI Integration
- Create ticket modal supports attachments before submit.
- Closed tickets hide customer reply/upload actions and instruct the user to open a new ticket.
- Public support navigation routes logged-in users to `/support` and logged-out users to login first.
- Customer attachment rows expose both View and Download actions through protected signed URLs.
- Public footer no longer exposes support email and guides users to support-ticket routes.

## Audit Behavior
Audit entries are written for key actions:
- Ticket creation (`ticket_created`)
- User reply (`user_reply`)
- Attachment upload (`attachment_uploaded`)
- Admin status change (`status_changed`)
- Admin priority change (`priority_changed`)
- Admin reply (`admin_reply`)

## Migration Note
Local environments with historical schema drift may require non-destructive baseline alignment (`prisma migrate resolve --applied`) before new migrations can be created or applied safely.
