create table weekly_meetings (
 id text primary key,
 cycle text not null,
 week_start date not null,
 notes text not null,
 snapshot jsonb not null,
 closed_by text not null,
 closed_at timestamptz not null default now(),
 unique(cycle,week_start)
);
create table broadcast_batches (
 id text primary key,
 author_id text not null,
 stage text,
 body text not null,
 created_at timestamptz not null default now()
);
create table broadcast_recipients (
 batch_id text not null references broadcast_batches(id) on delete cascade,
 communication_id text not null unique references producer_communications(id) on delete cascade,
 producer_name text not null,
 primary key(batch_id,communication_id)
);
create index broadcast_author_idx on broadcast_batches(author_id,created_at desc);
create index activity_week_idx on activity(created_at,kind);
create index touches_week_idx on touches(happened_at);
