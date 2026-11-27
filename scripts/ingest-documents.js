#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const CHUNK = 256 * 1024;
async function filesIn(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}
async function ingest({ dir, baseUrl, client, cookie, request = fetch, log = console.log }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new Error('Use HTTPS para enviar documentos.');
  if (!/^[a-f0-9-]{36}$/i.test(client)) throw new Error('Informe o ID do cliente no Reversa.');
  if (!cookie || /[\r\n]/.test(cookie)) throw new Error('Sessão inválida.');
  const endpoint = new URL('/api/v1/taxpayers/' + client + '/documents', base);
  async function api(url, body) {
    let error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await request(url, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(60000) });
        const json = await r.json();
        if (!r.ok) { const e = new Error(json.error?.message || 'HTTP ' + r.status); e.status = r.status; throw e; }
        return json;
      } catch (e) { error = e; if (e.status && e.status !== 409 && e.status < 500) break; }
    }
    throw error;
  }
  const files = await filesIn(path.resolve(dir));
  const result = { received: [], failed: [], duplicates: [] };
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const size = (await fs.stat(file)).size;
      if (!size || size > 256 * 1024 * 1024) throw new Error('Arquivo vazio ou maior que 256 MB.');
      const h = crypto.createHash('sha256'), handle = await fs.open(file, 'r');
      try {
        for await (const b of handle.createReadStream({ autoClose: false })) h.update(b);
        const sha256 = h.digest('hex');
        let state = await api(endpoint.href + '?sha256=' + sha256);
        if (state.complete) result.duplicates.push({ file, sha256 });
        else {
          let start = state.offset || 0;
          if (!Number.isSafeInteger(start) || start < 0 || start >= size || start % CHUNK !== 0) throw new Error('Posição de retomada inválida no servidor.');
          while (start < size) {
            const buffer = Buffer.alloc(Math.min(CHUNK, size - start));
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
            if (bytesRead !== buffer.length) throw new Error('Arquivo alterado durante o envio.');
            state = await api(endpoint.href, { name: path.basename(file), size, sha256, offset: start, data: buffer.toString('base64') });
            if (state.offset !== start + buffer.length) throw new Error('Recebimento do bloco não confirmado.');
            start = state.offset;
          }
          if (!state.complete) throw new Error('Finalização não confirmada.');
          result.received.push({ file, sha256, size });
        }
      } finally { await handle.close(); }
      log(`${i + 1}/${files.length}: recebido ${path.basename(file)}`);
    } catch (e) { result.failed.push({ file, reason: e.message }); log(`${i + 1}/${files.length}: falha ${path.basename(file)}: ${e.message}`); }
  }
  return result;
}
async function main(argv) {
  const [dir, baseUrl, client, cookieFile] = argv;
  if (!dir || !baseUrl || !client || !cookieFile) throw new Error('Uso: node scripts/ingest-documents.js PASTA URL_REVERSA ID_CLIENTE ARQUIVO_DE_SESSAO');
  const stat = await fs.stat(cookieFile);
  if ((stat.mode & 0o077) !== 0) throw new Error('Proteja o arquivo de sessão com chmod 600.');
  const cookie = (await fs.readFile(cookieFile, 'utf8')).trim();
  const result = await ingest({ dir, baseUrl, client, cookie });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length) process.exitCode = 1;
}
module.exports = { ingest, filesIn, CHUNK };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
