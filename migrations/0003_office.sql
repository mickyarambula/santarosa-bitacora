-- Personas de oficina (director, socios, papá): se les invita por WhatsApp.
-- No necesitan cuenta. El registro queda en office_pings y en la bitácora del productor.

create table if not exists office_people (
  id          text primary key,
  name        text not null,
  title       text not null default '',
  phone       text not null,
  for_invite  boolean not null default true,
  for_aviso   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists office_pings (
  id           text primary key,
  person_id    text not null,
  person_name  text not null,
  kind         text not null,
  producer_id  text,
  message      text not null,
  user_id      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists office_pings_when_idx on office_pings (created_at desc);
