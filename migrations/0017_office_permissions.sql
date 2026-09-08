alter table profiles add column access_admin boolean not null default false;
update profiles set access_admin=true where role='gerente';
alter table profiles add column office_owner_ids text[] not null default '{}';
