const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

test('comprovante sem avisos aparece na fila sem bloquear o diagnóstico', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const start = html.indexOf('  function renderFila()');
  const ctx = { fila: [{ nome: 'recibo.pdf', tipo: 'comprovante', lido: { competencia: '2022-01', erros: [] } }],
    ingesting: false, $: (() => { const nodes = {}; return (id) => nodes[id] ||= {}; })(),
    efdValidos: () => [{}].slice(0, 0), esValidos: () => [], tecValidos: () => [], darfValidos: () => [],
    dctfValidos: () => [], pgdasValidos: () => [{}], comprovantesValidos: () => [{}],
    ehEs: () => false, ehTec: () => false, ehDarf: () => false, ehDctf: () => false, ehPgdas: () => false,
    esc: String, compFmt: String };
  vm.runInNewContext(html.slice(start, html.indexOf('  function linhaTec', start)), ctx);
  ctx.renderFila();
  assert.match(ctx.$('fila-tab').innerHTML, /recibo\.pdf.*Comprovante/);
  assert.equal(ctx.$('fila-gerar').disabled, false);
});

test('fila aguarda PDF, isola parser defeituoso e deduplica conteúdo', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const start = html.indexOf('  function aoEscolher(lista)');
  const source = html.slice(start, html.indexOf('  function proximoMes', start));
  const controls = {}, fila = [], events = [];
  const ctx = {
    fila, Promise, Uint8Array, TextEncoder, window: {}, MPG: null, ingesting: false,
    estado: { res: null, prev: null },
    $: id => controls[id] ||= {}, toast: msg => events.push(msg), renderFila() {}, limparResultado() {},
    ehZip: () => false, ehPdf: f => f.name.endsWith('.pdf'),
    lerArquivo: async f => ({ nome: f.name, texto: f.content }),
    lerPdfArquivo: async f => [{ nome: f.name, texto: '', pdf: true, content: f.content }],
    extrairPdf: async a => { await Promise.resolve(); if (a.pdf) a.texto = a.content; return a; },
    hashConteudo: async a => crypto.createHash('sha256').update(a.texto).digest('hex'),
    lerNaFila: a => { if (a.texto === 'bad') throw new Error('Arquivo truncado'); assert.ok(a.texto); a.lido = { erros: [], avisos: [] }; }
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  await ctx.aoEscolher([{ name: 'teste.pdf', content: 'pdf extraído' }, { name: 'erro.txt', content: 'bad' }, { name: 'teste.pdf', content: 'outro pdf' }]);
  assert.equal(fila.length, 3);
  assert.equal(fila[1].lido.erros.length, 1);
  assert.equal(fila[2].texto, 'outro pdf');
  await ctx.aoEscolher([{ name: 'copia.pdf', content: 'pdf extraído' }, { name: 'recibo.rec', content: 'recibo' }]);
  assert.equal(fila.length, 4); assert.equal(fila[3].tipo, 'apoio');
  assert.match(events.at(-1), /repetido/);
});
