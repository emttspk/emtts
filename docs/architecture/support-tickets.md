# Support Tickets Architecture

## Purpose
Support tickets provide customer-to-admin issue handling with structured status tracking, threaded replies, attachment support, and audit logging.

## Data Model
Prisma models:
- `SupportTicket`
- `SupportTicketMessage`
- `SupportTicketAttachment`
- `SupportTicketAuditLog`

Model behavior:
- `SupportTicket` stores ownership (`userId`), lifecycle (`status`, `priority`, `category`), subject, and SLA timestamps.
- `SupportTicketMessage` stores thread messages with `authorRole` (`USER`/`ADMIN`).
- `SupportTicketAttachment` stores metadata and object key only.
- `SupportTicketAuditLog` stores sensitive workflow mutations (`status_changed`, `priority_changed`, `admin_reply`, etc.).

## API Surface
Customer routes:
- `POST /api/support/tickets`
- `GET /api/support/tickets`
- `GET /api/support/tickets/:id`
- `POST /api/support/tickets/:id/messages`
- `POST /api/support/tickets/:id/attachments`
- `GET /api/support/tickets/:ticketId/attachments/:attachmentId/download`

Admin routes:
- `GET /api/admin/support/tickets`
- `GET /api/admin/support/summary`
- `GET /api/admin/support/tickets/:id`
- `PATCH /api/admin/support/tickets/:id/status`
- `PATCH /api/admin/support/tickets/:id/priority`
- `POST /api/admin/support/tickets/:id/messages`

## Authorization and Ownership
- Customer routes are guarded by `requireAuth` and enforce ticket ownership.
- Admin routes are guarded by `requireAuth + requireAdmin`.
- Attachment download route allows ticket owner or admin only.

## Attachment Storage
- Attachments are stored in Cloudflare R2 under `support-tickets/` object scope.
- Storage is R2-only for permanent support attachments.
- No local permanent support-attachment storage is used.
- Database stores `objectKey` and metadata; binary payload is not stored in PostgreSQL.

## Download Behavior
- Download API returns signed URL payload (`url`, expiry).
- Signed URLs are generated server-side from R2 provider.
- URL issuance remains auth-protected before link generation.

## Admin UI Integration
- Support tab is integrated into `AdminCommandCenter`.
- Admin can list, inspect detail threads, update status, update priority, and post replies.
- Summary cards expose open/pending/resolved/overdue counts.

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
