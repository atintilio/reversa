#!/usr/bin/env node
'use strict';

// Importação local de pacotes ZIP sem alterar os arquivos originais.
// Usa apenas ferramentas do sistema para evitar dependência nova no cliente.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const MAX_FILES = 10000;
const MAX_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;
const BAD_PATH = /(^|\/)(\.\.?)(\/|$)|^\//;

function die(msg) { console.error(`reversa-cli: ${msg}`); process.exitCode = 1; }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function run(cmd, args) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || `${cmd} failed`).trim());
  return r.stdout;
}
function listZip(zip) {
  return run('unzip', ['-Z1', zip]).split(/\r?\n/).filter(Boolean);
}
function safeEntries(zip) {
  const names = listZip(zip);
  if (names.length > MAX_FILES) throw new Error(`ZIP excede o limite de ${MAX_FILES} arquivos`);
  const files = names.filter((n) => !n.endsWith('/'));
  if (files.some((n) => BAD_PATH.test(n) || n.includes('\\'))) throw new Error('ZIP contém caminho inseguro');
  return files;
}
function kind(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.xml')) return 'XML';
  if (n.endsWith('.pdf')) return 'PDF';
  if (/\.(txt|efd|sped|dec)$/.test(n)) return 'SPED_OR_TEXT';
  if (/\.(xlsx?|csv|ods)$/.test(n)) return 'SPREADSHEET';
  if (/\.(zip)$/.test(n)) return 'ZIP';
  return 'UNKNOWN';
}
function inspect(zip, out) {
  const abs = path.resolve(zip);
  const original = fs.readFileSync(abs);
  const entries = safeEntries(abs).map((name) => {
    const data = cp.spawnSync('unzip', ['-p', abs, name], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
    if (data.status !== 0) throw new Error(`não foi possível ler ${name}`);
    if (data.stdout.length > MAX_UNCOMPRESSED) throw new Error(`arquivo excede o limite: ${name}`);
    return { caminho: name, tipo: kind(name), bytes: data.stdout.length, sha256: sha256(data.stdout) };
  });
  const manifest = { versao: 1, pacote: path.basename(abs), sha256: sha256(original), bytes: original.length, criadoEm: new Date().toISOString(), arquivos: entries };
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ pacote: manifest.pacote, arquivos: entries.length, manifesto: path.resolve(out) }));
}
function importar(zip, dir) {
  const abs = path.resolve(zip);
  const original = fs.readFileSync(abs);
  const entries = safeEntries(abs).map((name) => {
    const data = cp.spawnSync('unzip', ['-p', abs, name], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
    if (data.status !== 0) throw new Error(`não foi possível ler ${name}`);
    if (data.stdout.length > MAX_UNCOMPRESSED) throw new Error(`arquivo excede o limite: ${name}`);
    return { caminho: name, tipo: kind(name), bytes: data.stdout.length, sha256: sha256(data.stdout) };
  });
  const root = path.resolve(dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error(`diretório de destino não está vazio: ${root}`);
  const manifest = { versao: 1, pacote: path.basename(abs), sha256: sha256(original), bytes: original.length, criadoEm: new Date().toISOString(), arquivos: entries };
  fs.mkdirSync(path.join(root, '01-originais'), { recursive: true });
  fs.mkdirSync(path.join(root, '02-extraidos'), { recursive: true });
  fs.copyFileSync(abs, path.join(root, '01-originais', manifest.pacote));
  for (const entry of entries) {
    const destino = path.join(root, '02-extraidos', entry.caminho);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const data = cp.spawnSync('unzip', ['-p', abs, entry.caminho], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
    if (data.status !== 0) throw new Error(`não foi possível extrair ${entry.caminho}`);
    fs.writeFileSync(destino, data.stdout, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ pacote: manifest.pacote, arquivos: entries.length, dossie: root }));
}
function verificar(dir) {
  const root = path.resolve(dir);
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifesto não encontrado: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const original = path.join(root, '01-originais', manifest.pacote);
  if (!fs.existsSync(original) || sha256(fs.readFileSync(original)) !== manifest.sha256) throw new Error('pacote original ausente ou alterado');
  const divergencias = [];
  for (const entry of manifest.arquivos || []) {
    const file = path.join(root, '02-extraidos', entry.caminho);
    if (!fs.existsSync(file)) { divergencias.push({ caminho: entry.caminho, motivo: 'ausente' }); continue; }
    const data = fs.readFileSync(file);
    if (data.length !== entry.bytes || sha256(data) !== entry.sha256) divergencias.push({ caminho: entry.caminho, motivo: 'alterado' });
  }
  if (divergencias.length) throw new Error(`manifesto divergente: ${divergencias.length} arquivo(s)`);
  console.log(JSON.stringify({ ok: true, pacote: manifest.pacote, arquivos: manifest.arquivos.length, dossie: root }));
}
function main(argv) {
  const [command, zip, out] = argv.slice(2);
  if (command === 'ingest') {
    const { ingest } = require('./ingest-documents');
    const [dir, baseUrl, client, cookieFile] = argv.slice(3);
    if (!dir || !baseUrl || !client || !cookieFile) { die('uso: reversa-cli ingest PASTA URL_REVERSA ID_CLIENTE ARQUIVO_DE_SESSAO'); return; }
    try {
      if ((fs.statSync(cookieFile).mode & 0o077) !== 0) throw new Error('Proteja o arquivo de sessão com chmod 600.');
      ingest({ dir, baseUrl, client, cookie: fs.readFileSync(cookieFile, 'utf8').trim() }).then(function (r) { console.log(JSON.stringify(r)); if (r.failed.length) process.exitCode = 1; }).catch(function (e) { die(e.message); });
    } catch (e) { die(e.message); }
    return;
  }
  if (!['zip-inspect', 'zip-import', 'zip-verify'].includes(command) || !zip || (command !== 'zip-verify' && !out)) { die('uso: reversa-cli zip-inspect pacote.zip manifesto.json | zip-import pacote.zip diretorio | zip-verify diretorio'); return; }
  if (command !== 'zip-verify' && !fs.existsSync(zip)) { die(`arquivo não encontrado: ${zip}`); return; }
  try { command === 'zip-inspect' ? inspect(zip, out) : command === 'zip-import' ? importar(zip, out) : verificar(zip); } catch (e) { die(e.message); }
}
main(process.argv);

