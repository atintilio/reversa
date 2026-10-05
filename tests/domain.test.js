// Testes P1-1: organização, membros/convites, empresas, casos, análises, revisão e dashboard.
// IDs conforme 04_Test_Plan_Casos_de_Teste.md (AUTHZ-001/002, CASE-001/002).
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

process.env.SESSION_SECRET = 'teste-session-secret';
process.env.RESET_TOKEN_PEPPER = 'teste-pepper';
process.env.APP_BASE_URL = 'https://reversa.argusprime.com.br';
process.env.MS_TENANT_ID = 't'; process.env.MS_CLIENT_ID = 'c'; process.env.MS_CLIENT_SECRET = 's';
process.env.MAIL_FROM = 'atintilio@argusprime.com.br';
process.env.REVERSA_USERS = 'andre:senha-legada-1';
process.env.LEGACY_AUTH_UNTIL = '2099-12-31';

const enviados = [];
global.fetch = async (url, op) => {
  if (String(url).includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
  if (String(url).includes('graph.microsoft.com')) { enviados.push(JSON.parse(op.body)); return new Response('', { status: 202 }); }
  throw new Error('fetch inesperado');
};
const origError = console.error; const logs = [];
console.error = (...a) => logs.push(a.join(' '));

let sql; let api; let H;
const SENHA = 'Senha-forte-123';
const CNPJ = '11.222.333/0001-81';

async function user(email, name, orgId, role, status = 'active') {
  const hash = await bcrypt.hash(SENHA, 4);
  const u = (await sql`insert into users (email, email_normalized, name, password_hash, status) values (${email}, ${email}, ${name}, ${hash}, 'active') returning id`)[0];
  if (orgId) await sql`insert into organization_members (organization_id, user_id, role, status) values (${orgId}, ${u.id}, ${role}, ${status})`;
  return u.id;
}
async function login(email, senha = SENHA) {
  return cookieFrom(await call(H.login, { method: 'POST', body: { usuario: email, senha } }));
}
const v1 = (path, opts = {}) => call(api, { ...opts, url: '/api/v1/' + path, query: opts.query || {} });
const J = (r) => JSON.parse(r.body);

let orgA; let orgB; let admin; let analista; let leitor; let outro;
const teses = [
  { id: 'tema69', nome: 'ICMS na base (Tema 69)', natureza: 'credito', total: { pis: 1000, cofins: 4600 }, totalNoPrazo: { pis: 900, cofins: 4100 }, itens: 8 },
  { id: 'monofasico', nome: 'Monofásicos', natureza: 'credito', total: { pis: 0, cofins: 0 }, totalNoPrazo: { pis: 0, cofins: 0 }, itens: 0 },
  { id: 'insumos', nome: 'Insumos (Tema 779/780)', natureza: 'potencial', total: { pis: 300, cofins: 1400 }, totalNoPrazo: { pis: 300, cofins: 1400 } },
  { id: 'lei14592', nome: 'Risco Lei 14.592', natureza: 'risco', total: { pis: 50, cofins: 230 }, totalNoPrazo: { pis: 50, cofins: 230 } },
  { id: 'tema118', nome: 'Monitoramento', natureza: 'monitorar', total: {}, totalNoPrazo: {} }
];

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]');
  H = { login: freshRequire('api/login'), reset: freshRequire('api/auth/password/reset') };
  orgA = (await sql`select id from organizations order by created_at limit 1`)[0].id; // criada pela migration 002
  orgB = (await sql`insert into organizations (name) values ('Outra Org') returning id`)[0].id;
  admin = await login('admin@argus.com', (await user('admin@argus.com', 'Admin', orgA, 'admin'), SENHA));
  analista = await login('ana@argus.com', (await user('ana@argus.com', 'Ana', orgA, 'analyst'), SENHA));
  leitor = await login('leo@argus.com', (await user('leo@argus.com', 'Leo', orgA, 'viewer'), SENHA));
  outro = await login('bia@outra.com', (await user('bia@outra.com', 'Bia', orgB, 'admin'), SENHA));
});
test.after(() => { console.error = origError; });

test('migration 002 cria a organização padrão Argus Prime', async () => {
  assert.equal((await sql`select name from organizations where id = ${orgA}`)[0].name, 'Argus Prime');
});

test('me devolve organização, papel e permissões do backend', async () => {
  const r = J(await v1('me', { cookie: analista }));
  assert.equal(r.organization.name, 'Argus Prime'); assert.equal(r.role, 'analyst');
  assert.deepEqual(r.permissions, { read: true, write: true, review: false, manageMembers: false });
  assert.equal((await v1('me')).statusCode, 401);
});

let taxpayerId; let caseId;
test('CASE-001 analista cria empresa e caso; auditado', async () => {
  const r = await v1('taxpayers', { method: 'POST', cookie: analista, body: { legalName: 'GTW Transportes Ltda', cnpj: CNPJ, taxRegime: 'Lucro Real' } });
  assert.equal(r.statusCode, 201, r.body);
  ({ id: taxpayerId, caseId } = J(r));
  assert.ok(caseId);
  assert.equal((await v1('taxpayers', { method: 'POST', cookie: analista, body: { legalName: 'Dup', cnpj: CNPJ } })).statusCode, 409);
  assert.equal((await v1('taxpayers', { method: 'POST', cookie: analista, body: { legalName: 'X', cnpj: '11222333000182' } })).statusCode, 400);
  assert.equal((await sql`select count(*)::int n from audit_events where event_type = 'case.created'`)[0].n, 1);
});

test('AUTHZ-002 leitor não cria caso; negação auditada', async () => {
  const r = await v1('cases', { method: 'POST', cookie: leitor, body: { taxpayerId } });
  assert.equal(r.statusCode, 403);
  assert.equal((await sql`select count(*)::int n from audit_events where event_type = 'authz.denied' and outcome = 'denied'`)[0].n, 1);
  assert.equal((await v1('taxpayers', { cookie: leitor })).statusCode, 200);
});

test('AUTHZ-001 isolamento: outra organização não vê nem altera', async () => {
  assert.deepEqual(J(await v1('taxpayers', { cookie: outro })).taxpayers, []);
  assert.equal((await v1(`taxpayers/${taxpayerId}`, { cookie: outro })).statusCode, 404);
  assert.equal((await v1(`cases/${caseId}`, { method: 'PATCH', cookie: outro, body: { stage: 'contrato' } })).statusCode, 404);
  assert.deepEqual(J(await v1('cases', { cookie: outro })).cases, []);
  assert.equal(J(await v1('dashboard', { cookie: outro })).total.cases, 0);
});

let analysisIds;
test('análises do motor: crédito fica pendente de aprovação; potencial e risco separados', async () => {
  const r = await v1('analyses', { method: 'POST', cookie: analista, body: { taxpayer: { cnpj: CNPJ, legalName: 'GTW' }, periodStart: '2021-01', periodEnd: '2025-12', engineVersion: '0.3.0', files: 60, teses } });
  assert.equal(r.statusCode, 201, r.body);
  const b = J(r); assert.equal(b.caseId, caseId, 'reaproveita o caso aberto'); analysisIds = b.analyses;
  assert.equal(analysisIds.length, 4, 'monitoramento não é salvo');
  const rows = await sql`select status, review_status, period_start::text, period_end::text, result_summary from tax_analyses order by created_at`;
  assert.deepEqual(rows.map((x) => x.status).sort(), ['not_applicable', 'potential_to_validate', 'recoverable_pending_approval', 'risk_to_regularize']);
  assert.ok(rows.every((x) => x.review_status === 'pending'));
  assert.equal(rows[0].period_start, '2021-01-01'); assert.equal(rows[0].period_end, '2025-12-31');
  assert.equal(Number((await sql`select estimated_value from tax_cases where id = ${caseId}`)[0].estimated_value), 50);
  const det = J(await v1(`taxpayers/${taxpayerId}`, { cookie: leitor }));
  assert.equal(det.analyses.length, 4); assert.equal(det.cases[0].id, caseId);
});

test('revisão: só admin aprova; aprovação registra evento e muda o dashboard', async () => {
  const credito = (await sql`select id from tax_analyses where status = 'recoverable_pending_approval'`)[0].id;
  assert.equal((await v1(`analyses/${credito}/review`, { method: 'POST', cookie: analista, body: { decision: 'approve' } })).statusCode, 403);
  assert.equal((await v1(`analyses/${credito}/review`, { method: 'POST', cookie: admin, body: { decision: 'reject' } })).statusCode, 400, 'rejeição exige motivo');
  let d = J(await v1('dashboard', { cookie: admin }));
  assert.equal(d.total.pendingApproval, 5000); assert.equal(d.total.approved, 0); assert.equal(d.total.potential, 1700); assert.equal(d.total.risk, 280);
  const r = await v1(`analyses/${credito}/review`, { method: 'POST', cookie: admin, body: { decision: 'approve', note: 'Conferido' } });
  assert.equal(J(r).status, 'recoverable_approved');
  d = J(await v1('dashboard', { cookie: admin }));
  assert.equal(d.total.approved, 5000); assert.equal(d.total.pendingApproval, 0);
  assert.equal((await sql`select count(*)::int n from tax_review_events`)[0].n, 1);
});

test('CASE-002 fase comercial, filtro e paginação estáveis', async () => {
  assert.equal((await v1(`cases/${caseId}`, { method: 'PATCH', cookie: analista, body: { stage: 'xyz' } })).statusCode, 400);
  assert.equal((await v1(`cases/${caseId}`, { method: 'PATCH', cookie: analista, body: { stage: 'apresentado' } })).statusCode, 200);
  await v1('cases', { method: 'POST', cookie: analista, body: { taxpayerId, title: 'Segundo caso' } });
  const p1 = J(await v1('cases', { cookie: leitor, query: { limit: 1, offset: 0 } }));
  const p2 = J(await v1('cases', { cookie: leitor, query: { limit: 1, offset: 1 } }));
  assert.equal(p1.cases.length, 1); assert.equal(p2.cases.length, 1); assert.notEqual(p1.cases[0].id, p2.cases[0].id);
  assert.equal(J(await v1('cases', { cookie: leitor, query: { stage: 'apresentado' } })).cases.length, 1);
  const d = J(await v1('dashboard', { cookie: admin }));
  assert.equal(d.stages.find((s) => s.id === 'apresentado').value, 5000);
  const det = J(await v1(`taxpayers/${taxpayerId}`, { cookie: admin }));
  assert.ok(det.history.some((h) => h.event_type === 'case.stage_changed' && h.metadata.to === 'apresentado'));
});

test('convite: admin convida, e-mail sai pelo Graph, convidado cria senha e entra', async () => {
  assert.equal((await v1('members', { cookie: analista })).statusCode, 403);
  const r = await v1('members', { method: 'POST', cookie: admin, body: { email: 'Novo@Argus.com', name: 'Novo Usuário', role: 'analyst' } });
  assert.equal(r.statusCode, 201, r.body); assert.equal(J(r).emailSent, true);
  const link = new URL(enviados.at(-1).message.body.content.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'));
  assert.equal(link.pathname, '/reset-password.html'); assert.equal(link.searchParams.get('convite'), '1');
  assert.match(enviados.at(-1).message.body.content, /48 horas/);
  const lista = J(await v1('members', { cookie: admin })).members;
  assert.equal(lista.find((m) => m.email === 'Novo@Argus.com').status, 'invited');
  assert.equal(cookieFrom(await call(H.login, { method: 'POST', body: { usuario: 'novo@argus.com', senha: 'qualquer' } })), '', 'conta pendente não entra');
  const token = link.searchParams.get('token');
  assert.equal((await call(H.reset, { method: 'POST', body: { token, password: 'Senha-do-novo-1', passwordConfirmation: 'Senha-do-novo-1' } })).statusCode, 204);
  const ck = await login('novo@argus.com', 'Senha-do-novo-1');
  assert.equal(J(await v1('me', { cookie: ck })).role, 'analyst');
  assert.equal((await v1('members', { method: 'POST', cookie: admin, body: { email: 'novo@argus.com', name: 'X', role: 'viewer' } })).statusCode, 409);
});

test('membros: sem auto-rebaixamento, sem remover o último admin, remoção revoga sessão', async () => {
  const lista = J(await v1('members', { cookie: admin })).members;
  const eu = lista.find((m) => m.isYou); const ana = lista.find((m) => m.email === 'ana@argus.com');
  assert.equal((await v1(`members/${eu.id}`, { method: 'PATCH', cookie: admin, body: { role: 'viewer' } })).statusCode, 409);
  assert.equal((await v1(`members/${eu.id}`, { method: 'DELETE', cookie: admin })).statusCode, 409);
  assert.equal((await v1(`members/${ana.id}`, { method: 'PATCH', cookie: admin, body: { status: 'suspended' } })).statusCode, 200);
  assert.equal((await v1('me', { cookie: analista })).statusCode, 401, 'suspensão revoga sessões');
  assert.equal((await v1(`members/${ana.id}`, { method: 'DELETE', cookie: admin })).statusCode, 200);
  assert.equal((await sql`select status from users where email_normalized = 'ana@argus.com'`)[0].status, 'archived');
  assert.equal((await v1(`members/${ana.id}`, { cookie: outro, method: 'DELETE' })).statusCode, 404, 'admin de outra org não enxerga');
});

test('sessão legada administra a organização padrão, mas não grava análise sem autoria', async () => {
  const leg = cookieFrom(await call(H.login, { method: 'POST', body: { usuario: 'andre', senha: 'senha-legada-1' } }));
  const me = J(await v1('me', { cookie: leg }));
  assert.equal(me.role, 'owner'); assert.equal(me.user.legacy, true);
  assert.equal((await v1('analyses', { method: 'POST', cookie: leg, body: { taxpayer: { cnpj: CNPJ }, periodStart: '2024-01', teses } })).statusCode, 403);
  const r = await v1('members', { method: 'POST', cookie: leg, body: { email: 'atintilio@argusprime.com.br', name: 'André Tintilio', role: 'admin' } });
  assert.equal(r.statusCode, 201, r.body);
});

test('logs sem senha, token ou e-mail', () => {
  const t = logs.join('\n');
  for (const s of [SENHA, 'Senha-do-novo-1', 'novo@argus.com', 'atintilio@argusprime.com.br']) assert.ok(!t.includes(s), s);
});

test('BOOTSTRAP-OWNER: cria owner pendente, envia 1 convite e é idempotente', async () => {
  const { createDb } = require('./helpers');
  const { sql } = await createDb();
  const { bootstrapOwner } = require('../scripts/bootstrap-owner');
  const enviados = [];
  const send = async (m) => { enviados.push(m); };
  assert.equal(await bootstrapOwner(sql, send), 'sent');
  assert.equal(await bootstrapOwner(sql, send), 'pending');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'atintilio@argusprime.com.br');
  const m = (await sql`select m.role, m.status, u.status as us from organization_members m join users u on u.id = m.user_id where u.email_normalized = 'atintilio@argusprime.com.br'`)[0];
  assert.deepEqual([m.role, m.status, m.us], ['owner', 'invited', 'pending']);
  // owner criado ativo com senha aleatória (outro bootstrap), sem nunca ter acessado: ainda recebe o link
  await sql`update users set status = 'active' where email_normalized = 'atintilio@argusprime.com.br'`;
  await sql`update password_reset_tokens set used_at = now()`;
  const falha = async () => { throw new Error('graph'); };
  assert.equal(await bootstrapOwner(sql, falha), 'mail_failed');
  assert.equal((await sql`select count(*)::int as n from password_reset_tokens where used_at is null`)[0].n, 0);
  assert.equal(await bootstrapOwner(sql, send), 'sent');
  assert.equal(enviados.length, 2);
  // depois do primeiro login, nunca mais envia
  const uid = (await sql`select id from users where email_normalized = 'atintilio@argusprime.com.br'`)[0].id;
  await sql`insert into audit_events (actor_user_id, event_type, outcome, metadata) values (${uid}, 'auth.login.succeeded', 'success', '{}'::jsonb)`;
  await sql`update password_reset_tokens set used_at = now()`;
  assert.equal(await bootstrapOwner(sql, send), 'active');
  assert.equal(enviados.length, 2);
});
