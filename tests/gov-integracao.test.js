// Testes de integração do módulo Reversa Gov dentro da aplicação hospedeira.
// Exercita /api/v1/gov/* pelo roteador real (api/v1/[...route].js), com sessão real,
// as migrations 014/015 e o isolamento por organização — sem os fixtures do repositório do módulo.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';

let sql; let api; let H;
const SENHA = 'Senha-forte-123';

async function user(email, name, orgId, role) {
  const hash = await bcrypt.hash(SENHA, 4);
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${hash}, 'active') returning id`)[0];
  if (orgId) await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
  return u.id;
}
async function login(email) {
  return cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha: SENHA } }));
}
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);

let orgA; let orgB;
let admin; let analista; let leitor; let outro;
let municipio; let entidade;

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  orgA = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  orgB = (await sql`insert into organizations (name) values ('Prefeitura do outro município') returning id`)[0].id;
  admin = await login('gov.admin@argus.com');
  await user('gov.admin@argus.com', 'Admin Gov', orgA, 'admin');
  admin = await login('gov.admin@argus.com');
  await user('gov.ana@argus.com', 'Ana Gov', orgA, 'analyst');
  analista = await login('gov.ana@argus.com');
  await user('gov.leo@argus.com', 'Leo Gov', orgA, 'viewer');
  leitor = await login('gov.leo@argus.com');
  await user('gov.bia@outra.com', 'Bia Gov', orgB, 'admin');
  outro = await login('gov.bia@outra.com');
});

test('migrations 014 e 015 criam as tabelas gov_* no banco da aplicação', async () => {
  const rows = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'gov_%' order by table_name`;
  const nomes = rows.map((r) => r.table_name);
  for (const t of ['gov_municipalities', 'gov_entities', 'gov_candidates', 'gov_evidence_links', 'gov_reviews', 'gov_cases']) {
    assert.ok(nomes.includes(t), `falta a tabela ${t}`);
  }
});

test('sem sessão, as rotas Gov respondem 401', async () => {
  const r = await v1('gov/municipios');
  assert.equal(r.statusCode, 401);
});

test('POST /api/v1/gov/municipios cria município e GET lista na organização', async () => {
  const r = await v1('gov/municipios', { method: 'POST', cookie: admin, body: { ibgeCode: '4205402', name: 'Florianópolis', state: 'SC', cnpjRoot: '82345678' } });
  assert.equal(r.statusCode, 201);
  const criado = J(r);
  assert.equal(criado.name, 'Florianópolis');
  assert.equal(criado.state, 'SC');
  assert.ok(criado.id);

  const lista = await v1('gov/municipios', { cookie: admin });
  assert.equal(lista.statusCode, 200);
  assert.equal(J(lista).municipios.length, 1);
  municipio = criado.id;
});

test('filtro por UF e por busca no cadastro de municípios', async () => {
  await v1('gov/municipios', { method: 'POST', cookie: admin, body: { ibgeCode: '3550308', name: 'São Paulo', state: 'SP' } });
  const sc = await v1('gov/municipios', { cookie: admin, query: { uf: 'SC' } });
  assert.equal(J(sc).municipios.length, 1);
  assert.equal(J(sc).municipios[0].state, 'SC');
  const busca = await v1('gov/municipios', { cookie: admin, query: { q: 'florian' } });
  assert.equal(J(busca).municipios.length, 1);
});

test('IBGE, UF ou CNPJ raiz inválidos são recusados', async () => {
  const r = await v1('gov/municipios', { method: 'POST', cookie: admin, body: { ibgeCode: '123', name: 'X', state: 'SC' } });
  assert.equal(r.statusCode, 400);
});

test('POST candidato com status VALIDATED é recusado — validação exige trilha de evidências', async () => {
  entidade = (await sql`insert into gov_entities (organization_id, municipality_id, cnpj, legal_name, entity_type) values (${orgA}, ${municipio}, '11222333000181', 'Prefeitura de Florianópolis', 'direct_admin') returning id`)[0].id;
  const r = await v1('gov/candidatos', { method: 'POST', cookie: admin, body: { entityId: entidade, period: '2026-01-31', status: 'VALIDATED', withheldAmountCents: 1000 } });
  assert.equal(r.statusCode, 400);
  assert.match(J(r).error.message, /evidências/i);
});

test('POST candidato cria em DRAFT e GET /candidatos/:id devolve o registro com a entidade', async () => {
  const r = await v1('gov/candidatos', { method: 'POST', cookie: admin, body: { entityId: entidade, period: '2026-01-31', status: 'DRAFT', grossCandidateAmountCents: 500000, withheldAmountCents: 120000, provenDestinationAmountCents: 30000, confidence: 'MEDIUM', legalOwner: 'MUNICIPAL' } });
  assert.equal(r.statusCode, 201);
  const criado = J(r);
  assert.equal(criado.status, 'DRAFT');

  const um = await v1(`gov/candidatos/${criado.id}`, { cookie: admin });
  assert.equal(um.statusCode, 200);
  const det = J(um);
  assert.equal(det.entityName, 'Prefeitura de Florianópolis');
  assert.equal(det.withheldAmountCents, 120000);
  assert.equal(det.provenDestinationAmountCents, 30000);
  assert.equal(det.evidencias.length, 0);
  globalThis.__candidato = criado.id;
});

test('evidência é vinculada e listada no candidato', async () => {
  const id = globalThis.__candidato;
  const r = await v1(`gov/candidatos/${id}/evidencias`, { method: 'POST', cookie: admin, body: { evidenceType: 'TERMO_RETENCAO', recordLocator: 'contrato-2026-01.pdf p.12' } });
  assert.equal(r.statusCode, 201);
  const lista = await v1(`gov/candidatos/${id}/evidencias`, { cookie: admin });
  assert.equal(lista.statusCode, 200);
  assert.equal(J(lista).evidencias.length, 1);
  assert.equal(J(lista).evidencias[0].evidenceType, 'TERMO_RETENCAO');
});

test('revisão exige permissão de review: analista recebe 403 e admin registra', async () => {
  const id = globalThis.__candidato;
  const negado = await v1(`gov/candidatos/${id}/revisao`, { method: 'POST', cookie: analista, body: { decision: 'REQUEST_MORE_EVIDENCE', reason: 'Falta termo.' } });
  assert.equal(negado.statusCode, 403);
  const ok = await v1(`gov/candidatos/${id}/revisao`, { method: 'POST', cookie: admin, body: { decision: 'REQUEST_MORE_EVIDENCE', reason: 'Falta o termo de retenção do período.' } });
  assert.equal(ok.statusCode, 201);
  assert.equal(J(ok).decision, 'REQUEST_MORE_EVIDENCE');
});

test('leitor não escreve: POST município sem permissão de write é 403', async () => {
  const r = await v1('gov/municipios', { method: 'POST', cookie: leitor, body: { ibgeCode: '3550308', name: 'Cópia', state: 'SP' } });
  assert.equal(r.statusCode, 403);
});

test('dashboard do Gov conta municípios e candidatos da organização', async () => {
  const r = await v1('gov/dashboard', { cookie: admin });
  assert.equal(r.statusCode, 200);
  const d = J(r);
  assert.equal(d.municipios, 2);
  assert.equal(d.candidatos, 1);
});

test('isolamento: a outra organização não enxerga nem pode escrever os dados', async () => {
  const lista = await v1('gov/municipios', { cookie: outro });
  assert.equal(J(lista).municipios.length, 0);
  const id = globalThis.__candidato;
  const um = await v1(`gov/candidatos/${id}`, { cookie: outro });
  assert.equal(um.statusCode, 404);
  const mesmo = await v1('gov/municipios', { method: 'POST', cookie: outro, body: { ibgeCode: '4205402', name: 'Florianópolis', state: 'SC' } });
  assert.equal(mesmo.statusCode, 201); // mesmo IBGE, outra organização — permitido pela migration 015
});

test('rota inexistente dentro de gov devolve 404 do módulo', async () => {
  const r = await v1('gov/inexistente', { cookie: admin });
  assert.equal(r.statusCode, 404);
  assert.equal(J(r).error.code, 'NOT_FOUND');
});
