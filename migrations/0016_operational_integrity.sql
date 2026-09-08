alter table producers add column archived_at timestamptz;
alter table producers add column archived_by text;
alter table producers add column archive_reason text;
alter table producers add column stage_entered_at timestamptz;
update producers p set stage_entered_at=coalesce((select max(a.created_at) from activity a where a.producer_id=p.id and a.kind='etapa'),p.created_at);
alter table producers alter column stage_entered_at set default now();
create function track_producer_stage() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_entered_at=now(); end if;
  return new;
end $$;
create trigger producer_stage_clock before update on producers for each row execute function track_producer_stage();
alter table visits add column outcome text;
alter table visits add column completed_at timestamptz;
alter table touches add column visit_id text;
create unique index touches_visit_once on touches(visit_id) where visit_id is not null;
alter table office_pings add column confirmed_at timestamptz;
-- Existing entries predate explicit confirmation; leave their confirmation unknown.
alter table producers add column close_kind text check(close_kind is null or close_kind in ('ganado','perdido','cancelado'));
alter table producers add column close_reason text;
