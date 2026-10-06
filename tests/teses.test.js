// Regras de aplicabilidade das 60 teses e perfil do cliente na API.
process.env.SESSION_SECRET = 'segredo-de-teste';
process.env.RESET_TOKEN_PEPPER = 'pepper-de-teste';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const TR = require('../teses-regras.js');
const { createDb, call, cookieFrom } = require('./helpers');

test('TESES-001: as 60 teses batem com o catálogo (id, nome, risco, via)', () => {
  const cat = require('../schemas/opportunity_catalog_v1.json').opportunities;
  assert.equal(TR.TESES.length, 60);
  cat.forEach((o, i) => {
    const t = TR.TESES[i];
    assert.deepEqual([t.id, t.nome, t.risco, t.via], [o.id, o.name, o.risk_level, o.category]);
  });
  const ids = new Set(TR.PERFIL.map((p) => p.id));
  TR.TESES.forEach((t) => [...(t.todos || []), ...(t.algum || [])].forEach((k) => assert.ok(ids.has(k), `${t.id}: ${k}`)));
});

test('TESES-002: avaliação provável / verificar / não se aplica', () => {
  const t69 = TR.TESES.find((t) => t.id === 'T001');
  const mono = TR.TESES.find((t) => t.id === 'T003');
  assert.equal(TR.avaliar(t69, { regime: 'Lucro Presumido', perfil: { comercio: true } }).estado, 'provavel');
  assert.equal(TR.avaliar(t69, { regime: 'presumido', perfil: {} }).estado, 'verificar');
  assert.equal(TR.avaliar(t69, { regime: 'simples', perfil: { comercio: true } }).estado, 'nao');
  assert.equal(TR.avaliar(t69, { regime: 'real', perfil: { comercio: false, industria: false } }).estado, 'nao');
  assert.equal(TR.avaliar(mono, { regime: 'Simples Nacional', perfil: { monofasico: true } }).estado, 'provavel');
  assert.equal(TR.avaliar(t69, { regime: null, perfil: { comercio: true } }).estado, 'verificar');
  assert.equal(TR.regimeDe('Não cumulativo'), 'real');
  assert.equal(TR.regimeDe('Cumulativo'), 'presumido');
  const c = TR.cruzar([{ id: 'a', nome: 'A', regime: 'real', perfil: { comercio: true, st: true } }]);
  assert.equal(c.matriz[0].resultados.length, 60);
  assert.ok(c.matriz[0].contagem.provavel >= 3);
});

test('TESES-003: perfil salvo pela API, filtrado às chaves conhecidas, devolvido na lista', async () => {
  const { sql } = await createDb();
  require('../lib/db').setSqlForTests(sql);
  const org = (await sql`select id from organizations limit 1`)[0].id;
  const u = (await sql`insert into users (email, email_normalized, name, password_hash) values ('a@t.local','a@t.local','A', ${await bcrypt.hash('Senha-forte-123', 4)}) returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role) values (${org}, ${u.id}, 'analyst')`;
  const tp = (await sql`insert into taxpayers (organization_id, legal_name, cnpj, cnpj_normalized) values (${org}, 'Cliente X', '11222333000181', '11222333000181') returning id`)[0];
  const login = await call(require('../api/login'), { method: 'POST', body: { usuario: 'a@t.local', senha: 'Senha-forte-123' } });
  const cookie = cookieFrom(login);
  const v1 = require('../api/v1/[...route]');
  const r = await call(v1, { method: 'PATCH', url: `/api/v1/taxpayers/${tp.id}`, cookie, body: { taxRegime: 'Lucro Real', perfil: { comercio: true, st: false, invasor: true, folha: 'sim' } } });
  assert.equal(r.statusCode, 200, r.body);
  const l = await call(v1, { method: 'GET', url: '/api/v1/taxpayers', cookie });
  const x = JSON.parse(l.body).taxpayers.find((t) => t.id === tp.id);
  assert.deepEqual(x.perfil, { comercio: true, st: false });
  assert.equal(x.taxRegime, 'Lucro Real');
  const bad = await call(v1, { method: 'PATCH', url: `/api/v1/taxpayers/${tp.id}`, cookie, body: { perfil: [1] } });
  assert.equal(bad.statusCode, 400);
});
