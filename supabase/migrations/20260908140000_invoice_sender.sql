-- Phase 9C — paid stores can set the address their customer invoices reply to.
-- (Item 5. Free stores use the admin-managed platform address; see
--  platform_settings key `invoice_from_email`, default invoice@zotomic.com.)

alter table businesses
  add column if not exists invoice_from_email text;

comment on column businesses.invoice_from_email is
  'Reply-To for customer invoice emails on paid plans. Envelope From stays a Zotomic address.';
