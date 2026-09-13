-- Split per-TLD commission into first-year vs renewal (real registrars price
-- these very differently — e.g. .shop registers for $1.99 but renews near
-- $32). No existing rows carry data forward incorrectly here since the table
-- was empty at migration time.
alter table domain_pricing_rules rename column commission_percent to commission_percent_first_year;
alter table domain_pricing_rules add column if not exists commission_percent_renewal numeric(6, 2);
