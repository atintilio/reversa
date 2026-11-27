const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStore, CHUNK } = require('../lib/document-store');
const { ingest } = require('../scripts/ingest-documents');
const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', client = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

test('retoma blocos, confere integridade e isola organizações', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rv-doc-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createStore(root), b = Buffer.alloc(CHUNK + 17, 42), hash = sha(b);
  const body = { name: 'Original.txt', sha256: hash, size: b.length, offset: 0, data: b.subarray(0, CHUNK).toString('base64') };
  assert.equal((await store.upload(org, client, body)).complete, false);
  assert.equal((await store.status(org, client, hash)).offset, CHUNK);
  await store.upload(org, client, body); // Repetição de bloco após resposta perdida.
  assert.equal((await store.upload(org, client, { ...body, offset: CHUNK, data: b.subarray(CHUNK).toString('base64') })).complete, true);
  assert.deepEqual(await fs.readFile(path.join(root, org, client, hash, 'content')), b);
  assert.equal((await store.list(client, org)).length, 0);
  assert.equal((await store.upload(org, client, { ...body, name: 'Copia.txt' })).duplicate, true);
  assert.equal((await store.list(org, client)).length, 1);
  await assert.rejects(store.upload(org, client, { ...body, name: '../escape.txt' }), /Nome/);
  await assert.rejects(store.upload(org, client, { ...body, sha256: '0'.repeat(64), size: 1, data: 'YQ==' }), /Integridade/);
  assert.equal((await store.status(org, client, '0'.repeat(64))).complete, false);
});

test('CLI envia pasta, continua após falha e reexecução retoma sem duplicar', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rv-ingest-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'input'); await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, '1-vazio.pdf'), '');
  await fs.writeFile(path.join(dir, '2-PISCOFINS_20250101_20250131.txt'), '|0000|arquivo');
  const store = createStore(path.join(root, 'store'));
  const request = async (url, opts) => {
    assert.equal(opts.headers.Cookie, 'rv_sessao=test');
    const u = new URL(url);
    const value = opts.method === 'POST' ? await store.upload(org, client, JSON.parse(opts.body)) : await store.status(org, client, u.searchParams.get('sha256'));
    return { ok: true, json: async () => value };
  };
  const options = { dir, baseUrl: 'https://reversa.example', client, cookie: 'rv_sessao=test', request, log: () => {} };
  const first = await ingest(options);
  assert.equal(first.failed.length, 1); assert.equal(first.received.length, 1);
  const second = await ingest(options);
  assert.equal(second.duplicates.length, 1); assert.equal((await store.list(org, client)).length, 1);
  await assert.rejects(ingest({ ...options, baseUrl: 'http://example.com' }), /HTTPS/);
});

test('lacunas ficam registradas e não impedem recebimento de outro documento', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rv-gap-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createStore(root);
  const result = await store.report(org, client, { expected: [{ tipo: 'dctfweb', competencia: '2025-01' }] });
  assert.equal(result.gaps[0].estado, 'documento_ausente');
  const again = await createStore(root).report(org, client);
  assert.equal(again.gaps[0].competencia, '2025-01');
  await assert.rejects(createStore().list(org, client), /REVERSA_DOCUMENT_ROOT/);
});
