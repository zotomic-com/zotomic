-- Admin-editable "Topic" dropdown options on the /contact form.
create table if not exists platform_contact_topics (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into platform_contact_topics (label, sort_order)
select * from (values
  ('General question', 0),
  ('Sales / plans', 1),
  ('Support', 2),
  ('Partnership', 3),
  ('Data deletion', 4)
) as v(label, sort_order)
where not exists (select 1 from platform_contact_topics);
