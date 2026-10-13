-- 007 — Parceiros: cada parceiro é uma organização isolada; a organização mais antiga é a plataforma (Argus Prime).
-- Somente expansão: nenhuma coluna ou tabela é removida.
alter table organizations add column if not exists kind varchar(20) not null default 'interna'
  check (kind in ('plataforma', 'interna', 'parceiro'));

alter table organizations add column if not exists cnpj varchar(14);

alter table organizations add column if not exists commission_pct numeric(5,2) not null default 0
  check (commission_pct >= 0 and commission_pct <= 100);

alter table organizations add column if not exists responsible_name varchar(180);

alter table organizations add column if not exists responsible_email varchar(320);

alter table organizations add column if not exists notes text;

-- A organização padrão (a primeira criada) é a plataforma.
update organizations set kind = 'plataforma'
where id = (select id from organizations order by created_at, id limit 1)
  and not exists (select 1 from organizations where kind = 'plataforma');

create index if not exists taxpayers_cnpj_idx on taxpayers (cnpj_normalized);
