const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-ecf');

const LINHAS_ADICAO = [['MULTAS PUNITIVAS FISCAIS E DE TRÂNSITO', 50], ['DOAÇÕES SEM AMPARO LEGAL', 40], ['DESPESAS PARTICULARES DE SÓCIOS', 30],
  ['PROVISÃO DE FÉRIAS E 13º SALÁRIO', 60], ['PERDAS NO RECEBIMENTO DE CRÉDITOS', 25], ['MULTAS CONTRATUAIS COMPENSATÓRIAS', 15]];
// ECF no leiaute 12 (Manual de Orientacao da ECF):
//   0000       : 4 CNPJ | 5 NOME | 10 DT_INI | 11 DT_FIN
//   M030 / N030: 2 DT_INI | 3 DT_FIN | 4 PER_APUR
//   M300 / M350: 2 CODIGO | 3 DESCRICAO | 4 TIPO_LANCAMENTO (R/L/A/E) | 5 IND_RELACAO | 6 VALOR
//   N500/N630/N650/N670: 2 CODIGO | 3 DESCRICAO | 4 VALOR
function ecf(detalhe, comM350) {
  const L = [
    '|0000|LECF|0011|99303403000177|Teste S.A.|0|0|||01012025|31122025|N||0||',
    '|M030|01012025|31032025|T01|',
    '|M300|1|ATIVIDADE GERAL|R|||',
    '|M300|2|Lucro Liquido Antes do IRPJ|L||2050000,00||',
    '|M300|5|ADIÇÕES|R||220000,00||'
  ];
  if (detalhe) LINHAS_ADICAO.forEach(([d, v], i) => L.push(`|M300|6.${i + 1}|${d}|A|3|${v}000,00|LANCAMENTO DE ADICAO|`));
  L.push('|M300|94|EXCLUSÕES|R||120000,00||');
  if (comM350) L.push('|M350|2|Lucro Antes da CSLL|L||2050000,00||', '|M350|5|ADIÇÕES|R||220000,00||');
  L.push('|N030|01012025|31032025|T01|',
    '|N500|1|Valor da base de cálculo do IRPJ|2150000,00|',
    '|N630|26|IMPOSTO DE RENDA A PAGAR|531500,00|',
    '|N670|21|CSLL A PAGAR|193500,00|');
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

// ---- correções da revisão independente
const comItem = (desc, v) => ecf(true).replace('MULTAS CONTRATUAIS COMPENSATÓRIAS|A|3|15000,00|LANCAMENTO DE ADICAO|', desc + '|A|3|' + v + '|LANCAMENTO DE ADICAO|');
test('contingência trabalhista, PDD e reversão não viram oportunidade', () => {
  for (const d of ['PROVISÃO PARA CONTINGÊNCIA CÍVEL PROC 13ª VARA', 'PROVISÃO PARA PERDAS NO RECEBIMENTO DE CRÉDITOS', 'REVERSÃO DE PROVISÃO DE FÉRIAS E 13º SALÁRIO', 'MULTA PUNITIVA CONTRATUAL']) {
    const r = M.apurar([M.lerEcf(comItem(d, '15000,00'), 'x')], { hoje: '2026-10-19' });
    assert.equal(r.total.valor, 34000 - 15000 * 0.34 + 0, d); // o item de 15 mil sai do cálculo
  }
});
test('valor com ponto decimal é lido como decimal e avisa', () => {
  const l = M.lerEcf(comItem('MULTAS CONTRATUAIS COMPENSATÓRIAS', '15000.00'), 'p');
  assert.equal(l.trimestres[0].adicoes[5].valor, 15000); assert.match(l.avisos.join(), /ponto decimal/);
});
test('período não trimestral (ECF anual) não é calculado', () => {
  const t = ecf(true).replace('|M030|01012025|31032025|T01|', '|M030|01012025|31122025|A00|');
  const r = M.apurar([M.lerEcf(t, 'anual')], { hoje: '2026-10-19' });
  assert.equal(r.total.valor, 0); assert.match(r.avisos.join(), /não é trimestral/);
});
test('sem pagamento declarado o trimestre vai para revisão e não soma', () => {
  const t = ecf(true).replace('|N630|26|IMPOSTO DE RENDA A PAGAR|531500,00|', '');
  const r = M.apurar([M.lerEcf(t, 'sempago')], { hoje: '2026-10-19' });
  assert.equal(r.total.valor, 0); assert.equal(r.revisao.length, 1);
});
test('o mesmo arquivo enviado duas vezes não dobra', () => {
  const r = M.apurar([M.lerEcf(ecf(true), 'a'), M.lerEcf(ecf(true), 'b')], { hoje: '2026-10-19' });
  assert.equal(r.total.valor, 34000);
});
test('último dia do prazo ainda conta e sem 0000 não quebra', () => {
  assert.equal(M.apurar([M.lerEcf(ecf(true), 'a')], { hoje: '2030-04-30T15:00:00Z' }).total.valorNoPrazo, 34000);
  assert.doesNotThrow(() => M.apurar([M.lerEcf('|M300|1|R|100,00|', 'z')]));
});
test('adições indedutíveis aparecem na lista de mantidas', () => {
  assert.equal(M.apurar([M.lerEcf(ecf(true), 'a')], { hoje: '2026-10-19' }).adicoesMantidas.length, 3);
});

// ---- leiaute oficial 12 (Manual de Orientacao da ECF): as posicoes conferem com o manual
test('le o 0000 no leiaute oficial: CNPJ no campo 04 e o periodo nos campos 10 e 11', () => {
  const l = M.lerEcf(ecf(true), 'a.txt');
  assert.equal(l.cnpj, '99303403000177', 'CNPJ vem do campo 04 do 0000');
  assert.equal(l.empresa, 'Teste S.A.', 'nome vem do campo 05 do 0000');
  assert.equal(l.ano, 2025, 'ano vem do fim do periodo (campo 11 do 0000)');
  assert.equal(l.dtIni, '01012025');
  assert.equal(l.dtFin, '31122025');
});
test('le o M030 no leiaute oficial: DT_INI, DT_FIN e PER_APUR', () => {
  const l = M.lerEcf(ecf(true), 'a.txt');
  assert.deepEqual(l.periodos.map((p) => ({ cod: p.cod, ini: p.ini, fin: p.fin })),
    [{ cod: 'T01', ini: '01012025', fin: '31032025' }]);
});
test('le o M300 no leiaute oficial: valor no campo 06 e tipo pelo TIPO_LANCAMENTO', () => {
  const l = M.lerEcf(ecf(true), 'a.txt');
  assert.equal(l.trimestres.length, 1, 'a linha ATIVIDADE GERAL abre um trimestre so');
  const t = l.trimestres[0];
  assert.equal(t.resultado, 2050000, 'valor do campo 06 da linha de resultado');
  assert.equal(t.adicoesIrpjTotal, 220000, 'total de ADICOES (tipo R)');
  assert.equal(t.adicoes.length, 6, 'as seis adicoes detalhadas (tipo A)');
  assert.equal(t.adicoes[0].descricao, 'MULTAS PUNITIVAS FISCAIS E DE TRÂNSITO');
  assert.equal(t.exclusoes, 120000, 'total de EXCLUSOES (tipo R)');
});
test('le o N500/N630/N670 no leiaute oficial: valor no campo 04 e "a pagar" pelo codigo', () => {
  const l = M.lerEcf(ecf(true), 'a.txt');
  const t = l.trimestres[0];
  assert.equal(t.baseIrpj, 2150000, 'N500 codigo 1 = base do IRPJ');
  assert.equal(t.pagoIrpj, 531500, 'N630 "IMPOSTO DE RENDA A PAGAR" (codigo 26)');
  assert.equal(t.pagoCsll, 193500, 'N670 "CSLL A PAGAR" (codigo 21)');
});
test('com M350 no leiaute oficial, a base da CSLL vem do M350', () => {
  const l = M.lerEcf(ecf(true, true), 'a.txt');
  const t = l.trimestres[0];
  assert.equal(t.resultadoCsll, 2050000, 'M350 "Lucro Antes da CSLL" (tipo L)');
  assert.equal(t.adicoesCsllTotal, 220000, 'M350 ADICOES (tipo R)');
  const r = M.apurar([l], { hoje: '2026-10-19' });
  assert.equal(r.conferencia[0].confere, true, 'base da CSLL confere com a declarada');
  assert.equal(r.total.valor, 34000);
});
