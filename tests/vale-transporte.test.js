// Tese T097: crédito de PIS/COFINS sobre vale-transporte (Lucro Real; em disputa; valor informado por competência).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-creditos');
const TD = require('../teses-diagnostico');

const HOJE = new Date('2026-10-19T12:00:00-03:00');
const cab = (regime, extra) => [
  '|0000|006|0|||01012025|31012025|Empresa Teste|11222333000181|SP|3550308||00|9|',
  '|0110|' + regime + '|1|1||',
  '|0140|E1|Matriz|11222333000181|SP||||',
  '|0200|P1|Produto|||UN|00|30049099||',
].concat(extra || []);
const fim = (l) => l.concat(['|9999|' + (l.length + 1) + '|']).join('\n');
const f100vt = '|F100|0|F1||15012025|1000,00|50|1000,00|1,6500|16,50|50|1000,00|7,6000|76,00|13|0|||Vale-transporte empregados|';

test('VT-001 Lucro Real: base = valor pago - desconto do empregado; alíquotas 1,65% e 7,6%', () => {
  const l = M.lerEfdContribuicoes(fim(cab('1')), 'a.txt');
  const r = M.apurar([l], { hoje: HOJE, valeTransporte: { '2025-01': { valor: 10000, descontoEmpregado: 600 } } });
  const t = r.teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t.natureza, 'potencial');
  assert.equal(t.aplicavel, true);
  assert.equal(t.detalhes[0].base, 940000);
  assert.equal(t.total.pis, Math.round(940000 * 1.65 / 100));
  assert.equal(t.total.cofins, Math.round(940000 * 7.6 / 100));
  assert.equal(r.resumo.recuperavel.pis, 0, 'não entra no recuperável');
  assert.ok(r.resumo.potencial.pis > 0);
  assert.match(t.classificacao, /Em disputa/);
});

test('VT-002 número simples e sem desconto: calcula com aviso para confirmar a parcela do empregado', () => {
  const l = M.lerEfdContribuicoes(fim(cab('1')), 'a.txt');
  const t = M.apurar([l], { hoje: HOJE, valeTransporte: { '2025-01': 5000 } }).teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t.detalhes[0].base, 500000);
  assert.match(t.detalhes[0].status, /parcela do empregado/);
});

test('VT-003 Lucro Presumido (cumulativo): sem crédito, com aviso', () => {
  const l = M.lerEfdContribuicoes(fim(cab('2')), 'a.txt');
  const t = M.apurar([l], { hoje: HOJE, valeTransporte: { '2025-01': 5000 } }).teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t.aplicavel, false);
  assert.equal(t.total.pis, 0);
  assert.match(t.avisos.join(' '), /regime cumulativo/);
});

test('VT-004 crédito já lançado no F100 (descrição vale-transporte) é abatido da base', () => {
  const l = M.lerEfdContribuicoes(fim(cab('1', ['|F010|11222333000181|', f100vt])), 'a.txt');
  assert.equal(l.vtApropriado.base, 100000);
  const t = M.apurar([l], { hoje: HOJE, valeTransporte: { '2025-01': { valor: 3000, descontoEmpregado: 0 } } }).teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t.detalhes[0].jaApropriado, 100000);
  assert.equal(t.detalhes[0].base, 200000);
  assert.match(t.detalhes[0].status, /F100/);
});

test('VT-005 competência sem EFD gera aviso; sem entrada a tese não aparece como aplicável', () => {
  const l = M.lerEfdContribuicoes(fim(cab('1')), 'a.txt');
  const t = M.apurar([l], { hoje: HOJE, valeTransporte: { '2025-07': 1000 } }).teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t.aplicavel, false);
  assert.match(t.avisos.join(' '), /2025-07.*sem EFD/);
  const t2 = M.apurar([l], { hoje: HOJE }).teses.find((x) => x.id === 'valeTransporte');
  assert.equal(t2.aplicavel, false);
});

test('VT-006 catálogo de diagnóstico: T097 amarela, em disputa, com documentos e sem precedente vinculante', () => {
  const d = TD.de('T097');
  assert.equal(d.seguranca, 'amarelo');
  assert.equal(d.maturidade, 'em disputa');
  assert.ok(d.docs.length >= 3);
  assert.match(d.precedente, /Sem precedente vinculante/);
});
