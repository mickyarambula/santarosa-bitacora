-- Santa Rosa CRM — ciclo 26-27
-- Company-scoped rows: every table carries owner_user_id (the signed-in
-- capture owner). Gerentes may read the full book; comisionistas default to
-- their own rows. Never trust a client-supplied user id.

create table if not exists profiles (
  user_id      text primary key,
  display_name text not null,
  role         text not null default 'comisionista',
  phone        text,
  created_at   timestamptz not null default now()
);

create table if not exists producers (
  id                text primary key,
  owner_user_id     text not null,
  comisionista_name text not null,
  name              text not null,
  business_unit     text not null default 'parafinanciero',
  scheme            text not null default 'financiamiento',
  is_new            boolean not null default true,
  zone              text not null default 'Guasave',
  locality          text,
  crop              text not null default 'maiz_blanco',
  hectares          numeric(12,2) not null default 0,
  yield_ton_ha      numeric(8,2) not null default 0,
  volume_ton        numeric(12,2) not null default 0,
  financing_mxn     numeric(14,2) not null default 0,
  phone             text,
  stage             text not null default 'prospecto',
  blocker           text,
  notes             text,
  cycle             text not null default '26-27',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists producers_owner_idx on producers (owner_user_id);
create index if not exists producers_stage_idx on producers (stage);
create index if not exists producers_cycle_idx on producers (cycle);

create table if not exists documents (
  id          text primary key,
  producer_id text not null references producers(id) on delete cascade,
  doc_type    text not null,
  status      text not null default 'pendiente',
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists documents_producer_idx on documents (producer_id);

create table if not exists visits (
  id            text primary key,
  producer_id   text not null references producers(id) on delete cascade,
  owner_user_id text not null,
  scheduled_at  timestamptz not null,
  place         text,
  purpose       text,
  status        text not null default 'programada',
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists visits_when_idx on visits (scheduled_at);
create index if not exists visits_owner_idx on visits (owner_user_id);

create table if not exists activity (
  id          text primary key,
  producer_id text not null references producers(id) on delete cascade,
  user_id     text not null,
  kind        text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_producer_idx on activity (producer_id, created_at desc);
