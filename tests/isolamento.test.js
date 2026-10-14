// Simulação: parceiro só enxerga os próprios negócios (CRM, pastas, casos, relatórios); a equipe Argus não vê os do parceiro; só o master vê tudo.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');
process.env.SESSION_SECRET = 'isolamento-secret'; process.env.RESET_TOKEN_PEPPER = 'pepper';
delete process.env.MS_CLIENT_SECRET;
const origError = console.error; console.error = () => {};
let sql, api, H, master, socio, parceiroA, parceiroB, analistaA, cliA, cliArgus;
const SENHA = 'Senha-forte-123';
const v1 = (path, o = {}) => call(api, { ...o, url: '/api/v1/' + path, query: o.query || {} });
const J = (r) => JSON.parse(r.body);
const login = async (email, senha = SENHA) => cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha } }));
async function user(email, orgId, role) {
  const u = (await sql`insert into users (email,email_normalized,name,password_hash,status) values (${email},${email},${email},${await bcrypt.hash(SENHA, 4)},'active') returning id`)[0];
  await sql`insert into organization_members (organization_id,user_id,role,status) values (${orgId},${u.id},${role},'active')`;
}
async function parceiro(nome, email) {
  const r = J(await v1('master/parceiros', { method: 'POST', cookie: master, body: { nome, comissaoPct: '20', responsavel: nome, email } }));
  const token = new URL(r.link).searchParams.get('token');
  await call(H.reset, { method: 'POST', body: { token, password: 'Senha-parceiro-1', passwordConfirmation: 'Senha-parceiro-1' } });
  return { id: r.id, cookie: await login(email, 'Senha-parceiro-1') };
}
test.before(async () => {
  ({ sql } = await createDb()); freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]'); H = { login: freshRequire('api/login'), reset: freshRequire('api/auth/password/reset') };
  const org = (await sql`select id from organizations order by created_at limit 1`)[0].id;
  await user('atintilio@argusprime.com.br', org, 'owner'); master = await login('atintilio@argusprime.com.br');
  await user('socio@argus.com', org, 'admin'); socio = await login('socio@argus.com');
  cliArgus = J(await v1('taxpayers', { method: 'POST', cookie: master, body: { cnpj: '11222333000181', legalName: 'Cliente Argus SA' } }));
  const a = await parceiro('Parceiro A', 'a@parceiroa.com'); parceiroA = a.cookie;
  parceiroB = (await parceiro('Parceiro B', 'b@parceirob.com')).cookie;
  await v1('members', { method: 'POST', cookie: parceiroA, body: { email: 'ana@parceiroa.com', name: 'Ana', role: 'analyst' } });
  cliA = J(await v1('taxpayers', { method: 'POST', cookie: parceiroA, body: { cnpj: '11444777000161', legalName: 'Cliente do Parceiro A Ltda' } }));
});
test.after(() => { console.error = origError; });

test('ISO-001 parceiro vê só os próprios clientes no CRM e nas pastas', async () => {
  const nomes = (r) => J(r).clientes ? J(r).clientes.map((c) => c.legalName || c.legal_name) : null;
  const pipeA = J(await v1('crm/pipeline', { cookie: parceiroA }));
  const txt = JSON.stringify(pipeA);
  assert.ok(txt.includes('Cliente do Parceiro A Ltda')); assert.ok(!txt.includes('Cliente Argus SA'));
  const pipeB = JSON.stringify(J(await v1('crm/pipeline', { cookie: parceiroB })));
  assert.ok(!pipeB.includes('Cliente do Parceiro A Ltda') && !pipeB.includes('Cliente Argus SA'));
  assert.equal(J(await v1('taxpayers', { cookie: parceiroB })).taxpayers.length, 0);
  void nomes;
});
test('ISO-002 acesso direto ao negócio de outro devolve 404 (pasta, CRM, caso, relatório)', async () => {
  assert.equal((await v1('taxpayers/' + cliArgus.id, { cookie: parceiroA })).statusCode, 404);
  assert.equal((await v1('crm/clients/' + cliArgus.id, { cookie: parceiroA })).statusCode, 404);
  assert.equal((await v1('crm/clients/' + cliA.id, { cookie: parceiroB })).statusCode, 404);
  assert.equal((await v1('crm/clients/' + cliA.id + '/report', { cookie: parceiroB })).statusCode, 404);
  assert.equal((await v1('cases/' + cliA.caseId, { method: 'PATCH', cookie: parceiroB, body: { stage: 'contrato' } })).statusCode, 404);
});
test('ISO-003 equipe Argus (não master) também não vê os negócios do parceiro', async () => {
  const s = JSON.stringify(J(await v1('crm/pipeline', { cookie: socio })));
  assert.ok(s.includes('Cliente Argus SA') && !s.includes('Cliente do Parceiro A Ltda'));
  assert.equal((await v1('master/carteira', { cookie: socio })).statusCode, 403);
});
test('ISO-004 só o master enxerga a carteira consolidada de todos', async () => {
  const cart = J(await v1('master/carteira', { cookie: master })).clientes.map((c) => JSON.stringify(c));
  assert.ok(cart.some((c) => c.includes('Cliente Argus SA')) && cart.some((c) => c.includes('Cliente do Parceiro A Ltda')));
  assert.equal((await v1('master/carteira', { cookie: parceiroA })).statusCode, 403);
});

test('ISO-005 master concede e retira a visão do todo de um membro da Argus (não de parceiros)', async () => {
  const us = J(await v1('master/usuarios', { cookie: master })).usuarios;
  const s = us.find((u) => u.email === 'socio@argus.com'), pa = us.find((u) => u.email === 'a@parceiroa.com');
  assert.equal((await v1('master/usuarios/' + pa.id, { method: 'PATCH', cookie: master, body: { organizacaoId: pa.organizacao.id, visaoTodo: true } })).statusCode, 409);
  assert.equal((await v1('master/usuarios/' + s.id, { method: 'PATCH', cookie: socio, body: { organizacaoId: s.organizacao.id, visaoTodo: true } })).statusCode, 403);
  assert.equal((await v1('master/usuarios/' + s.id, { method: 'PATCH', cookie: master, body: { organizacaoId: s.organizacao.id, visaoTodo: true } })).statusCode, 200);
  assert.equal(J(await v1('me', { cookie: socio })).master, true);
  const cart = JSON.stringify(J(await v1('master/carteira', { cookie: socio })));
  assert.ok(cart.includes('Cliente do Parceiro A Ltda'));
  await v1('master/usuarios/' + s.id, { method: 'PATCH', cookie: master, body: { organizacaoId: s.organizacao.id, visaoTodo: false } });
  assert.equal((await v1('master/carteira', { cookie: socio })).statusCode, 403);
});
