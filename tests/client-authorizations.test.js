const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');
const { hashSession } = require('../lib/security');
process.env.SESSION_SECRET = 'approval-test-secret';
process.env.APP_BASE_URL = 'https://reversa.test';
process.env.LEGACY_AUTH_UNTIL = 'off';
let sql, db, api, staff, viewer, foreign, caseId, org;
const opts = { periodStart: '2021-01', periodEnd: '2025-12', theses: ['T004', 'T009', 'T007'] };
const json = r => JSON.parse(r.body);
function v1(path, opts = {}) { return call(api, { ...opts, url: '/api/v1/' + path }); }
function pub(token, method = 'GET', body) { return v1('client-approval', { method, body, headers: { 'x-approval-token': token, origin: process.env.APP_BASE_URL } }); }
async function link(extra = {}) { const r = await v1(`cases/${caseId}/authorizations`, { cookie: staff, method: 'POST', body: { ...opts, ...extra } }); assert.equal(r.statusCode, 201, r.body); const j = json(r); return { ...j, token: j.url.split('#')[1] }; }
async function payload(token, ids = ['T004', 'T009', 'T007']) { return { selectedTheses: ids, snapshotHash: json(await pub(token)).snapshotHash, acceptedTerms: true, name: 'Representante Cliente', email: 'Cliente@Exemplo.com', role: 'Sócio-administrador' }; }
test.before(async () => {
  ({ sql, db } = await createDb()); freshRequire('lib/db').setSqlForTests(sql); api = freshRequire('api/v1/[...route]');
  org = (await sql`select id from organizations limit 1`)[0].id;
  const other = (await sql`insert into organizations (name) values ('Outra') returning id`)[0].id;
  async function login(email, organization, role) {
    const hash = await bcrypt.hash('password-for-test', 4);
    const id = (await sql`insert into users (email,email_normalized,name,password_hash,status) values (${email},${email},'Equipe',${hash},'active') returning id`)[0].id;
    await sql`insert into organization_members (organization_id,user_id,role,status) values (${organization},${id},${role},'active')`;
    return cookieFrom(await call(freshRequire('api/login'), { method: 'POST', body: { usuario: email, senha: 'password-for-test' } }));
  }
  staff = await login('staff@test.com', org, 'admin'); viewer = await login('viewer@test.com', org, 'viewer'); foreign = await login('other@test.com', other, 'admin');
  const r = await v1('taxpayers', { cookie: staff, method: 'POST', body: { cnpj: '11222333000181', legalName: 'Empresa Teste', taxRegime: 'Lucro Real' } });
  assert.equal(r.statusCode, 201, r.body); caseId = json(r).caseId;
});
test.after(async () => { await db.close(); });
test('links isolados; leitor/visitante não emitem; token somente hash e fragmento', async () => {
  assert.equal((await v1(`cases/${caseId}/authorizations`, { method: 'POST', body: opts })).statusCode, 401);
  assert.equal((await v1(`cases/${caseId}/authorizations`, { cookie: viewer, method: 'POST', body: opts })).statusCode, 403);
  assert.equal((await v1(`cases/${caseId}/authorizations`, { cookie: foreign, method: 'POST', body: opts })).statusCode, 404);
  const a = await link(); assert.match(a.url, /^https:\/\/reversa.test\/aprovacao.html#[A-Za-z0-9_-]{43}$/);
  const stored = (await sql`select token_hash,snapshot from client_authorizations where id = ${a.id}`)[0];
  assert.equal(stored.token_hash, hashSession(a.token)); assert.ok(!JSON.stringify(stored).includes(a.token));
  assert.equal(json(await pub(a.token)).snapshot.taxpayer.cnpj, '11222333000181');
  assert.deepEqual(json(await v1(`cases/${caseId}/authorizations`, { cookie: foreign })).authorizations, []);
});
test('cliente pode selecionar todas as cores sem mudar revisão ou valores do caso', async () => {
  const a = await link(), before = (await sql`select status,estimated_value,commercial_stage from tax_cases where id = ${caseId}`)[0];
  assert.deepEqual(json(await pub(a.token)).snapshot.theses.map(t => t.color), ['verde','amarelo','vermelho']);
  const p = await payload(a.token); const r = await pub(a.token, 'POST', p); assert.equal(r.statusCode, 200, r.body);
  const stored = (await sql`select selected_theses,representative_email,accepted_at from client_authorizations where id = ${a.id}`)[0];
  assert.deepEqual(stored.selected_theses, p.selectedTheses); assert.equal(stored.representative_email, 'cliente@exemplo.com'); assert.ok(stored.accepted_at);
  assert.deepEqual((await sql`select status,estimated_value,commercial_stage from tax_cases where id = ${caseId}`)[0], before);
  assert.equal((await pub(a.token, 'POST', { ...p, selectedTheses: ['T004'] })).statusCode, 409);
});
test('risco editável exige justificativa; snapshot mantém original, autor e fundamento', async () => {
  const bad = await v1(`cases/${caseId}/authorizations`, { cookie: staff, method: 'POST', body: { ...opts, risks: { T007: { color: 'verde' } } } });
  assert.equal(bad.statusCode, 400);
  const a = await link({ risks: { T007: { color: 'amarelo', reason: 'Revisão específica do enquadramento e período.' } } });
  const row = json(await pub(a.token)).snapshot.theses.find(t => t.id === 'T007');
  assert.equal(row.originalColor, 'vermelho'); assert.equal(row.color, 'amarelo'); assert.equal(row.riskEdit.by, 'Equipe'); assert.ok(row.legalBasis.includes('1.072.485'));
  const original = await link(); assert.equal(json(await pub(original.token)).snapshot.theses.find(t => t.id === 'T007').color, 'vermelho');
});
test('rejeita teses externas/duplicadas, documento adulterado e falta de consentimento', async () => {
  const a = await link(), p = await payload(a.token);
  for (const bad of [{ selectedTheses: ['T999'] }, { selectedTheses: ['T004','T004'] }, { selectedTheses: [] }, { acceptedTerms: false }, { name: '' }]) {
    assert.equal((await pub(a.token, 'POST', { ...p, ...bad })).statusCode, 400);
  }
  assert.equal((await pub(a.token, 'POST', { ...p, snapshotHash: 'fake' })).statusCode, 409);
  assert.equal((await v1('client-approval', { headers: { 'x-approval-token': a.token, origin: 'https://outro.test' } })).statusCode, 403);
  assert.equal((await pub('a'.repeat(43))).statusCode, 404);
});
test('aceite simultâneo grava uma única seleção; revogação e expiração bloqueiam acesso', async () => {
  const a = await link(), p = await payload(a.token);
  const results = await Promise.all([pub(a.token, 'POST', p), pub(a.token, 'POST', { ...p, selectedTheses: ['T009'] })]);
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200,409]);
  assert.equal((await v1(`client-authorizations/${a.id}`, { cookie: foreign, method: 'DELETE' })).statusCode, 404);
  assert.equal((await v1(`client-authorizations/${a.id}`, { cookie: staff, method: 'DELETE' })).statusCode, 200);
  assert.equal((await pub(a.token)).statusCode, 404);
  const expired = await link(); await sql`update client_authorizations set expires_at = now() - interval '1 minute' where id = ${expired.id}`;
  assert.equal((await pub(expired.token)).statusCode, 404);
});
