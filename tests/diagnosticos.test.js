// Diagnósticos versionados (DX-AAAA-0001), valor do caso somado, CRM automático e avanço de fase.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
process.env.APP_BASE_URL = 'https://reversa.argusprime.com.br';
process.env.REVERSA_USERS = 'andre:senha-legada-1';
process.env.LEGACY_AUTH_UNTIL = '2099-12-31';
const origError = console.error; console.error = () => {};

let sql; let api; let cookie; let orgId;
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);
const CNPJ = '11.222.333/0001-81';
const credito = (pis, cofins) => ({ id: 'T001', nome: 'Tese', natureza: 'credito', itens: 3, total: { pis, cofins }, totalNoPrazo: { pis, cofins } });
const salvar = (extra = {}) => v1('analyses', { method: 'POST', cookie, body: { taxpayer: { cnpj: CNPJ, legalName: 'GTW' }, periodStart: '2021-01', periodEnd: '2025-12', engineVersion: '1', files: 3, teses: [credito(10000, 40000)], ...extra } });

test.before(async () => {
  const d = await createDb(); sql = d.sql;
  freshRequire('lib/db').setSqlForTests(sql);
  orgId = (await sql`select id from organizations limit 1`)[0].id;
  const hash = await bcrypt.hash('Senha-forte-123', 4);
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values ('a@x.com','a@x.com','Ana',${hash},'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, 'admin', 'active')`;
  api = freshRequire('api/v1/[...route]');
  const H = { login: freshRequire('api/login') };
  cookie = cookieFrom(await call(H.login, { method: 'POST', body: { usuario: 'a@x.com', senha: 'Senha-forte-123' } }));
});
test.after(() => { console.error = origError; });

test('primeiro diagnóstico: código DX, v1, CRM e pendência cadastral', async () => {
  const r = await salvar(); assert.equal(r.statusCode, 201, r.body);
  const b = J(r);
  assert.match(b.diagnosticCode, /^DX-\d{4}-\d{4}$/); assert.equal(b.versao, 1); assert.equal(b.tipo, 'pis_cofins');
  assert.deepEqual(b.pendencias, ['contato']);
  const ag = await sql`select subject, meta from crm_activities where type = 'agent'`; assert.equal(ag.length, 1); assert.match(ag[0].subject, /DX-/);
  const tk = await sql`select subject, assignee_user_id from crm_activities where type = 'task' and meta->>'pendencia' = 'true'`;
  assert.equal(tk.length, 1); assert.ok(tk[0].assignee_user_id);
  const c = (await sql`select title, estimated_value, commercial_stage from tax_cases`)[0];
  assert.equal(c.title, 'Diagnóstico — GTW'); assert.equal(Number(c.estimated_value), 500); assert.equal(c.commercial_stage, 'a_apresentar');
});

test('novo diagnóstico do mesmo tipo vira v2 e substitui a v1; sem duplicar pendência', async () => {
  const b = J(await salvar({ teses: [credito(20000, 0)] }));
  assert.equal(b.versao, 2);
  const rows = await sql`select versao, status from diagnostics order by versao`;
  assert.deepEqual(rows.map((x) => x.status), ['substituido', 'vigente']);
  assert.equal((await sql`select count(*)::int n from crm_activities where type = 'task' and meta->>'pendencia' = 'true'`)[0].n, 1);
  assert.equal(Number((await sql`select estimated_value from tax_cases`)[0].estimated_value), 200);
});

test('previdenciário soma ao total do cliente e tem versão própria', async () => {
  const r = await salvar({ tipo: 'previdenciario', teses: [{ id: 'T060', nome: 'Aviso prévio', natureza: 'credito', itens: 2, valorCentavos: 30000, valorNoPrazoCentavos: 25000 }] });
  assert.equal(r.statusCode, 201, r.body);
  const b = J(r); assert.equal(b.tipo, 'previdenciario'); assert.equal(b.versao, 1);
  assert.equal(Number((await sql`select estimated_value from tax_cases`)[0].estimated_value), 450);
  const tp = (await sql`select id from taxpayers`)[0].id;
  const l = J(await v1(`taxpayers/${tp}/diagnostics`, { cookie })).diagnostics;
  assert.equal(l.length, 3); assert.equal(l.filter((x) => x.status === 'vigente').length, 2);
});

test('gerar link do contrato leva o caso a "aguardando autorização"', async () => {
  const caseId = (await sql`select id from tax_cases`)[0].id;
  const r = await v1(`cases/${caseId}/authorizations`, { method: 'POST', cookie, body: { periodStart: '2021-01', periodEnd: '2025-12', theses: ['T004'], values: { T004: 1000 } } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal((await sql`select commercial_stage from tax_cases`)[0].commercial_stage, 'aguardando_autorizacao');
  assert.equal((await sql`select count(*)::int n from audit_events where event_type = 'case.stage_changed'`)[0].n, 1);
});

test('gerar de novo o mesmo resultado não cria versão nova (repetido)', async () => {
  const antes = (await sql`select count(*)::int n from diagnostics`)[0].n;
  const r = await salvar({ teses: [credito(20000, 0)] }); assert.equal(r.statusCode, 201, r.body);
  const b = J(r); assert.equal(b.repetido, true); assert.equal(b.versao, 2);
  assert.equal((await sql`select count(*)::int n from diagnostics`)[0].n, antes);
});

test('responsável informado pelo parceiro vira contato principal e zera a pendência; reenvio só completa vazios', async () => {
  const r = await salvar({ teses: [credito(30000, 0)], contato: { nome: 'Carla Souza', cargo: 'Controller', email: 'Carla@Cliente.com.br', telefone: '' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.deepEqual(J(r).pendencias, ['telefone']);
  let c = (await sql`select name, role, email, phone, is_primary from crm_contacts where name = 'Carla Souza'`);
  assert.equal(c.length, 1); assert.equal(c[0].email, 'carla@cliente.com.br'); assert.equal(c[0].is_primary, true); assert.equal(c[0].role, 'Controller');
  const r2 = await salvar({ teses: [credito(40000, 0)], contato: { nome: 'Carla Souza', cargo: 'Outro cargo', email: 'carla@cliente.com.br', telefone: '48999990000' } });
  assert.deepEqual(J(r2).pendencias, []);
  c = await sql`select role, phone from crm_contacts where name = 'Carla Souza'`;
  assert.equal(c.length, 1); assert.equal(c[0].role, 'Controller'); assert.equal(c[0].phone, '48999990000');
});
