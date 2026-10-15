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
process.env.REVERSA_DEV_OTP = '1';
async function payload(token, opposed = []) {
  const v = json(await pub(token));
  const pv = json(await pub(token, 'POST', { action: 'previa', opposedTheses: opposed }));
  const c = json(await pub(token, 'POST', { action: 'codigo', email: 'Cliente@Exemplo.com', name: 'Representante Cliente' }));
  return { action: 'assinar', opposedTheses: opposed, snapshotHash: v.snapshotHash, contractHash: pv.contractHash, acceptedTerms: true,
    name: 'Representante Cliente', email: 'Cliente@Exemplo.com', role: 'Sócio-administrador', cpf: '529.982.247-25', code: c.devCode };
}
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
  assert.equal(json(await pub(a.token)).taxpayer.cnpj, '11222333000181');
  assert.deepEqual(json(await v1(`cases/${caseId}/authorizations`, { cookie: foreign })).authorizations, []);
});
test('cliente não vê cor, classificação nem valor; teses remotas ficam de fora', async () => {
  const a = await link({ values: { T004: 1000 } }), v = json(await pub(a.token));
  assert.deepEqual(v.theses.map(t => t.id), ['T004', 'T009']); // T007 é remota
  const txt = JSON.stringify(v); for (const k of ['color', 'verde', 'amarelo', 'vermelho', 'value', '1000']) assert.ok(!txt.includes(k), k);
  assert.equal(v.contract.fee, 25);
});
test('contrato: objeto só diz fiscal/tributário ou previdenciário; Argus Prime contratada; sem nome de tese', async () => {
  const a = await link({ theses: ['T001', 'T004'] });
  const obj = async (op) => json(await pub(a.token, 'POST', { action: 'previa', opposedTheses: op })).contract;
  const c = await obj([]), tudo = JSON.stringify(c);
  assert.match(c.clausulas[0][1][0], /natureza fiscal\/tributária e previdenciária/);
  assert.match((await obj(['T004'])).clausulas[0][1][0], /natureza fiscal\/tributária identificadas/);
  assert.match((await obj(['T001'])).clausulas[0][1][0], /natureza previdenciária identificadas/);
  assert.match(c.contratada, /^ARGUS PRIME, inscrita no CNPJ sob o nº 66\.279\.651\/0001-70/); assert.ok(!/RZ3|Ac Tintilio Neg/i.test(tudo)); assert.match(c.contratada, /Av\. Liberdade, 1000, sala 1005.*André Carlos Tintilio/); assert.ok(!/R\$ 150/.test(tudo));
  assert.match(tudo, /25% \(vinte e cinco por cento\)/);
  const nomes = json(await pub(a.token)).theses.map(t => t.name); nomes.forEach(n => assert.ok(!tudo.includes(n), n));
  const pdf = await pub(a.token, 'POST', { action: 'pdf' }); assert.equal(pdf.statusCode, 200); assert.equal(pdf.headers['content-type'], 'application/pdf');
});
test('assinatura com oposição, CPF e código; caso vai para Contrato; segunda assinatura bloqueada', async () => {
  const a = await link(), p = await payload(a.token, ['T009']);
  const r = await pub(a.token, 'POST', p); assert.equal(r.statusCode, 200, r.body);
  const st = (await sql`select selected_theses,opposed_theses,representative_email,representative_cpf,contract_hash,accepted_at from client_authorizations where id = ${a.id}`)[0];
  assert.deepEqual(st.selected_theses, ['T004']); assert.deepEqual(st.opposed_theses, ['T009']);
  assert.equal(st.representative_email, 'cliente@exemplo.com'); assert.equal(st.representative_cpf, '52998224725'); assert.match(st.contract_hash, /^[0-9a-f]{64}$/);
  assert.equal((await sql`select commercial_stage from tax_cases where id = ${caseId}`)[0].commercial_stage, 'contrato');
  assert.equal((await pub(a.token, 'POST', p)).statusCode, 409);
  const staffPdf = await v1(`client-authorizations/${a.id}/contrato`, { cookie: staff }); assert.equal(staffPdf.statusCode, 200);
  assert.equal((await v1(`client-authorizations/${a.id}/contrato`, { cookie: foreign })).statusCode, 404);
});
test('rejeita oposição total, CPF inválido, código errado, contrato alterado e documento adulterado', async () => {
  const a = await link(), p = await payload(a.token);
  assert.equal((await pub(a.token, 'POST', { action: 'previa', opposedTheses: ['T004', 'T009'] })).statusCode, 400);
  for (const bad of [{ opposedTheses: ['T999'] }, { opposedTheses: ['T004','T004'] }, { acceptedTerms: false }, { name: '' }, { cpf: '111.111.111-11' }]) {
    assert.equal((await pub(a.token, 'POST', { ...p, ...bad })).statusCode, 400, JSON.stringify(bad));
  }
  assert.equal((await pub(a.token, 'POST', { ...p, contractHash: 'f'.repeat(64) })).statusCode, 409); // contrato lido era outro
  assert.equal((await pub(a.token, 'POST', { ...p, snapshotHash: 'fake' })).statusCode, 409);
  assert.equal((await pub(a.token, 'POST', { ...p, code: '000000' === p.code ? '111111' : '000000' })).statusCode, 400);
  assert.equal((await pub(a.token, 'POST', { ...p, email: 'outro@exemplo.com' })).statusCode, 400);
  assert.equal((await v1('client-approval', { headers: { 'x-approval-token': a.token, origin: 'https://outro.test' } })).statusCode, 403);
  assert.equal((await pub('a'.repeat(43))).statusCode, 404);
});
test('assinatura simultânea grava uma só; revogação e expiração bloqueiam acesso', async () => {
  const a = await link(), p = await payload(a.token);
  const results = await Promise.all([pub(a.token, 'POST', p), pub(a.token, 'POST', p)]);
  assert.ok(results.some(r => r.statusCode === 200)); assert.ok(results.some(r => r.statusCode !== 200));
  assert.equal((await v1(`client-authorizations/${a.id}`, { cookie: foreign, method: 'DELETE' })).statusCode, 404);
  assert.equal((await v1(`client-authorizations/${a.id}`, { cookie: staff, method: 'DELETE' })).statusCode, 200);
  assert.equal((await pub(a.token)).statusCode, 404);
  const expired = await link(); await sql`update client_authorizations set expires_at = now() - interval '1 minute' where id = ${expired.id}`;
  assert.equal((await pub(expired.token)).statusCode, 404);
});
test('valores ficam com a equipe; diagnóstico das teses contratadas e com link', async () => {
  const bad = await v1(`cases/${caseId}/authorizations`, { cookie: staff, method: 'POST', body: { ...opts, values: { T004: -1 } } });
  assert.equal(bad.statusCode, 400);
  const a = await link({ values: { T004: 120000, T009: 30000 } });
  const tp = (await sql`select taxpayer_id from tax_cases where id = ${caseId}`)[0].taxpayer_id;
  const comLink = await v1(`crm/clients/${tp}/report`, { cookie: staff, method: 'POST', body: { link: a.url } });
  assert.equal(comLink.statusCode, 200);
  const r = await pub(a.token, 'POST', await payload(a.token, ['T009']));
  assert.equal(r.statusCode, 200, r.body); assert.ok(json(r).emails);
  const lista = json(await v1(`cases/${caseId}/authorizations`, { cookie: staff })).authorizations.find(x => x.id === a.id);
  assert.equal(lista.snapshot.theses.find(t => t.id === 'T004').value, 120000);
  const pdf = await v1(`crm/clients/${tp}/report`, { cookie: staff, query: { aprovadas: '1' } });
  assert.equal(pdf.statusCode, 200);
});
