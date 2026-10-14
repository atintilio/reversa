-- 008 — Visão do todo: o master pode conceder a membros da plataforma (Argus Prime) acesso ao painel Master.
-- Somente expansão: nenhuma coluna ou tabela é removida.
alter table organization_members add column if not exists master boolean not null default false;
