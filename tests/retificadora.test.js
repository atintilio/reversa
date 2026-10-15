// Retificadora da EFD-Contribuições (Tema 69) e pré-validador.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-creditos.js');
const R = require('../retificadora-efd.js');
const V = require('../validador-efd.js');

function c170(n, item, vl, icms) {
  const pis = Math.round(vl * 1.65) / 100, cof = Math.round(vl * 7.6) / 100, f = (x) => x.toFixed(2).replace('.', ',');
  // 37 campos: REG ... COD_CTA
  return ['C170', n, item, '', '1', 'UN', f(vl), '0,00', '0', '000', '5102', '', f(vl), '18,00', f(icms), '0,00', '0,00', '0,00', '0', '', '', '0,00', '0,00', '0,00',
    '01', f(vl), '1,6500', '', '', f(pis), '01', f(vl), '7,6000', '', '', f(cof), ''];
}
function arquivo() {
  const L = [
    ['0000', '006', '0', '', '', '01032024', '31032024', 'EMPRESA TESTE LTDA', '11222333000181', 'SC', '4205407', '', '00', '1'],
    ['0001', '0'], ['0110', '1', '1', '1', ''], ['0140', '', 'EMPRESA TESTE LTDA', '11222333000181', 'SC', '', '4205407', '', ''],
    ['0200', 'ITEM1', 'PRODUTO 1', '', '', 'UN', '00', '84719000', '', '', '', ''], ['0200', 'ITEM2', 'PRODUTO 2', '', '', 'UN', '00', '84719000', '', '', '', ''],
    ['0990', 'X'],
    ['A001', '1'], ['A990', 'X'],
    ['C001', '0'], ['C010', '11222333000181', '2'],
    ['C100', '1', '0', 'P1', '55', '00', '1', '10', '4'.repeat(44), '15032024', '15032024', '15000,00', '0', '0,00', '0,00', '15000,00', '9', '0,00', '0,00', '0,00', '15000,00', '2700,00', '0,00', '0,00', '0,00', '247,50', '1140,00', '0,00', '0,00'],
    c170('1', 'ITEM1', 10000, 1800), c170('2', 'ITEM2', 5000, 900),
    ['C990', 'X'],
    ['D001', '1'], ['D990', 'X'], ['F001', '1'], ['F990', 'X'], ['I001', '1'], ['I990', 'X'],
    ['M001', '0'],
    ['M200', '247,50', '100,00', '0,00', '147,50', '0,00', '0,00', '147,50', '0,00', '0,00', '0,00', '0,00', '147,50'],
    ['M205', '08', '810902', '147,50'],
    ['M210', '01', '15000,00', '15000,00', '0,00', '0,00', '15000,00', '1,6500', '', '', '247,50', '0,00', '0,00', '0,00', '0,00', '247,50'],
    ['M600', '1140,00', '400,00', '0,00', '740,00', '0,00', '0,00', '740,00', '0,00', '0,00', '0,00', '0,00', '740,00'],
    ['M605', '08', '217201', '740,00'],
    ['M610', '01', '15000,00', '15000,00', '0,00', '0,00', '15000,00', '7,6000', '', '', '1140,00', '0,00', '0,00', '0,00', '0,00', '1140,00'],
    ['M990', 'X'], ['P001', '1'], ['P990', 'X'], ['1001', '1'], ['1990', 'X']
  ].map((f) => '|' + f.join('|') + '|');
  return R.recontar(L).join('\r\n') + '\r\n';
}

test('RET-001: original sintético passa no pré-validador; arquivo corrompido não passa', () => {
  const v = V.validar(arquivo(), 'orig.txt');
  assert.deepEqual(v.erros, []);
  assert.equal(v.competencia, '2024-03');
  const ruim = arquivo().replace('|9999|', '|9999|1').replace('|M205|08|810902|147,50|', '|M205|08|810902|140,00|');
  const r = V.validar(ruim, 'ruim.txt');
  assert.ok(r.erros.some((x) => /9999/.test(x)));
  assert.ok(r.erros.some((x) => /M205 do campo 08/.test(x)));
});

test('RET-002: retificadora do Tema 69 reduz itens, documento, bloco M e passa no pré-validador', () => {
  const texto = arquivo();
  const lido = M.lerEfdContribuicoes(texto, 'orig.txt');
  const res = M.apurar([lido], { hoje: new Date('2026-10-14') });
  const t69 = res.teses.find((t) => t.id === 'tema69');
  assert.equal(t69.total.pis, 4455); assert.equal(t69.total.cofins, 20520);
  const ajustes = {};
  t69.detalhes.forEach((d) => { if (d.pis || d.cofins) ajustes[d.linha] = { excessoPis: d.excessoPis, excessoCofins: d.excessoCofins, pis: d.pis, cofins: d.cofins, tese: 'tema69' }; });
  const sem = R.gerar(texto, ajustes, {});
  assert.ok(sem.erros.some((x) => /recibo/.test(x)), 'exige o recibo da original');
  const g = R.gerar(texto, ajustes, { recibo: '12.34.56.78.90-12' });
  assert.deepEqual(g.erros, []);
  assert.equal(g.itensAlterados, 2);
  assert.equal(g.apuracao.pis.aRecolherOriginal, 14750); assert.equal(g.apuracao.pis.aRecolherRetificado, 10295); assert.equal(g.apuracao.pis.diferenca, 4455);
  assert.equal(g.apuracao.cofins.diferenca, 20520);
  assert.match(g.texto, /\|0000\|006\|1\|\|12\.34\.56\.78\.90-12\|/);
  assert.match(g.texto, /\|C170\|1\|ITEM1\|.*\|01\|8200,00\|1,6500\|\|\|135,30\|01\|8200,00\|7,6000\|\|\|623,20\|/);
  assert.match(g.texto, /\|M210\|01\|15000,00\|12300,00\|0,00\|0,00\|12300,00\|1,6500\|\|\|202,95\|/);
  assert.match(g.texto, /\|M200\|202,95\|100,00\|0,00\|102,95\|0,00\|0,00\|102,95\|/);
  assert.match(g.texto, /\|M205\|08\|810902\|102,95\|/);
  const v = V.validar(g.texto, 'ret.txt');
  assert.deepEqual(v.erros, []); assert.equal(v.retificadora, true);
});

test('RET-003: créditos descontados maiores que a nova contribuição bloqueiam a geração', () => {
  const texto = arquivo().replace('|M200|247,50|100,00|0,00|147,50|0,00|0,00|147,50|0,00|0,00|0,00|0,00|147,50|', '|M200|247,50|230,00|0,00|17,50|0,00|0,00|17,50|0,00|0,00|0,00|0,00|17,50|')
    .replace('|M205|08|810902|147,50|', '|M205|08|810902|17,50|');
  const res = M.apurar([M.lerEfdContribuicoes(texto, 'x.txt')], { hoje: new Date('2026-10-14') });
  const ajustes = {}; res.teses.find((t) => t.id === 'tema69').detalhes.forEach((d) => { ajustes[d.linha] = d; });
  const g = R.gerar(texto, ajustes, { recibo: '12.34.56.78.90-12' });
  assert.ok(g.erros.some((x) => /créditos descontados/.test(x)));
});
