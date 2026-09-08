-- Additive: keeps existing accounts, documents, visits and notices intact.
alter table profiles add column if not exists merged_into_user_id text;
alter table announcements add column if not exists archived_at timestamptz;
alter table announcements add column if not exists expires_at timestamptz;
alter table announcements add column if not exists updated_at timestamptz not null default now();
create table if not exists crm_audit (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_user_id text not null,
  actor_name text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_audit_entity_idx on crm_audit(entity_type, entity_id, created_at desc);
