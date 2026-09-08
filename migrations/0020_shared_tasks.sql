create table producer_tasks (
 id text primary key,
 producer_id text not null references producers(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 500),
 assignee_id text not null,
 due_at timestamptz not null,
 status text not null default 'pendiente' check(status in ('pendiente','esperando','atendida','cancelada')),
 result text,
 created_by text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 version text not null,
 legacy_primary boolean not null default false,
 visit_id text references visits(id) on delete set null
);
create unique index task_primary_once on producer_tasks(producer_id) where legacy_primary;
create unique index task_visit_once on producer_tasks(visit_id) where visit_id is not null;
create index task_due_idx on producer_tasks(status,assignee_id,due_at,id);
insert into producer_tasks(id,producer_id,title,assignee_id,due_at,created_by,version,legacy_primary)
select 'legacy-'||id,id,next_action,coalesce(attention_user_id,owner_user_id),next_action_at,coalesce(captured_by,owner_user_id),next_action_version,true from producers where next_action is not null;
