-- Invoice / billing details shown on store-owner invoices.
alter table businesses
  add column if not exists invoice_address text,
  add column if not exists contact_email   text,
  add column if not exists contact_phone   text;
