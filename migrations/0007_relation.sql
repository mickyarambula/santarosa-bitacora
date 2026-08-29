-- Relación con el productor: nuevo, recurrente o recuperación (win-back)

alter table producers
  add column if not exists relation text not null default 'nuevo';

update producers
set relation = case when is_new then 'nuevo' else 'recurrente' end
where relation = 'nuevo' and is_new = false;
