-- 017 — Reversa Gov: motor de cálculo (parâmetros atualizáveis sem deploy e histórico auditável de cálculos)
create table if not exists gov_parametros (
  id uuid primary key default gen_random_uuid(),
  chave varchar(60) not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  valor jsonb not null,
  fonte text,
  created_at timestamptz not null default now(),
  constraint gov_parametros_uq unique (chave, vigencia_inicio)
);
create index if not exists gov_parametros_chave_idx on gov_parametros (chave, vigencia_inicio desc);
create table if not exists gov_calculos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  ibge_code char(7),
  tipo varchar(60) not null,
  entrada jsonb not null,
  resultado jsonb not null,
  versao_motor varchar(20) not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists gov_calculos_org_idx on gov_calculos (organization_id, ibge_code, tipo, created_at desc);
insert into gov_parametros (chave, vigencia_inicio, vigencia_fim, valor, fonte) values
('irrf','2026-01-01','2026-12-31','{"vigenciaInicio":"2026-01-01","vigenciaFim":"2026-12-31","faixas":[{"ate":2428.8,"aliquota":0,"deduzir":0},{"ate":2826.65,"aliquota":0.075,"deduzir":182.16},{"ate":3751.05,"aliquota":0.15,"deduzir":394.16},{"ate":4664.68,"aliquota":0.225,"deduzir":675.49},{"ate":null,"aliquota":0.275,"deduzir":908.73}],"deducaoDependente":189.59,"descontoSimplificado":607.2,"redutor":{"isencaoAte":5000,"reducaoAte":7350,"a":978.62,"b":0.133145}}'::jsonb,'Tabela IRRF mensal 2026 e redutor da Lei 15.270/2025 (conferir com a Receita Federal)'),
('inss','2026-01-01','2026-12-31','{"vigenciaInicio":"2026-01-01","vigenciaFim":"2026-12-31","faixas":[{"ate":1621,"aliquota":0.075},{"ate":2902.84,"aliquota":0.09},{"ate":4354.27,"aliquota":0.12},{"ate":8475.55,"aliquota":0.14}],"tetoRGPS":8475.55,"salarioMinimo":1621}'::jsonb,'Tabela INSS 2026: teto R$ 8.475,55 e salário mínimo R$ 1.621,00 (conferir no Portal Gov.br)'),
('previdenciario','2026-01-01',null,'{"vigenciaInicio":"2026-01-01","vigenciaFim":null,"aliquotaServidor":0.14,"aliquotaPatronal":0.22,"metaAtuarial":0.0545,"crescimentoSalarial":0.01,"crpValidadeDias":180,"limiteAlertaCrpDias":30}'::jsonb,'Parâmetros de referência; substituir pela meta atuarial e alíquotas do RPPS do município'),
('retencao_fornecedor','2026-01-01',null,'{"bens":0.012,"servicos":0.048}'::jsonb,'IN RFB 1.234/2012, Anexo I: apenas bens (1,2%) e serviços em geral (4,8%) confirmados')
on conflict (chave, vigencia_inicio) do nothing;
