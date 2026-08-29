-- ════════════════════════════════════════════════════════════════════════════
-- BILLING — manual bKash confirmation model + lock state machine.
--
-- States (subscriptions.status):
--   active     — paid, within period
--   grace      — period ended, 0–7 day grace
--   soft_lock  — day 8+ : dashboard read-only, NO report generation,
--                storefront STAYS LIVE
--   hard_lock  — day 30+: storefront offline, dashboard = billing screen only
--   cancelled  — owner cancelled
--
-- Free plan never locks. Reactivation is instant when an admin marks an
-- invoice paid (handled in app code, not here).
-- ════════════════════════════════════════════════════════════════════════════

alter table subscriptions
  add column if not exists grace_started_on date,
  add column if not exists last_reminder_on  date;

-- Advance one subscription's lifecycle. Returns the (possibly new) status.
create or replace function app.tick_subscription(p_sub subscriptions)
returns text
language plpgsql
as $$
declare
  today date := current_date;
  days_over integer;
  new_status text := p_sub.status;
begin
  if p_sub.plan = 'free' or p_sub.status = 'cancelled' then
    return p_sub.status;
  end if;

  if p_sub.current_period_end is null then
    return p_sub.status;
  end if;

  if today <= p_sub.current_period_end then
    return 'active';
  end if;

  days_over := today - p_sub.current_period_end;

  if days_over <= 7 then
    new_status := 'grace';
  elsif days_over <= 30 then
    new_status := 'soft_lock';
  else
    new_status := 'hard_lock';
  end if;

  update subscriptions
     set status = new_status,
         grace_started_on = coalesce(grace_started_on, p_sub.current_period_end + 1),
         updated_at = now()
   where id = p_sub.id;

  return new_status;
end $$;

-- Run the whole billing sweep: generate invoices for periods ending soon,
-- advance lock states. Reminder emails are sent by the app's /api/cron/billing.
create or replace function app.billing_sweep()
returns void
language plpgsql
as $$
declare s subscriptions;
begin
  for s in select * from subscriptions where plan <> 'free' and status <> 'cancelled' loop
    -- open invoice for a period ending within 3 days, if none exists yet
    if s.current_period_end is not null
       and s.current_period_end - current_date <= 3
       and not exists (
         select 1 from invoices
         where subscription_id = s.id and status = 'open'
           and due_date >= s.current_period_end
       )
    then
      insert into invoices (business_id, subscription_id, invoice_number, amount, currency,
                            status, due_date, payment_reference)
      values (
        s.business_id, s.id,
        'ZINV-' || to_char(current_date, 'YYMM') || '-' || substr(s.business_id::text, 1, 6),
        s.price, s.currency, 'open',
        s.current_period_end,
        'ZB-' || upper(substr(md5(s.id::text || s.current_period_end::text), 1, 8))
      )
      on conflict (invoice_number) do nothing;
    end if;

    perform app.tick_subscription(s);
  end loop;
end $$;

-- schedule the billing sweep + reminder trigger daily at 02:00 UTC
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function app.trigger_billing()
returns void
language plpgsql
security definer
as $$
declare base_url text; secret text;
begin
  perform app.billing_sweep();
  select value into base_url from app.config where key = 'app_base_url';
  select value into secret   from app.config where key = 'cron_secret';
  if base_url is null or secret is null then return; end if;
  perform net.http_post(
    url     := base_url || '/api/cron/billing',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end $$;

select cron.schedule('billing-sweep', '0 2 * * *', $$select app.trigger_billing()$$);
