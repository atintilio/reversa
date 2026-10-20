// Histórico de alterações do CRM, modo parceiro da Argus e exclusão lógica (só Argus).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
const origError = console.error; console.error = () => {};

let sql; let api; let H; let plat; let pA; let pB; let master; let donoA; let donoB; let caseA; let tpA;
const SENHA = 'Senha-forte-123';
async function user(email, name, orgId, role) {
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${await bcrypt.hash(SENHA, 4)}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
  return u.id;
}
const login = async (email) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha: SENHA } }));
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login') };
  plat = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  pA = (await sql`insert into organizations (name, kind) values ('Parceiro A', 'parceiro') returning id`)[0].id;
  pB = (await sql`insert into organizations (name, kind) values ('Parceiro B', 'parceiro') returning id`)[0].id;
  await user('atintilio@argusprime.com.br', 'André', plat, 'owner'); master = await login('atintilio@argusprime.com.br');
  await user('a@a.com', 'Dona A', pA, 'owner'); donoA = await login('a@a.com');
  await user('b@b.com', 'Dono B', pB, 'owner'); donoB = await login('b@b.com');
  tpA = J(await v1('taxpayers', { method: 'POST', cookie: donoA, body: { cnpj: '11222333000181', legalName: 'Cliente A' } })).id;
  // o cadastro do cliente já abre o card; se não abriu, cria
  let cs = await sql`select id from tax_cases where taxpayer_id = ${tpA} order by created_at limit 1`;
  caseA = cs[0] ? cs[0].id : J(await v1('cases', { method: 'POST', cookie: donoA, body: { taxpayerId: tpA } })).id;
});
test.after(() => { console.error = origError; });

test('HIST-001 parceiro edita o card e cada mudança real gera histórico', async () => {
  const r = await v1('cases/' + caseA, { method: 'PATCH', cookie: donoA, body: { stage: 'apresentado', nextStep: 'Ligar na terça', title: 'Novo título' } });
  assert.equal(r.statusCode, 200, r.body);
  // mesmo valor de novo: nada novo no histórico
  await v1('cases/' + caseA, { method: 'PATCH', cookie: donoA, body: { stage: 'apresentado', nextStep: 'Ligar na terça' } });
  const h = J(await v1('cases/' + caseA + '/history', { cookie: donoA })).historico;
  const campos = h.map((x) => x.campo);
  assert.ok(campos.includes('fase') && campos.includes('próximo passo') && campos.includes('título'), JSON.stringify(campos));
  assert.equal(h.filter((x) => x.campo === 'fase' && x.para === 'apresentado').length, 1, 'sem duplicar');
  const f = h.find((x) => x.campo === 'fase' && x.para === 'apresentado');
  assert.equal(f.de, 'a_apresentar'); assert.equal(f.autor, 'Dona A'); assert.equal(f.tipo, 'fase'); assert.equal(f.origem, 'parceiro');
});

test('HIST-002 contato e atividade também entram no histórico', async () => {
  const k = await v1('crm/contacts', { method: 'POST', cookie: donoA, body: { taxpayerId: tpA, name: 'Maria', email: 'm@a.com' } }); assert.equal(k.statusCode, 201, k.body);
  const a = await v1('crm/activities', { method: 'POST', cookie: donoA, body: { taxpayerId: tpA, type: 'call', subject: 'Primeiro contato' } }); assert.equal(a.statusCode, 201, a.body);
  const h = J(await v1('cases/' + caseA + '/history', { cookie: donoA })).historico;
  assert.ok(h.some((x) => x.tipo === 'contato' && /Maria/.test(x.para)));
  assert.ok(h.some((x) => x.tipo === 'atividade' && /Primeiro contato/.test(x.para)));
});

test('HIST-003 parceiro NÃO exclui o card (403) e outro parceiro não vê o histórico', async () => {
  const d = await v1('cases/' + caseA, { method: 'DELETE', cookie: donoA, body: { motivo: 'teste' } });
  assert.equal(d.statusCode, 403, d.body);
  assert.equal((await sql`select status from tax_cases where id = ${caseA}`)[0].status, 'draft');
  assert.equal((await v1('cases/' + caseA + '/history', { cookie: donoB })).statusCode, 404);
  // ?parceiro= é ignorado para quem não é master
  const x = await v1('cases/' + caseA, { method: 'PATCH', cookie: donoB, query: { parceiro: pA }, body: { nextStep: 'invasão' } });
  assert.equal(x.statusCode, 404);
});

test('HIST-004 Argus opera no parceiro (?parceiro=), edita e o histórico mostra origem Argus', async () => {
  const r = await v1('cases/' + caseA, { method: 'PATCH', cookie: master, query: { parceiro: pA }, body: { nextStep: 'Reunião com o sócio' } });
  assert.equal(r.statusCode, 200, r.body);
  const p = J(await v1('crm/pipeline', { cookie: master, query: { parceiro: pA } }));
  assert.equal(p.clientes.length, 1); assert.equal(p.clientes[0].nextStep, 'Reunião com o sócio');
  const h = J(await v1('cases/' + caseA + '/history', { cookie: donoA })).historico;
  const e = h.find((x) => x.campo === 'próximo passo' && x.para === 'Reunião com o sócio');
  assert.ok(e); assert.equal(e.autor, 'André'); assert.equal(e.origem, 'plataforma'); assert.equal(e.de, 'Ligar na terça');
  // sem ?parceiro, o master resolve a organização pelo próprio card
  assert.equal((await v1('cases/' + caseA + '/history', { cookie: master })).statusCode, 200);
});

test('HIST-005 Argus exclui logicamente com motivo, sai do funil e dos totais, e restaura', async () => {
  assert.equal((await v1('cases/' + caseA, { method: 'DELETE', cookie: master, query: { parceiro: pA }, body: {} })).statusCode, 400, 'motivo obrigatório');
  const d = await v1('cases/' + caseA, { method: 'DELETE', cookie: master, query: { parceiro: pA }, body: { motivo: 'Duplicado' } });
  assert.equal(d.statusCode, 200, d.body);
  assert.equal((await sql`select status from tax_cases where id = ${caseA}`)[0].status, 'archived');
  assert.equal(J(await v1('crm/pipeline', { cookie: donoA })).clientes.length, 0, 'fora do funil do parceiro');
  const cart = J(await v1('master/carteira', { cookie: master })).clientes;
  assert.equal(cart.filter((c) => c.nome === 'Cliente A').length, 0, 'fora da carteira');
  assert.equal((await v1('cases/' + caseA, { method: 'PATCH', cookie: donoA, body: { nextStep: 'x' } })).statusCode, 409, 'parceiro não edita card excluído');
  assert.equal((await v1('cases/' + caseA + '/restore', { method: 'POST', cookie: donoA, body: {} })).statusCode, 403);
  const r = await v1('cases/' + caseA + '/restore', { method: 'POST', cookie: master, body: {} });
  assert.equal(r.statusCode, 200, r.body);
  assert.notEqual((await sql`select status from tax_cases where id = ${caseA}`)[0].status, 'archived');
  assert.equal(J(await v1('crm/pipeline', { cookie: donoA })).clientes.length, 1);
  const h = J(await v1('cases/' + caseA + '/history', { cookie: master })).historico;
  assert.ok(h.some((x) => x.tipo === 'exclusao' && /Duplicado/.test(x.para)));
  assert.ok(h.some((x) => x.tipo === 'restauracao'));
});
