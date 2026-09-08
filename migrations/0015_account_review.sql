-- Applies to future suspected duplicates only; existing accounts are not changed.
alter table profiles add column if not exists duplicate_review boolean not null default false;
