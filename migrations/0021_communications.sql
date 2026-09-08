create table producer_communications (
 id text primary key,
 producer_id text not null references producers(id) on delete cascade,
 channel text not null check(channel in ('whatsapp','correo','llamada','oficina')),
 direction text not null check(direction in ('salida','entrada')),
 status text not null check(status in ('borrador','enviado_manual','recibido','fallo','cancelado')),
 destination text not null check(length(trim(destination)) between 1 and 254),
 body text not null check(length(trim(body)) between 1 and 5000),
 document_reference text,
 created_by text not null,
 confirmed_by text,
 created_at timestamptz not null default now(),
 happened_at timestamptz,
 result text,
 version text not null
);
create index communications_producer_idx on producer_communications(producer_id,created_at desc,id);
