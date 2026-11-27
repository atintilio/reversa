const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('rota documental exige sessão, papel e cliente da organização', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rv-api-test-'));
  const env = process.env.REVERSA_DOCUMENT_ROOT; process.env.REVERSA_DOCUMENT_ROOT = root;
  t.after(async () => { if (env === undefined) delete process.env.REVERSA_DOCUMENT_ROOT; else process.env.REVERSA_DOCUMENT_ROOT = env; await fs.rm(root, { recursive: true, force: true }); });
  const authz = require('../lib/authz'), tax = require('../lib/domain/tax'), audit = require('../lib/audit');
  const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', client = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  t.mock.method(authz, 'context', async req => {
    if (!req.headers.cookie) throw new authz.HttpError(401, 'UNAUTHENTICATED', 'Sessão necessária.');
    return { organization: { id: org }, user: { id: org }, role: req.headers.cookie === 'viewer' ? 'viewer' : 'analyst' };
  });
  t.mock.method(tax, 'getTaxpayer', async (ctx, id) => { if (id !== client) throw new authz.HttpError(404, 'NOT_FOUND', 'Cliente não encontrado.'); return { taxpayer: { id } }; });
  t.mock.method(audit, 'audit', async () => {});
  const routeFile = require.resolve('../api/v1/[...route]'); delete require.cache[routeFile];
  const handler = require(routeFile);
  async function call(method, cookie, id = client, body = {}) {
    let status = 200, result;
    await handler({ method, url: '/api/v1/taxpayers/' + id + '/documents', query: {}, headers: { cookie }, body }, { set statusCode(s) { status = s; }, get statusCode() { return status; }, setHeader() {}, end(b) { result = JSON.parse(b); } });
    return { status, result };
  }
  assert.equal((await call('GET', '')).status, 401);
  assert.equal((await call('GET', 'analyst', org)).status, 404);
  assert.equal((await call('POST', 'viewer')).status, 403);
  const bytes = Buffer.from('|0000|documento');
  const body = { name: 'PISCOFINS_20250101_20250131.txt', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length, offset: 0, data: bytes.toString('base64') };
  const sent = await call('POST', 'analyst', client, body);
  assert.equal(sent.status, 200); assert.equal(sent.result.complete, true);
  const listing = await call('GET', 'analyst');
  assert.equal(listing.result.documents.length, 1); assert.equal(listing.result.inventory.documents.length, 1);
});
