-- Identificador fiscal canônico para integrações. CNPJ permanece compatível.
alter table taxpayers add column if not exists tax_id varchar(40);
alter table taxpayers add column if not exists tax_id_type varchar(20) not null default 'CNPJ';
update taxpayers set tax_id = cnpj_normalized where tax_id is null;
create index if not exists taxpayers_org_tax_id_idx on taxpayers (organization_id, tax_id);
