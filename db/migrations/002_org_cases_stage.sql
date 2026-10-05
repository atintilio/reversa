-- 002 — P1-1: empresas/casos por organização, fase comercial e bootstrap da organização padrão.
-- Somente expansão (expand/contract): nenhuma coluna ou tabela é removida.

-- Fase comercial do caso (funil: a apresentar → apresentado → aguardando autorização → contrato).
-- É independente de tax_cases.status (estado técnico) e não equivale a crédito aprovado (RB-09).
alter table tax_cases add column if not exists commercial_stage varchar(40) not null default 'a_apresentar'
  check (commercial_stage in ('a_apresentar', 'apresentado', 'aguardando_autorizacao', 'contrato', 'perdido'));

alter table tax_cases add column if not exists taxpayer_id uuid references taxpayers(id);

create index if not exists tax_cases_taxpayer_idx on tax_cases (taxpayer_id);

-- Um CNPJ por organização.
create unique index if not exists taxpayers_org_cnpj_uq on taxpayers (organization_id, cnpj_normalized);

create index if not exists organization_members_user_idx on organization_members (user_id);

-- Organização padrão (Argus Prime) quando ainda não houver nenhuma.
insert into organizations (name)
select 'Argus Prime'
where not exists (select 1 from organizations);

-- Usuários ativos já existentes e sem vínculo passam a ser administradores da organização padrão.
-- Novos usuários entram somente por convite (POST /api/v1/members).
insert into organization_members (organization_id, user_id, role, status)
select (select id from organizations order by created_at, id limit 1), u.id, 'admin', 'active'
from users u
where u.status = 'active'
  and not exists (select 1 from organization_members m where m.user_id = u.id);
