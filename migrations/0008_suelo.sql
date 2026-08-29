-- Análisis de suelo: requisito del ciclo 26-27 en habilitación y cobertura.

insert into documents (id, producer_id, doc_type, status)
select
  'doc_suelo_' || p.id,
  p.id,
  'analisis_suelo',
  'pendiente'
from producers p
where p.scheme in ('financiamiento', 'cobertura_fira')
  and not exists (
    select 1 from documents d
    where d.producer_id = p.id and d.doc_type = 'analisis_suelo'
  );
