-- Grupos: varios nombres (familiares/amigos) de un mismo productor real.
-- Cada ficha sigue con su papelería; el grupo es para verlos como un todo.

create table if not exists producer_groups (
  id                   text primary key,
  name                 text not null,
  owner_user_id        text not null,
  comisionista_name    text not null,
  titular_producer_id  text,
  notes                text,
  cycle                text not null default '26-27',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists producer_groups_owner_idx on producer_groups (owner_user_id);
create index if not exists producer_groups_cycle_idx on producer_groups (cycle);

alter table producers
  add column if not exists group_id text;

alter table producers
  add column if not exists group_role text;

create index if not exists producers_group_idx on producers (group_id);
