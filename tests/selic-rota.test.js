// GET /api/v1/selic com fetch SIMULADO (sem rede). Taxas fictícias, só para exercitar a rota.
process.env.SESSION_SECRET = 'selic-test-secret';
process.env.APP_BASE_URL = 'https://reversa.test';
process.env.LEGACY_AUTH_UNTIL = 'off';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createDb, freshRequire, call, cookieFrom } = require('./helpers');

let db, api, cookie, fontes;
const original = globalThis.fetch;
const v1 = (o = {}) => call(api, { url: '/api/v1/selic', cookie, ...o });
const resp = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => body });
// fictícias
const JSON_OK = [{ data: '01/02/2024', valor: '1.00' }, { data: '01/03/2024', valor: '0.50' }];
const CSV_OK = '"data";"valor"\r\n"01/02/2024";"1,00"\r\n"01/03/2024";"0,50"\r\n';
function simular({ json = true, csv = true } = {}) {
  globalThis.fetch = async (url) => {
    if (/formato=json/.test(url)) return json ? resp(JSON_OK) : resp('x', false, 500);
    if (/formato=csv/.test(url)) return csv ? resp(CSV_OK) : (() => { throw new Error('rede'); })();
    throw new Error('url inesperada ' + url);
  };
}

test.before(async () => {
  let sql; ({ sql, db } = await createDb()); freshRequire('lib/db').setSqlForTests(sql);
  api = freshRequire('api/v1/[...route]'); fontes = freshRequire('lib/selic-fontes');
  const org = (await sql`select id from organizations where kind = 'plataforma'`)[0].id;
  const hash = await bcrypt.hash('senha-de-teste', 4);
  const uid = (await sql`insert into users (email,email_normalized,name,password_hash,status) values ('s@argus.test','s@argus.test','s',${hash},'active') returning id`)[0].id;
  await sql`insert into organization_members (organization_id,user_id,role,status) values (${org},${uid},'viewer','active')`;
  cookie = cookieFrom(await call(freshRequire('api/login'), { method: 'POST', body: { usuario: 's@argus.test', senha: 'senha-de-teste' } }));
});
test.after(async () => { globalThis.fetch = original; await db.close(); });
test.beforeEach(() => fontes.limparCache());

test('exige autenticação', async () => {
  simular();
  assert.equal((await v1({ cookie: '' })).statusCode, 401);
});

test('fontes ativas ok: consenso, cabeçalho de cache e aviso de compensação', async () => {
  simular();
  const r = await v1(); const b = JSON.parse(r.body);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['cache-control'], 's-maxage=43200, stale-while-revalidate=86400');
  assert.deepEqual(b.tabela, { '2024-02': 1, '2024-03': 0.5 });
  assert.equal(b.ultimaCompetencia, '2024-03'); assert.equal(b.uso, 'preliminar');
  assert.ok(b.fontes.every((f) => f.ok)); assert.deepEqual(b.divergencias, []);
  assert.match(b.aviso, /tabela oficial da Receita Federal/); assert.ok(b.atualizadoEm);
});

test('uma fonte falha: segue com a outra (mês de fonte única)', async () => {
  simular({ csv: false });
  const r = await v1(); const b = JSON.parse(r.body);
  assert.equal(r.statusCode, 200);
  assert.equal(b.fontes.filter((f) => f.ok).length, 1); assert.equal(b.tabela['2024-03'], 0.5);
});

test('cache em memória: segunda chamada não busca de novo', async () => {
  let n = 0; simular(); const f = globalThis.fetch; globalThis.fetch = async (u) => { n++; return f(u); };
  await v1(); const depois = n; await v1();
  assert.equal(n, depois);
});

test('todas falham: 503 com mensagem clara e sem cache de sucesso', async () => {
  simular({ json: false, csv: false });
  const r = await v1(); const b = JSON.parse(r.body);
  assert.equal(r.statusCode, 503); assert.equal(b.error.code, 'SELIC_UNAVAILABLE');
  assert.match(b.error.message, /Selic indisponível — valores sem atualização/);
  simular(); assert.equal((await v1()).statusCode, 200); // recupera na próxima chamada
});
