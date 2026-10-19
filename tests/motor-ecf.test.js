const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-ecf');

const LINHAS_ADICAO = [['MULTAS PUNITIVAS FISCAIS E DE TRÂNSITO', 50], ['DOAÇÕES SEM AMPARO LEGAL', 40], ['DESPESAS PARTICULARES DE SÓCIOS', 30],
  ['PROVISÃO DE FÉRIAS E 13º SALÁRIO', 60], ['PERDAS NO RECEBIMENTO DE CRÉDITOS', 25], ['MULTAS CONTRATUAIS COMPENSATÓRIAS', 15]];
function ecf(detalhe) {
  const L = ['|0000|LECF|01012025|31122025|Teste S.A.|99303403000177|0|', '|M030|001|01012025|31032025|'];
  L.push('|M300|1|RESULTADO|2050000,00|', '|M300|2|ADIÇÕES|220000,00|');
  if (detalhe) LINHAS_ADICAO.forEach(([d, v], i) => L.push(`|M300|2.${i + 1}|${d}|${v}000,00|`));
  L.push('|M300|3|EXCLUSÕES|120000,00|', '|N500|BASE IRPJ 1T|2150000,00|', '|N630|IRPJ A PAGAR 1T|531500,00|', '|N670|CSLL A PAGAR 1T|193500,00|');
  return L.join('\r\n');
}
test('recalcula IRPJ e CSLL do trimestre e confere com o declarado', () => {
  assert.equal(M.irpj(2150000), 531500); assert.equal(M.csll(2150000), 193500);
});
test('só as despesas dedutíveis adicionadas por erro geram oportunidade: R$ 34.000 no trimestre', () => {
  const r = M.apurar([M.lerEcf(ecf(true), 'a.txt')], { hoje: '2026-10-19' });
  assert.equal(r.avisos.length, 0);
  assert.equal(r.conferencia[0].confere, true);
  const l = r.teses[0].linhas[0];
  assert.equal(l.despesaIndevida, 100000); assert.equal(l.irpj, 25000); assert.equal(l.csll, 9000); assert.equal(r.total.valor, 34000);
  assert.equal(l.noPrazo, true); assert.equal(l.vencimentoEstimado, '2025-04-30');
  assert.deepEqual(r.aClassificar, []);
});
test('sem detalhe das adições não calcula e avisa', () => {
  const r = M.apurar([M.lerEcf(ecf(false), 'b.txt')], { hoje: '2026-10-19' });
  assert.equal(r.teses.length, 0); assert.match(r.avisos[0], /sem detalhe/);
});
test('descrição desconhecida vai para a classificar e não entra no valor', () => {
  const t = ecf(true).replace('DOAÇÕES SEM AMPARO LEGAL', 'OUTRA ADICAO QUALQUER');
  const r = M.apurar([M.lerEcf(t, 'c.txt')], { hoje: '2026-10-19' });
  assert.equal(r.aClassificar.length, 1); assert.equal(r.total.valor, 34000);
});
test('fora do prazo de 5 anos não conta no valor no prazo', () => {
  const r = M.apurar([M.lerEcf(ecf(true), 'd.txt')], { hoje: '2031-01-01' });
  assert.equal(r.total.valor, 34000); assert.equal(r.total.valorNoPrazo, 0);
});
