// Testes de integração P0 (PRD §14): login, logout, reset, catálogo, health, auditoria e flag do legado.
// IDs conforme 04_Test_Plan_Casos_de_Teste.md.
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
let falharEnvio = false;
global.fetch = async (url, op) => {
  if (String(url).includes('login.microsoftonline.com')) return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
  if (String(url).includes('graph.microsoft.com')) {
    if (falharEnvio) return new Response('', { status: 500 });
    enviados.push(JSON.parse(op.body)); return new Response('', { status: 202 });
  }
  throw new Error('fetch inesperado');
};

const logs = [];
const origError = console.error;
console.error = (...a) => { logs.push(a.join(' ')); };

let sql;
const H = {};
const SENHA = 'Senha-forte-123';

test.before(async () => {
  ({ sql } = await createDb());
  freshRequire('lib/db').setSqlForTests(sql);
  for (const n of ['api/login', 'api/logout', 'api/auth/password/forgot', 'api/auth/password/reset', 'api/catalog/opportunities', 'api/health']) H[n] = freshRequire(n);
  const hash = await bcrypt.hash(SENHA, 4);
  await sql`insert into users (email, email_normalized, name, password_hash, status) values ('Ana@Argusprime.com.br', 'ana@argusprime.com.br', 'Ana', ${hash}, 'active')`;
  await sql`insert into opportunity_catalog (opportunity_key, name, category, risk_level, catalog_status, implementation_status, definition, source_refs)
            values ('T001', 'Exclusão do ICMS da base do PIS/COFINS', 'judicial', 'baixo', 'active', 'needs_rule_validation', '{}'::jsonb, '[]'::jsonb)`;
});
test.after(() => { console.error = origError; });

const eventos = async (tipo) => (await sql`select * from audit_events where event_type = ${tipo} order by created_at`);
const linkDoUltimoEmail = () => new URL(enviados.at(-1).message.body.content.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'));

test('AUTH-001 login válido cria sessão persistente e audita', async () => {
  const r = await call(H['api/login'], { method: 'POST', body: { usuario: 'ana@argusprime.com.br', senha: SENHA } });
  assert.equal(r.statusCode, 303); assert.equal(r.headers.location, '/');
  assert.match(cookieFrom(r), /^rv_sessao=s1\./);
  assert.match(String(r.headers['set-cookie']), /HttpOnly; Secure; SameSite=Lax/);
  const ev = await eventos('auth.login.succeeded');
  assert.equal(ev.length, 1); assert.equal(ev[0].metadata.method, 'database');
});

test('AUTH-002/003 senha errada e e-mail inexistente têm a mesma resposta', async () => {
  const a = await call(H['api/login'], { method: 'POST', body: { email: 'ana@argusprime.com.br', password: 'errada' } });
  const b = await call(H['api/login'], { method: 'POST', body: { email: 'ninguem@x.com', password: 'errada' } });
  assert.equal(a.headers.location, '/login.html?erro=1'); assert.equal(b.headers.location, a.headers.location);
  assert.equal(a.headers['set-cookie'], undefined);
  const ev = await eventos('auth.login.failed');
  assert.equal(ev.length, 2);
  assert.ok(!JSON.stringify(ev).includes('ninguem'), 'auditoria não pode conter o identificador');
});

test('logout revoga a sessão e o catálogo deixa de responder', async () => {
  const login = await call(H['api/login'], { method: 'POST', body: { usuario: 'ana@argusprime.com.br', senha: SENHA } });
  const ck = cookieFrom(login);
  assert.equal((await call(H['api/catalog/opportunities'], { cookie: ck })).statusCode, 200);
  const out = await call(H['api/logout'], { method: 'POST', cookie: ck });
  assert.equal(out.headers.location, '/login.html?saiu=1');
  assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
  assert.equal((await call(H['api/catalog/opportunities'], { cookie: ck })).statusCode, 401);
  assert.equal((await eventos('auth.logout')).length, 1);
});

test('catálogo exige sessão (401) e responde com sessão', async () => {
  const sem = await call(H['api/catalog/opportunities']);
  assert.equal(sem.statusCode, 401); assert.equal(JSON.parse(sem.body).error.code, 'UNAUTHENTICATED');
  const ck = cookieFrom(await call(H['api/login'], { method: 'POST', body: { usuario: 'ana@argusprime.com.br', senha: SENHA } }));
  const com = JSON.parse((await call(H['api/catalog/opportunities'], { cookie: ck, query: { risk: 'baixo' } })).body);
  assert.equal(com.version, 'database'); assert.equal(com.opportunities[0].id, 'T001');
});

test('RESET-002 conta inexistente: 202 neutro e nenhum e-mail', async () => {
  const antes = enviados.length;
  const r = await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: 'ninguem@x.com' }, headers: { ip: '10.0.0.2' } });
  assert.equal(r.statusCode, 202); assert.match(JSON.parse(r.body).message, /^Se houver uma conta/);
  assert.equal(enviados.length, antes);
});

test('RESET-001/004/005..012 fluxo completo, token de uso único e revogação de sessões', async () => {
  const sessao = cookieFrom(await call(H['api/login'], { method: 'POST', body: { usuario: 'ana@argusprime.com.br', senha: SENHA } }));
  const r = await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: ' ANA@argusprime.com.br ' }, headers: { ip: '10.0.0.3' } });
  assert.equal(r.statusCode, 202);
  const link = linkDoUltimoEmail();
  assert.equal(link.protocol, 'https:'); assert.equal(link.host, 'reversa.argusprime.com.br'); assert.equal(link.pathname, '/reset-password.html');
  assert.match(enviados.at(-1).message.body.content, /30 minutos/);
  const token = link.searchParams.get('token');
  const guardados = await sql`select encode(token_hash, 'hex') as h from password_reset_tokens`;
  assert.ok(guardados.every((g) => !g.h.includes(token)), 'token não pode ser armazenado em claro');

  const fraca = await call(H['api/auth/password/reset'], { method: 'POST', body: { token, password: 'curta', passwordConfirmation: 'curta' } });
  assert.equal(JSON.parse(fraca.body).error.code, 'PASSWORD_POLICY_FAILED');
  const diverge = await call(H['api/auth/password/reset'], { method: 'POST', body: { token, password: 'Nova-senha-forte-1', passwordConfirmation: 'Nova-senha-forte-2' } });
  assert.equal(JSON.parse(diverge.body).error.code, 'PASSWORD_MISMATCH');
  const adulterado = await call(H['api/auth/password/reset'], { method: 'POST', body: { token: token + 'x', password: 'Nova-senha-forte-1', passwordConfirmation: 'Nova-senha-forte-1' } });
  assert.equal(adulterado.statusCode, 410);

  const [a, b] = await Promise.all([1, 2].map(() => call(H['api/auth/password/reset'], { method: 'POST', body: { token, password: 'Nova-senha-forte-1', passwordConfirmation: 'Nova-senha-forte-1' } })));
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [204, 410], 'RESET-011: exatamente uma requisição vence');
  assert.equal((await call(H['api/auth/password/reset'], { method: 'POST', body: { token, password: 'Nova-senha-forte-1', passwordConfirmation: 'Nova-senha-forte-1' } })).statusCode, 410, 'RESET-007');
  assert.equal((await call(H['api/catalog/opportunities'], { cookie: sessao })).statusCode, 401, 'RESET-012: sessão anterior revogada');
  const novo = await call(H['api/login'], { method: 'POST', body: { usuario: 'ana@argusprime.com.br', senha: 'Nova-senha-forte-1' } });
  assert.equal(novo.headers.location, '/');
  assert.equal((await eventos('auth.password_reset.completed')).filter((e) => e.outcome === 'success').length, 1);
  assert.equal((await eventos('auth.password_reset.email_accepted')).length, 1);
  assert.ok(!logs.join('\n').includes(token), 'RESET-013: token fora dos logs');
});

test('RESET-006 token expirado é rejeitado', async () => {
  await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: 'ana@argusprime.com.br' }, headers: { ip: '10.0.0.4' } });
  const token = linkDoUltimoEmail().searchParams.get('token');
  await sql`update password_reset_tokens set expires_at = now() - interval '1 minute' where used_at is null`;
  const r = await call(H['api/auth/password/reset'], { method: 'POST', body: { token, password: 'Outra-senha-forte-1', passwordConfirmation: 'Outra-senha-forte-1' } });
  assert.equal(r.statusCode, 410); assert.equal(JSON.parse(r.body).error.code, 'RESET_TOKEN_EXPIRED');
});

test('RB-08 falha do Graph invalida o token e mantém resposta neutra', async () => {
  falharEnvio = true;
  const r = await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: 'ana@argusprime.com.br' }, headers: { ip: '10.0.0.5' } });
  falharEnvio = false;
  assert.equal(r.statusCode, 202);
  assert.equal((await sql`select count(*)::int n from password_reset_tokens where used_at is null`)[0].n, 0);
  assert.equal((await eventos('auth.password_reset.email_failed')).length, 1);
});

test('RESET-014/015 rate limit por e-mail e por IP com resposta neutra', async () => {
  await sql`delete from auth_rate_limits`;
  const antes = enviados.length;
  for (let i = 0; i < 6; i++) {
    const r = await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: 'ana@argusprime.com.br' }, headers: { ip: `10.1.0.${i}` } });
    assert.equal(r.statusCode, 202);
  }
  assert.equal(enviados.length - antes, 4, 'no máximo 4 por e-mail em 15 min');
  for (let i = 0; i < 10; i++) await call(H['api/auth/password/forgot'], { method: 'POST', body: { email: `x${i}@y.com` }, headers: { ip: '10.9.9.9' } });
  assert.ok((await eventos('auth.password_reset.rate_limited')).some((e) => e.metadata.bucket === 'ip'));
});

test('legado: aceito dentro da data, recusado com flag "off" ou sem segredo', async () => {
  const ok = await call(H['api/login'], { method: 'POST', body: { usuario: 'andre', senha: 'senha-legada-1' } });
  assert.equal(ok.headers.location, '/');
  const ck = cookieFrom(ok);
  assert.equal((await call(H['api/catalog/opportunities'], { cookie: ck })).statusCode, 200);
  process.env.LEGACY_AUTH_UNTIL = 'off';
  assert.equal((await call(H['api/login'], { method: 'POST', body: { usuario: 'andre', senha: 'senha-legada-1' } })).headers.location, '/login.html?erro=1');
  assert.equal((await call(H['api/catalog/opportunities'], { cookie: ck })).statusCode, 401);
  process.env.LEGACY_AUTH_UNTIL = '2020-01-01';
  assert.equal((await call(H['api/login'], { method: 'POST', body: { usuario: 'andre', senha: 'senha-legada-1' } })).headers.location, '/login.html?erro=1');
  process.env.LEGACY_AUTH_UNTIL = '2099-12-31';
});

test('segredo literal removido: sem SESSION_SECRET/PEPPER o reset falha fechado', () => {
  const { hashToken } = freshRequire('lib/security');
  const s = process.env.SESSION_SECRET, p = process.env.RESET_TOKEN_PEPPER;
  delete process.env.SESSION_SECRET; delete process.env.RESET_TOKEN_PEPPER;
  assert.throws(() => hashToken('x'), /SECRET_NOT_CONFIGURED/);
  process.env.SESSION_SECRET = s; process.env.RESET_TOKEN_PEPPER = p;
});

test('OPS-001 health responde sem autenticação', async () => {
  const r = await call(H['api/health']);
  assert.equal(r.statusCode, 200); assert.deepEqual(JSON.parse(r.body).checks, { runtime: true, database: true, mail: true });
});

test('logs técnicos não contêm senha, token ou e-mail', () => {
  const t = logs.join('\n');
  for (const s of [SENHA, 'Nova-senha-forte-1', 'ana@argusprime.com.br', 'senha-legada-1']) assert.ok(!t.includes(s), s);
});

test('login legado desligado por padrão (sem LEGACY_AUTH_UNTIL)', () => {
  const salvo = process.env.LEGACY_AUTH_UNTIL;
  delete process.env.LEGACY_AUTH_UNTIL;
  try { assert.equal(require('../lib/security').legacyAuthEnabled(), false); }
  finally { process.env.LEGACY_AUTH_UNTIL = salvo; }
});
