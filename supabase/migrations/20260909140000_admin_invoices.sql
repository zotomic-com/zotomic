-- Admin invoicing module: manual invoices, free-form recipients, line items.
-- Extends the existing `invoices` table (subscription billing keeps working).

alter table invoices
  add column if not exists kind            text not null default 'subscription',
  add column if not exists recipient_name  text,
  add column if not exists recipient_email text,
  add column if not exists notes           text,
  add column if not exists issued_on       date not null default current_date,
  add column if not exists sent_at         timestamptz,
  add column if not exists created_by      uuid references users(id) on delete set null;

-- manual / free-form invoices carry no subscription payment reference and may
-- not be tied to a registered business
alter table invoices alter column payment_reference drop not null;
alter table invoices alter column business_id      drop not null;

-- allow a 'draft' status alongside open / paid / void
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft','open','paid','void'));

create table if not exists invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on invoice_line_items(invoice_id);

alter table invoice_line_items enable row level security;
drop policy if exists invoice_line_items_tenant on invoice_line_items;
create policy invoice_line_items_tenant on invoice_line_items
  using (exists (
    select 1 from invoices i
    where i.id = invoice_line_items.invoice_id
      and i.business_id = app.current_business_id()
  ));
