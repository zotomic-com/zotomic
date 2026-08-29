-- Capture why an order was cancelled (for the assistant + reporting).
alter table orders
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at  timestamptz;
