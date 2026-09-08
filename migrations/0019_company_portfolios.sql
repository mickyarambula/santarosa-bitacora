-- Commercial portfolio and service responsibility are independent. Preserve existing portfolios.
alter table producers add column portfolio_kind text not null default 'comisionista' check (portfolio_kind in ('comisionista','empresa','pendiente'));
alter table producers alter column owner_user_id drop not null;
alter table producers add constraint producer_portfolio_owner check ((portfolio_kind='comisionista' and owner_user_id is not null) or (portfolio_kind<>'comisionista' and owner_user_id is null));
alter table producers add column attention_user_id text;
alter table producers add column captured_by text;
alter table producers add column intake_channel text check (intake_channel in ('oficina','campo','llamada','otro'));
update producers p set attention_user_id=owner_user_id,captured_by=(select a.user_id from activity a where a.producer_id=p.id and a.kind='alta' order by a.created_at,a.id limit 1);
alter table producer_groups alter column owner_user_id drop not null;
alter table producer_groups add column portfolio_kind text not null default 'comisionista' check (portfolio_kind in ('comisionista','empresa','pendiente'));
alter table visits alter column owner_user_id drop not null;
create index producers_attention_idx on producers(cycle,attention_user_id) where archived_at is null;
