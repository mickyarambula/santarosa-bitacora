-- Dictamen de rechazo (total o recorte de ha) + avisos de gerencia.

alter table producers
  add column if not exists rejection_kind text;

alter table producers
  add column if not exists rejection_reason text;

alter table producers
  add column if not exists rejection_notes text;

alter table producers
  add column if not exists hectares_requested numeric(12,2);

alter table producers
  add column if not exists rejected_at timestamptz;

alter table producers
  add column if not exists rejected_by text;

update producers
set hectares_requested = hectares
where hectares_requested is null;

create table if not exists announcements (
  id              text primary key,
  author_user_id  text not null,
  author_name     text not null,
  kind            text not null default 'equipo',
  stage           text,
  title           text not null default '',
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists announcements_when_idx on announcements (created_at desc);
