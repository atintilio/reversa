// Painel Master e parceiros: acesso exclusivo, parceiro isolado com equipe própria, conflito de CNPJ, comissão e suspensão.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');
const Comissao = require('../comissao');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
delete process.env.MS_CLIENT_SECRET; // sem e-mail: o master recebe o link do convite
const origError = console.error; console.error = () => {};

let sql; let api; let H; let org; let master; let socio; let parceiroId; let dono; let conviteLink;
const SENHA = 'Senha-forte-123';
async function user(email, name, orgId, role) {
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${await bcrypt.hash(SENHA, 4)}, 'active') returning id`)[0];
  await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, 'active')`;
}
const login = async (email, senha = SENHA) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha } }));
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login'), reset: freshRequire('api/auth/password/reset') };
  org = (await sql`select id, kind from organizations order by created_at limit 1`)[0];
  assert.equal(org.kind, 'plataforma');
  await user('atintilio@argusprime.com.br', 'André', org.id, 'owner'); master = await login('atintilio@argusprime.com.br');
  await user('socio@argus.com', 'Sócio', org.id, 'admin'); socio = await login('socio@argus.com');
  await v1('taxpayers', { method: 'POST', cookie: master, body: { cnpj: '11222333000181', legalName: 'Cliente da Argus Ltda' } });
});
test.after(() => { console.error = origError; });

test('MASTER-001 só o master acessa o painel', async () => {
  assert.equal(J(await v1('me', { cookie: master })).master, true);
  assert.equal(J(await v1('me', { cookie: socio })).master, false);
  assert.equal((await v1('master/resumo', { cookie: socio })).statusCode, 403);
  assert.equal((await v1('master/resumo', { cookie: master })).statusCode, 200);
});

test('MASTER-002 cria parceiro, responsável entra num ambiente isolado e monta a equipe', async () => {
  const r = await v1('master/parceiros', { method: 'POST', cookie: master, body: { nome: 'Silva Contabilidade', cnpj: '11.444.777/0001-61', comissaoPct: '30', responsavel: 'Joana Silva', email: 'joana@silva.com' } });
  assert.equal(r.statusCode, 201, r.body);
  const j = J(r); parceiroId = j.id; assert.equal(j.emailSent, false); assert.match(j.link, /reset-password\.html\?convite=1&token=/);
  conviteLink = new URL(j.link);
  assert.equal((await call(H.reset, { method: 'POST', body: { token: conviteLink.searchParams.get('token'), password: 'Senha-da-joana-1', passwordConfirmation: 'Senha-da-joana-1' } })).statusCode, 204);
  dono = await login('joana@silva.com', 'Senha-da-joana-1');
  const eu = J(await v1('me', { cookie: dono }));
  assert.equal(eu.organization.kind, 'parceiro'); assert.equal(eu.organization.commissionPct, 30); assert.equal(eu.role, 'owner'); assert.equal(eu.master, false);
  assert.equal(J(await v1('taxpayers', { cookie: dono })).taxpayers.length, 0, 'não vê clientes da Argus');
  assert.equal((await v1('master/resumo', { cookie: dono })).statusCode, 403);
  const conv = await v1('members', { method: 'POST', cookie: dono, body: { email: 'ana@silva.com', name: 'Ana', role: 'analyst' } });
  assert.equal(conv.statusCode, 201, conv.body);
  assert.equal((await v1('master/parceiros', { method: 'POST', cookie: master, body: { nome: 'Outro', responsavel: 'Joana', email: 'joana@silva.com' } })).statusCode, 409);
});

test('MASTER-003 conflito de CNPJ, comissão no contrato e carteira consolidada', async () => {
  const c = J(await v1('taxpayers', { method: 'POST', cookie: dono, body: { cnpj: '11222333000181', legalName: 'Cliente Disputado SA' } }));
  const conf = J(await v1('master/conflitos', { cookie: master })).conflitos;
  assert.equal(conf.length, 1); assert.equal(conf[0].registros.length, 2); assert.equal(conf[0].registros[0].parceiro, 'Argus Prime');
  assert.equal((await v1('cases/' + c.caseId, { method: 'PATCH', cookie: dono, body: { stage: 'contrato', comissao: { base: 1000000, honorariosPct: 20 } } })).statusCode, 200);
  const cli = J(await v1('crm/clients/' + c.id, { cookie: dono })).cliente.caso;
  assert.equal(cli.comissao.honorariosPct, 20); assert.equal(cli.comissao.base, 1000000);
  const cart = J(await v1('master/carteira', { cookie: master, query: { parceiro: parceiroId } })).clientes;
  assert.equal(cart.length, 1);
  assert.deepEqual(cart[0].comissao, Comissao.calcular(1000000, 20, 30));
  assert.equal(cart[0].comissao.tributos, 33700); assert.equal(cart[0].comissao.liquido, 166300); assert.equal(cart[0].comissao.comissao, 49890);
  assert.equal(J(await v1('master/carteira', { cookie: master })).clientes.length, 2);
});

test('MASTER-004 suspender parceiro corta o acesso da equipe; reativar devolve', async () => {
  assert.equal((await v1('master/parceiros/' + parceiroId, { method: 'PATCH', cookie: master, body: { status: 'suspended' } })).statusCode, 200);
  assert.equal((await v1('me', { cookie: dono })).statusCode, 403);
  assert.equal((await v1('master/parceiros/' + org.id, { method: 'PATCH', cookie: master, body: { status: 'suspended' } })).statusCode, 409);
  await v1('master/parceiros/' + parceiroId, { method: 'PATCH', cookie: master, body: { status: 'active', comissaoPct: 25 } });
  assert.equal(J(await v1('me', { cookie: dono })).organization.commissionPct, 25);
  const ev = await sql`select event_type from audit_events where event_type like 'master.%'`;
  assert.ok(ev.some((e) => e.event_type === 'master.partner_created') && ev.some((e) => e.event_type === 'master.partner_updated'));
  const us = J(await v1('master/usuarios', { cookie: master })).usuarios;
  assert.ok(us.some((u) => u.email === 'ana@silva.com' && u.organizacao.nome === 'Silva Contabilidade'));
});
