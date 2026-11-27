'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { HttpError } = require('./authz');
const CHUNK = 256 * 1024;
const MAX_SIZE = 256 * 1024 * 1024;
const uuid = /^[a-f0-9-]{36}$/i;
const hashPattern = /^[a-f0-9]{64}$/;
function check(ok, message) { if (!ok) throw new HttpError(400, 'INVALID_DOCUMENT', message); }
function createStore(root) {
  function folder(org, client) {
    check(uuid.test(org) && uuid.test(client), 'Identificador de cliente inválido.');
    if (!root || !path.isAbsolute(root)) throw new HttpError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Configure REVERSA_DOCUMENT_ROOT na VPS.');
    const code = path.resolve(__dirname, '..');
    check(path.resolve(root) !== code && !path.resolve(root).startsWith(code + path.sep), 'O armazenamento deve ficar fora do diretório público da aplicação.');
    return path.join(root, org, client);
  }
  async function read(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
  async function offset(dir, size) {
    let n = 0;
    while (n < size) { try { const s = await fs.stat(path.join(dir, n + '.part')); if (s.size !== Math.min(CHUNK, size - n)) break; n += s.size; } catch (e) { if (e.code === 'ENOENT') break; throw e; } }
    return n;
  }
  async function status(org, client, sha) {
    check(hashPattern.test(sha), 'Hash inválido.');
    const dir = path.join(folder(org, client), sha);
    const meta = await read(path.join(dir, 'manifest.json'));
    if (!meta) return { offset: 0, complete: false };
    return { ...meta, offset: meta.complete ? meta.size : await offset(dir, meta.size) };
  }
  async function upload(org, client, body) {
    const { sha256, size, offset: start, data } = body;
    check(hashPattern.test(sha256), 'Hash SHA-256 inválido.');
    check(Number.isSafeInteger(size) && size > 0 && size <= MAX_SIZE, 'Arquivo vazio ou maior que 256 MB.');
    check(Number.isSafeInteger(start) && start >= 0 && start < size && start % CHUNK === 0, 'Posição de envio inválida.');
    check(typeof data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(data) && data.length <= Math.ceil(CHUNK / 3) * 4, 'Bloco inválido.');
    const bytes = Buffer.from(data, 'base64');
    check(bytes.toString('base64') === data && bytes.length === Math.min(CHUNK, size - start), 'Tamanho de bloco divergente.');
    const name = String(body.name || '');
    check(name.length > 0 && name.length <= 255 && !/[\x00-\x1f/\\]/.test(name), 'Nome de arquivo inválido.');
    const dir = path.join(folder(org, client), sha256);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const manifest = path.join(dir, 'manifest.json');
    let meta = await read(manifest);
    if (!meta) {
      meta = { sha256, size, names: [name], complete: false, receivedAt: new Date().toISOString() };
      try { await fs.writeFile(manifest, JSON.stringify(meta), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; meta = await read(manifest); }
    }
    check(meta.size === size, 'Tamanho divergente para o mesmo hash.');
    if (meta.complete) {
      if (!meta.names.includes(name)) {
        meta.names.push(name);
        const temp = manifest + '.' + crypto.randomUUID();
        await fs.writeFile(temp, JSON.stringify(meta), { mode: 0o600 });
        await fs.rename(temp, manifest);
      }
      return { ...meta, offset: size, duplicate: true };
    }
    const part = path.join(dir, start + '.part');
    try { await fs.writeFile(part, bytes, { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; check((await fs.readFile(part)).equals(bytes), 'Bloco já recebido com conteúdo diferente.'); }
    const next = await offset(dir, size);
    if (next === size) {
      // Um arquivo por hash impede sobrescrever versões originais ou retificadoras.
      let lock;
      try { lock = await fs.open(path.join(dir, 'finalizing'), 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') throw new HttpError(409, 'DOCUMENT_BUSY', 'Finalização em andamento; tente novamente.'); throw e; }
      try {
        const h = crypto.createHash('sha256'), output = await fs.open(path.join(dir, 'content.tmp'), 'w', 0o600);
        try { for (let n = 0; n < size; n += CHUNK) { const b = await fs.readFile(path.join(dir, n + '.part')); h.update(b); await output.write(b); } } finally { await output.close(); }
        check(h.digest('hex') === sha256, 'Integridade divergente: hash do arquivo recebido não confere.');
        await fs.rename(path.join(dir, 'content.tmp'), path.join(dir, 'content'));
        const input = await fs.open(path.join(dir, 'content'), 'r');
        try {
          const sample = Buffer.alloc(Math.min(size, 65536));
          await input.read(sample, 0, sample.length, 0);
          meta.identification = require('./document-inventory').classify({ name, buffer: sample });
        } finally { await input.close(); }
        meta.complete = true; meta.completedAt = new Date().toISOString();
        await fs.writeFile(path.join(dir, 'manifest.tmp'), JSON.stringify(meta), { mode: 0o600 });
        await fs.rename(path.join(dir, 'manifest.tmp'), manifest);
      } finally { await lock.close(); await fs.unlink(path.join(dir, 'finalizing')); }
    }
    return { ...meta, offset: next };
  }
  async function list(org, client) {
    const dir = folder(org, client);
    let names; try { names = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const items = [];
    for (const name of names.filter(n => hashPattern.test(n))) { const meta = await status(org, client, name); items.push(meta); }
    return items;
  }
  async function report(org, client, body) {
    const dir = folder(org, client);
    const previous = await read(path.join(dir, 'inventory.json')) || { expected: [], consultations: [] };
    const merge = (old, next) => [...new Map(old.concat(next || []).map(x => [x.tipo + '|' + x.competencia, x])).values()];
    if (body) check((body.expected === undefined || Array.isArray(body.expected)) && (body.consultations === undefined || Array.isArray(body.consultations)), 'Formato de inventário inválido.');
    if (body) check([...(body.expected || []), ...(body.consultations || [])].every(x => x && typeof x === 'object' && typeof x.tipo === 'string' && typeof x.competencia === 'string'), 'Entrada de inventário inválida.');
    const expected = body ? merge(previous.expected, body.expected) : previous.expected;
    const consultations = body ? merge(previous.consultations, body.consultations) : previous.consultations;
    check(Array.isArray(expected) && expected.length <= 1200 && Array.isArray(consultations) && consultations.length <= 1200, 'Inventário excede os limites.');
    check(expected.every(x => x && typeof x.tipo === 'string' && /^[a-z_]{2,40}$/.test(x.tipo) && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.competencia)), 'Obrigação ou competência inválida.');
    const documents = (await list(org, client)).filter(d => d.complete).map(d => ({ ...d.identification, sha256: d.sha256, size: d.size, name: d.names[0] }));
    const result = require('./document-inventory').reconcile(documents, expected, consultations);
    if (body) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const temp = path.join(dir, 'inventory.' + crypto.randomUUID() + '.tmp');
      await fs.writeFile(temp, JSON.stringify({ expected, consultations, result, updatedAt: new Date().toISOString() }), { mode: 0o600 });
      await fs.rename(temp, path.join(dir, 'inventory.json'));
    }
    return result;
  }
  return { status, upload, list, report };
}
module.exports = { createStore, CHUNK, MAX_SIZE };
