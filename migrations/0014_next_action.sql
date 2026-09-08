-- A pending action belongs to the producer's current portfolio; history lives in crm_audit.
alter table producers add column if not exists next_action text;
alter table producers add column if not exists next_action_at timestamptz;
alter table producers add column if not exists next_action_version text not null default '';
alter table producers add constraint producers_next_action_pair check ((next_action is null) = (next_action_at is null));
create index if not exists producers_next_action_idx on producers(cycle, next_action_at) where next_action is not null;
