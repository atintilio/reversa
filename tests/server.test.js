// Servidor próprio (VPS): cabeçalhos, guarda de login, bloqueios de estáticos, rotas /api e rewrite do host Gov.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createDb } = require('./helpers');

const ROOT = path.join(__dirname, '..');
let srv; let port;

test.before(async () => {
  const { sql } = await createDb();
  require('../lib/db').setSqlForTests(sql);
  const { createServer } = require('../server');
  srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  port = srv.address().port;
});
test.after(() => srv.close());

function get(p, { host = 'reversa.argusprime.com.br', method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...headers } }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

test('MATCHER da guarda é idêntico ao do middleware.js (Vercel)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'middleware.js'), 'utf8');
  const fromMw = src.match(/matcher: ('(?:[^'\\]|\\.)*')/)[1];
  const fromGuard = fs.readFileSync(path.join(ROOT, 'lib', 'page-guard.js'), 'utf8').match(/const MATCHER = ('(?:[^'\\]|\\.)*');/)[1];
  assert.equal(fromGuard, fromMw);
});

test('página protegida sem sessão redireciona ao login, com cabeçalhos de segurança', async () => {
  for (const p of ['/', '/clientes.html', '/gov.html']) {
    const r = await get(p);
    assert.equal(r.status, 303, p);
    assert.equal(r.headers.location, '/login.html');
  }
  const r = await get('/login.html');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
});

test('estáticos públicos servem; código de servidor, configuração e caminhos perigosos não', async () => {
  assert.equal((await get('/robots.txt')).status, 200);
  for (const p of ['/lib/db.js', '/api/health.js', '/db/migrations/001_init.sql', '/package.json', '/server.js', '/middleware.js', '/vercel.json', '/.env.example', '/tests/helpers.js', '/coleta/db/001_controle.sql', '/%2e%2e/etc/passwd', '/assets/..%2f..%2fpackage.json', '/login.html%00.js']) {
    const r = await get(p);
    assert.ok([303, 400, 404].includes(r.status), `${p} -> ${r.status}`);
    if (r.status === 200) assert.fail(p);
  }
});

test('rewrite do host Gov: "/" vira gov.html (após a guarda)', async () => {
  const r = await get('/', { host: 'reversa-gov.argusprime.com.br' });
  assert.equal(r.status, 303); // sem sessão, a guarda vem primeiro, como no middleware da Vercel
});

test('métodos não-GET em estáticos são recusados', async () => {
  const r = await get('/login.html', { method: 'POST' });
  assert.equal(r.status, 405);
});

test('/api/health responde com o banco; rota inexistente e traversal em /api dão 404', async () => {
  const ok = await get('/api/health');
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).checks.database, true);
  for (const p of ['/api/nao-existe', '/api/%2e%2e/server', '/api/[...route]']) {
    const r = await get(p);
    assert.notEqual(r.status, 200, p);
  }
});

test('API v1 sem sessão devolve 401 (autenticação no backend continua valendo)', async () => {
  const r = await get('/api/v1/me');
  assert.ok([401, 403].includes(r.status), String(r.status));
});
