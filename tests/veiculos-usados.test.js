// T098: veículos usados equiparados à consignação — rateio dos créditos comuns pela margem (SC Cosit 543/2017).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-creditos');
const E = require('../motor-ecd');

const HOJE = new Date('2026-10-19T12:00:00-03:00');
const CNPJ = '11222333000181';
const c100 = (oper, num) => '|C100|' + oper + '|0||55|00|1|' + num + '|CHV' + num + '|15012025|15012025|1000,00||0,00||1000,00|9||||||180,00|||||16,50|76,00|||||';
const c170 = (cod, vl) => '|C170|1|' + cod + '||1|UN|' + vl + '|0,00||000|5102||1000,00|18|180,00|||||||50||||01|1000,00|1,65||||16,50|01|1000,00|7,6||||76,00||||||';
// EFD de janeiro/2025. rec = [ncTrib, ncNt, ncExp, cum, total]; m105/m505 = [tot, cum, nc]
function efd(o) {
  o = o || {};
  const rec = o.rec || ['1200000,00', '0,00', '0,00', '500000,00', '1700000,00'];
  const l = ['|0000|006|0|||01012025|31012025|Empresa Teste|' + CNPJ + '|SP|3550308||00|9|', '|0110|' + (o.reg || '3') + '|' + (o.apro || '2') + '|1||',
    '|0111|' + rec.join('|') + '|', '|0140|E1|Matriz|' + CNPJ + '|SP||||', '|0200|P1|Produto|||UN|00|30049099||', '|0200|V1|Veiculo Usado Sedan|||UN|00|87032310||'];
  if (o.semM105 !== true) {
    const a = o.m105 || ['100000,00', '29,41', '70,59'].map((_, i) => ['100000,00', '29412,00', '70588,00'][i]);
    l.push('|M105|02|53|' + a.join('|') + '|70588,00||');
    l.push('|M505|02|53|' + a.join('|') + '|70588,00||');
  }
  return M.lerEfdContribuicoes(l.concat(o.extra || []).concat(['|9999|99|']).join('\n'), 'efd.txt');
}
const TU = (r) => r.teses.find((t) => t.id === 'veiculosUsados');
const planoEcd = (extra) => E.lerEcd([
  '|0000|LECD|01012025|31012025|Empresa Teste|' + CNPJ + '|SP||||||0|', '|I010|G|9.00|',
  '|I050|01012025|04|A|2|3.1.01||Receita Venda de Veículos Usados|', '|I050|01012025|04|A|2|4.1.01||CMV Veículos Usados|',
  '|I050|01012025|01|A|2|1.1.05||Estoque de Veículos Usados|', '|I150|01012025|31012025|',
  '|I155|3.1.01||0,00|C|0,00|500000,00|500000,00|C|', '|I155|4.1.01||0,00|D|400000,00|0,00|400000,00|D|', '|I155|1.1.05||0,00|D|50000,00|0,00|50000,00|D|',
].concat(extra || []).concat(['|9999|99|']).join('\n'), 'ecd.txt');

test('VU-001 modo manual: exemplo da fonte — coeficiente 70,59% → 92,31% (usados 500.000, custo 400.000, margem 100.000)', () => {
  const t = TU(M.apurar([efd()], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.equal(t.detalhes.length, 1);
  const d = t.detalhes[0];
  assert.equal(d.modo, 'manual'); assert.equal(d.margem, 10000000);
  assert.equal(d.coefDeclarado, '70.59%'); assert.equal(d.coefMargem, '92.31%');
  // base comum 100.000,00 × (92,3077% − 70,5882%) = 21.719,00 ; PIS 1,65% e COFINS 7,6%
  const dif = 1200000 / 1300000 - 1200000 / 1700000;
  assert.equal(d.pis, Math.round(10000000 * dif * 1.65 / 100));
  assert.equal(d.cofins, Math.round(10000000 * dif * 7.6 / 100));
  assert.ok(d.pis > 0 && d.cofins > d.pis);
  assert.equal(t.natureza, 'potencial'); assert.match(d.status, /A validar — tese em disputa/);
  assert.match(t.avisos.join(' '), /Solução de Consulta Cosit 543\/2017/);
});

test('VU-002 ECD lê venda e custo (conta de estoque ignorada); origem ECD', () => {
  const ecd = planoEcd();
  const v = E.veiculosUsados(ecd);
  assert.deepEqual(v.contasVenda.map((c) => c.conta), ['3.1.01']); assert.deepEqual(v.contasCusto.map((c) => c.conta), ['4.1.01']);
  assert.equal(v.porCompetencia['2025-01'].venda, 500000); assert.equal(v.porCompetencia['2025-01'].custo, 400000);
  const t = TU(M.apurar([efd()], { hoje: HOJE, ecd: [ecd] }));
  const d = t.detalhes[0];
  assert.equal(d.modo, 'ECD'); assert.equal(d.origemVenda, 'ECD'); assert.equal(d.origemCusto, 'ECD');
  assert.equal(d.coefMargem, '92.31%');
});

test('VU-003 EFD detecta venda e entrada de veículo usado (NCM 8703 + "usado"); custo estimado pelas entradas, com aviso', () => {
  const l = efd({ extra: [c100('1', '10'), c170('V1', '500000,00'), c100('0', '11'), c170('V1', '400000,00'), c100('1', '12'), c170('P1', '9999,00')] });
  const t = TU(M.apurar([l], { hoje: HOJE }));
  const d = t.detalhes[0];
  assert.equal(d.origemVenda, 'EFD'); assert.equal(d.vendaUsados, 50000000); assert.equal(d.custoUsados, 40000000);
  assert.match(d.status, /Custo estimado pelas entradas/);
  assert.equal(d.coefMargem, '92.31%');
});

test('VU-004 sem diferença: receita cumulativa do 0111 menor que a venda de usados (margem já usada)', () => {
  const l = efd({ rec: ['1200000,00', '0,00', '0,00', '100000,00', '1300000,00'] });
  const t = TU(M.apurar([l], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.equal(t.detalhes[0].pis, 0); assert.equal(t.detalhes[0].cofins, 0);
  assert.match(t.detalhes[0].status, /Sem diferença/);
});

test('VU-005 não aplicável: regime só não cumulativo, ou apropriação direta', () => {
  const a = TU(M.apurar([efd({ reg: '1' })], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.equal(a.aplicavel, false); assert.match(a.avisos.join(' '), /não aplicável: a empresa não está nos dois regimes/);
  const b = TU(M.apurar([efd({ apro: '1' })], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.equal(b.aplicavel, false); assert.match(b.avisos.join(' '), /rateio proporcional/);
});

test('VU-006 sem custo: não calcula e pede o custo; sem 0111: avisa', () => {
  const a = TU(M.apurar([efd()], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000 } } }));
  assert.equal(a.aplicavel, false); assert.match(a.avisos.join(' '), /custo de aquisição não foi identificado/);
  const l = M.lerEfdContribuicoes(['|0000|006|0|||01012025|31012025|Empresa Teste|' + CNPJ + '|SP|3550308||00|9|', '|0110|3|2|1||', '|0140|E1|Matriz|' + CNPJ + '|SP||||', '|9999|99|'].join('\n'), 'x.txt');
  const b = TU(M.apurar([l], { hoje: HOJE, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.match(b.avisos.join(' '), /sem o registro 0111/);
});

test('VU-007 prescrição: competência de mais de 5 anos fica fora do total no prazo; manual sobrescreve ECD', () => {
  const old = new Date('2031-10-19T12:00:00-03:00');
  const t = TU(M.apurar([efd()], { hoje: old, veiculosUsados: { '2025-01': { venda: 500000, custo: 400000 } } }));
  assert.equal(t.detalhes[0].possivelmentePrescrito, true); assert.equal(t.totalNoPrazo.pis, 0); assert.ok(t.total.pis > 0);
  const m = TU(M.apurar([efd()], { hoje: HOJE, ecd: [planoEcd()], veiculosUsados: { '2025-01': { venda: 600000, custo: 500000 } } }));
  assert.equal(m.detalhes[0].origemVenda, 'manual'); assert.equal(m.detalhes[0].vendaUsados, 60000000);
});
