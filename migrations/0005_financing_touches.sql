-- Monto de habilitación por hectárea + bitácora de contactos (llamada, WhatsApp, etc.)

alter table producers
  add column if not exists financing_per_ha numeric(14,2) not null default 0;

alter table producers
  add column if not exists email text;

alter table producers
  add column if not exists last_touch_at timestamptz;

alter table producers
  add column if not exists last_touch_channel text;

update producers
set financing_per_ha = round(financing_mxn / hectares, 2)
where hectares > 0
  and financing_mxn > 0
  and financing_per_ha = 0;

create table if not exists touches (
  id            text primary key,
  producer_id   text not null references producers(id) on delete cascade,
  owner_user_id text not null,
  channel       text not null,
  outcome       text,
  summary       text,
  happened_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists touches_producer_idx on touches (producer_id, happened_at desc);
