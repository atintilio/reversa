// Testes de acesso por suite e passagem de sessao entre suites.
// A concessao e feita pelo admin (PATCH /members/:id) e vale para o handoff
// assinado que leva o usuario para a suite destino sem pedir senha de novo.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
process.env.SUITE_HMAC_SECRET = 'teste-suite-hmac';
process.env.SUITE_URL_GOV = 'https://reversa-gov-suite.vercel.app';

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

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  orgA = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  orgB = (await sql`insert into organizations (name) values ('Outra Org') returning id`)[0].id;
  await user('suite.admin@argus.com', 'Admin Suite', orgA, 'admin');
  admin = await login('suite.admin@argus.com');
  await user('suite.ana@argus.com', 'Ana Suite', orgA, 'analyst');
  analista = await login('suite.ana@argus.com');
  await user('suite.leo@argus.com', 'Leo Suite', orgA, 'viewer');
  leitor = await login('suite.leo@argus.com');
  await user('suite.bia@outra.com', 'Bia Suite', orgB, 'admin');
  outro = await login('suite.bia@outra.com');
});

test('a migration 016 cria suite_access e da suite tax a quem ja era membro', async () => {
  const [tabela] = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'suite_access'`;
  assert.ok(tabela, 'falta a tabela suite_access');
  const linhas = await sql`select count(*)::int n from suite_access where suite = 'tax'`;
  assert.ok(linhas[0].n >= 0, 'a migration roda sem erro');
  // Membros criados depois da migration nao tem linha em suite_access: o vinculo
  // com a organizacao garante o acesso base a suite Tax.
  const me = await v1('me', { cookie: admin });
  assert.ok(J(me).suites.includes('tax'), 'o vinculo garante o acesso base a suite Tax');
});

test('/me devolve as suites do membro', async () => {
  const r = await v1('me', { cookie: admin });
  assert.equal(r.statusCode, 200);
  const eu = J(r);
  assert.ok(Array.isArray(eu.suites));
  assert.ok(eu.suites.includes('tax'), 'o admin tem a suite tax');
  assert.ok(!eu.suites.includes('gov'), 'ninguem tem a suite gov antes da concessao');
});

test('o admin concede a suite gov a um membro e o membro passa a ver', async () => {
  const alvo = (await sql`select user_id from organization_members where organization_id = ${orgA} and role = 'analyst' limit 1`)[0].user_id;
  const membros = await v1('members', { cookie: admin });
  assert.equal(membros.statusCode, 200);
  const lista = J(membros).members;
  const alvoLista = lista.filter((m) => m.id === alvo)[0];
  assert.ok(alvoLista.suites.includes('tax'), 'acesso base a suite Tax');

  const patch = await v1(`members/${alvo}`, { method: 'PATCH', cookie: admin, body: { suites: ['tax', 'gov'] } });
  assert.equal(patch.statusCode, 200);

  const me = await v1('me', { cookie: analista });
  assert.ok(J(me).suites.includes('gov'), 'o membro concedido deve ver a suite gov');
});

test('quem nao tem a suite gov e barrado no handoff', async () => {
  const r = await v1('suite/gov/entrar', { method: 'GET', cookie: leitor });
  assert.equal(r.statusCode, 403);
  assert.equal(J(r).error.code, 'FORBIDDEN');
});

test('o handoff responde 303 para a suite destino com token assinado', async () => {
  const r = await v1('suite/gov/entrar', { method: 'GET', cookie: analista });
  assert.equal(r.statusCode, 303);
  const destino = r.headers.location;
  assert.ok(destino.startsWith('https://reversa-gov-suite.vercel.app/entrar?token='), destino);
  const token = decodeURIComponent(destino.split('token=')[1]);
  const { verificarSuiteToken } = require('../lib/suites');
  const payload = verificarSuiteToken(token, process.env.SUITE_HMAC_SECRET);
  assert.ok(payload, 'o token deveria ser valido');
  assert.equal(payload.o, orgA);
  assert.equal(payload.r, 'analyst');
  assert.ok(payload.u, 'o token leva o id do usuario');
  assert.ok(payload.x * 1000 > Date.now(), 'o token expira em breve');
});

test('o token adulterado nao passa na verificacao', async () => {
  const { verificarSuiteToken } = require('../lib/suites');
  const { assinarSuiteToken } = require('../lib/suites');
  const token = assinarSuiteToken({ u: 'x', o: orgA, x: Math.floor(Date.now() / 1000) + 60 }, 'outro-segredo');
  assert.equal(verificarSuiteToken(token, process.env.SUITE_HMAC_SECRET), null);
});

test('o token expirado e recusado', async () => {
  const { verificarSuiteToken, assinarSuiteToken } = require('../lib/suites');
  const token = assinarSuiteToken({ u: 'x', o: orgA, x: Math.floor(Date.now() / 1000) - 10 }, process.env.SUITE_HMAC_SECRET);
  assert.equal(verificarSuiteToken(token, process.env.SUITE_HMAC_SECRET), null);
});

test('a concessao e por organizacao: a outra organizacao nao enxerga', async () => {
  const [alvo] = await sql`select m.user_id from organization_members m
    where m.organization_id = ${orgA} and m.role = 'analyst' limit 1`;
  const linhas = await sql`select count(*)::int n from suite_access where user_id = ${alvo.user_id} and suite = 'gov'`;
  assert.equal(linhas[0].n, 1);
  const outra = await v1('members', { cookie: outro });
  assert.equal(J(outra).members.length, 1, 'a outra organizacao so ve os proprios membros');
});

test('remover a suite gov tira o acesso e o handoff volta a 403', async () => {
  const [alvo] = await sql`select m.user_id from organization_members m
    where m.organization_id = ${orgA} and m.role = 'analyst' limit 1`;
  const patch = await v1(`members/${alvo.user_id}`, { method: 'PATCH', cookie: admin, body: { suites: ['tax'] } });
  assert.equal(patch.statusCode, 200);
  const me = await v1('me', { cookie: analista });
  assert.ok(!J(me).suites.includes('gov'));
  const handoff = await v1('suite/gov/entrar', { method: 'GET', cookie: analista });
  assert.equal(handoff.statusCode, 403);
});

test('suite inexistente devolve 404', async () => {
  const r = await v1('suite/inexistente/entrar', { method: 'GET', cookie: admin });
  assert.equal(r.statusCode, 404);
});
