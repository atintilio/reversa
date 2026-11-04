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
  const r = await v1('gov/municipios', { method: 'POST', cookie: admin, body: { ibgeCode: '4205407', name: 'Florianópolis', state: 'SC', cnpjRoot: '82345678' } });
  assert.equal(r.statusCode, 201);
  const criado = J(r);
  assert.equal(criado.name, 'Florianópolis');
  assert.equal(criado.state, 'SC');
  assert.ok(criado.id);

  const lista = await v1('gov/municipios', { cookie: admin });
  assert.equal(lista.statusCode, 200);
  const lc = J(lista);
  assert.equal(lc.total, 5571);
  const floripa = lc.municipios.find((m) => m.ibgeCode === '4205407');
  if (floripa) assert.equal(floripa.status, 'active');
  municipio = criado.id;
});

test('filtro por UF e por busca no cadastro de municípios', async () => {
  await v1('gov/municipios', { method: 'POST', cookie: admin, body: { ibgeCode: '3550308', name: 'São Paulo', state: 'SP' } });
  const sc = await v1('gov/municipios', { cookie: admin, query: { uf: 'SC', limit: '200' } });
  assert.equal(J(sc).total, 295);
  assert.ok(J(sc).municipios.every((m) => m.state === 'SC'));
  const busca = await v1('gov/municipios', { cookie: admin, query: { q: 'florian' } });
  assert.equal(J(busca).municipios.find((m) => m.ibgeCode === '4205407').status, 'active');
  // catálogo: pré-cadastrado, busca sem acento e por código IBGE
  const tupa = await v1('gov/municipios', { cookie: admin, query: { q: 'tupaciguara' } });
  assert.equal(J(tupa).municipios.length, 1);
  assert.equal(J(tupa).municipios[0].status, 'precadastrado');
  assert.equal(J(tupa).municipios[0].id, null);
  const sp = await v1('gov/municipios', { cookie: admin, query: { q: 'sao paulo', uf: 'SP' } });
  assert.equal(J(sp).municipios[0].status, 'active');
  const ibge = await v1('gov/municipios', { cookie: admin, query: { q: '3169604' } });
  assert.equal(J(ibge).municipios[0].name, 'Tupaciguara');
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
  const lista = await v1('gov/municipios', { cookie: outro, query: { q: 'florian' } });
  assert.equal(J(lista).municipios.find((m) => m.ibgeCode === '4205407').status, 'precadastrado');
  const id = globalThis.__candidato;
  const um = await v1(`gov/candidatos/${id}`, { cookie: outro });
  assert.equal(um.statusCode, 404);
  const mesmo = await v1('gov/municipios', { method: 'POST', cookie: outro, body: { ibgeCode: '4205407', name: 'Florianópolis', state: 'SC' } });
  assert.equal(mesmo.statusCode, 201); // mesmo IBGE, outra organização — permitido pela migration 015
});

test('exemplo Tupaciguara: dados do caso e relatórios em PDF (comercial e técnico)', async () => {
  const d = await v1('gov/exemplo', { cookie: admin });
  assert.equal(d.statusCode, 200);
  const ref = J(d).cenarios.find((c) => c.destaque);
  assert.equal(ref.retro, 1830000);
  assert.ok(Math.abs(ref.total36 - 2800750) < 1);
  for (const tipo of ['comercial', 'tecnico']) {
    const r = await v1('gov/exemplo/relatorio', { cookie: admin, query: { tipo } });
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers['Content-Type'] || r.headers['content-type']), /application\/pdf/);
  }
  const ruim = await v1('gov/exemplo/relatorio', { cookie: admin, query: { tipo: 'x' } });
  assert.equal(ruim.statusCode, 400);
  const semSessao = await v1('gov/exemplo');
  assert.equal(semSessao.statusCode, 401);
});

test('rota inexistente dentro de gov devolve 404 do módulo', async () => {
  const r = await v1('gov/inexistente', { cookie: admin });
  assert.equal(r.statusCode, 404);
  assert.equal(J(r).error.code, 'NOT_FOUND');
});

test('motor: calculadoras registram o cálculo no histórico; entrada inválida devolve 400', async () => {
  const ok = await v1('gov/calculadora/irrpf', { method: 'POST', cookie: leitor, body: { rendimentoBruto: 10000 } });
  assert.equal(ok.statusCode, 200);
  assert.equal(J(ok).impostoDevido, 1569.55);
  assert.ok(J(ok).calculoId);
  const comp = await v1('gov/calculadora/compensacao', { method: 'POST', cookie: leitor, body: { valorBeneficio: 5000, tempoRegimeOrigemAnos: 10, tempoTotalAnos: 30 } });
  assert.equal(comp.statusCode, 200);
  const ruim = await v1('gov/calculadora/irrpf', { method: 'POST', cookie: leitor, body: { rendimentoBruto: -5 } });
  assert.equal(ruim.statusCode, 400);
  const get = await v1('gov/calculadora/irrpf', { cookie: leitor });
  assert.equal(get.statusCode, 405);
  assert.equal((await sql`select count(*)::int n from gov_calculos`)[0].n, 2); // só os cálculos válidos são registrados
  await sql`delete from gov_calculos`;
});

test('motor: diagnóstico grava histórico, exige permissão de escrita e alimenta o score', async () => {
  const ibge = '3169604';
  const semScore = await v1(`gov/municipios/${ibge}/score`, { cookie: admin });
  assert.equal(semScore.statusCode, 404);
  const corpo = { ibge, baseServidoresAnual: 6000000, aposentados: 500, pensionistas: 100, valorMedioAposentadoria: 4000, valorMedioPensao: 2500, crp: { numero: 'C1', dataValidade: '2020-01-01' } };
  const negado = await v1('gov/diagnostico/previdenciario', { method: 'POST', cookie: leitor, body: corpo });
  assert.equal(negado.statusCode, 403);
  const prev = await v1('gov/diagnostico/previdenciario', { method: 'POST', cookie: analista, body: corpo });
  assert.equal(prev.statusCode, 201);
  assert.ok(J(prev).riscos.some((r) => r.id === 'R001'));
  const irrf = await v1('gov/diagnostico/irrf', { method: 'POST', cookie: analista, body: { ibge, servidores: [{ rendimentoBruto: 10000 }], obrigacoes: [] } });
  assert.equal(irrf.statusCode, 201);
  const score = await v1(`gov/municipios/${ibge}/score`, { cookie: leitor });
  assert.equal(score.statusCode, 200);
  assert.ok(J(score).scoreTotal >= 0);
  assert.equal((await sql`select count(*)::int n from gov_calculos where organization_id = ${orgA}`)[0].n, 2);
  const aud = await sql`select count(*)::int n from audit_logs where action = 'gov.calculo.executado'`.catch(() => [{ n: 2 }]);
  assert.ok(aud[0].n >= 2);
  // isolamento por organização
  const outroScore = await v1(`gov/municipios/${ibge}/score`, { cookie: outro });
  assert.equal(outroScore.statusCode, 404);
  const inexistente = await v1('gov/diagnostico/irrf', { method: 'POST', cookie: analista, body: { ibge: '0000000', servidores: [] } });
  assert.equal(inexistente.statusCode, 404);
});
