-- Candado de altas + estado de cuenta (activo / bloqueado)

alter table profiles
  add column if not exists status text not null default 'activo';

create table if not exists app_lock (
  id         text primary key,
  enabled    boolean not null default false,
  code_hash  text,
  updated_at timestamptz not null default now()
);

insert into app_lock (id, enabled)
values ('default', false)
on conflict (id) do nothing;

create table if not exists revoked_users (
  user_id    text primary key,
  revoked_by text,
  reason     text,
  created_at timestamptz not null default now()
);
