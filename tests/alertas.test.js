// "Precisa de ação": cards parados, diagnóstico sem avanço, contrato não assinado e pendência vencida.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, freshRequire } = require('./helpers');

let sql; let alertas; let orgId; let userId; let tp; let caseId;
const DIA = 86400000;

test.before(async () => {
  const d = await createDb(); sql = d.sql;
  freshRequire('lib/db').setSqlForTests(sql);
  alertas = freshRequire('lib/alertas').alertas;
  orgId = (await sql`select id from organizations limit 1`)[0].id;
  userId = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('a@x.com','a@x.com','Ana','x','active') returning id`)[0].id;
  tp = (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized) values (${orgId}, 'Empresa X', '11222333000181', '11222333000181') returning id`)[0].id;
  caseId = (await sql`insert into tax_cases (organization_id, owner_user_id, title, taxpayer_id, commercial_stage, created_at, updated_at)
    values (${orgId}, ${userId}, 'Diag', ${tp}, 'a_apresentar', now() - interval '10 days', now() - interval '10 days') returning id`)[0].id;
});

test('card parado há 10 dias e diagnóstico sem avanço aparecem; card recente não', async () => {
  await sql`insert into diagnostics (organization_id, taxpayer_id, tax_case_id, code, tipo, versao, status, created_at) values (${orgId}, ${tp}, ${caseId}, 'DX-2026-0001', 'pis_cofins', 1, 'vigente', now() - interval '9 days')`;
  const a = await alertas(sql, {});
  const tipos = a.map((x) => x.tipo).sort();
  assert.deepEqual(tipos, ['card_parado', 'diagnostico_sem_avanco']);
  assert.ok(a.every((x) => x.cliente === 'Empresa X' && x.dias >= 9));
  await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, created_by) values (${orgId}, ${tp}, ${caseId}, 'call', 'Ligação', ${userId})`;
  const b = await alertas(sql, {});
  assert.deepEqual(b.map((x) => x.tipo), ['diagnostico_sem_avanco']);
});

test('contrato enviado e não assinado há 6 dias; assinado ou arquivado não alerta', async () => {
  await sql`update tax_cases set commercial_stage = 'aguardando_autorizacao' where id = ${caseId}`;
  await sql`insert into client_authorizations (organization_id, tax_case_id, created_by, token_hash, snapshot, snapshot_hash, expires_at, created_at)
            values (${orgId}, ${caseId}, ${userId}, 'h1', '{}'::jsonb, 's1', now() + interval '30 days', now() - interval '6 days')`;
  const a = await alertas(sql, {});
  assert.ok(a.some((x) => x.tipo === 'contrato_nao_assinado' && x.dias >= 6));
  await sql`update tax_cases set status = 'archived' where id = ${caseId}`;
  assert.equal((await alertas(sql, {})).filter((x) => x.cardId === caseId).length, 0);
  await sql`update tax_cases set status = 'draft' where id = ${caseId}`;
});

test('pendência de cadastro vencida e filtro por parceiro', async () => {
  await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, due_at, created_by, meta)
            values (${orgId}, ${tp}, ${caseId}, 'task', 'Completar cadastro: contato', now() - interval '2 days', ${userId}, '{"pendencia":true}'::jsonb)`;
  const a = await alertas(sql, { orgId });
  assert.ok(a.some((x) => x.tipo === 'pendencia_vencida' && x.dias >= 2));
  const outra = (await sql`insert into organizations (name, kind) values ('Outro', 'parceiro') returning id`)[0].id;
  assert.equal((await alertas(sql, { orgId: outra })).length, 0);
});
