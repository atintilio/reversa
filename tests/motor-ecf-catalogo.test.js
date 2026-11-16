// tests/motor-ecf-catalogo.test.js — Reversa Tax
// Verifica que motor-ecf.js lê campos a partir do catálogo ecf.json (posMap)
// e que a refatoração não alterou o comportamento existente.
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const M      = require('../motor-ecf.js');

// ------------------------------------------------------------------ fixture helpers

// ECF mínima com 1 trimestre: resultado + adição de provisão + impostos conferindo
function ecfFixture(opts) {
  opts = opts || {};
  var cnpj     = opts.cnpj     || '12345678000199';
  var nome     = opts.nome     || 'EMPRESA TESTE ECF LTDA';
  var base     = opts.base     || 600000;   // base IRPJ e CSLL
  var lucro    = opts.lucro    || (base - 200000); // lucro antes das adições
  var adicao   = opts.adicao   || 200000;
  var descAdd  = opts.descAdd  || 'PROVISAO DE FERIAS E 13 SALARIO';
  // IRPJ = base*15% + max(0, base-60000)*10%
  var irpj     = opts.irpj     || Math.round(base * 0.15 + Math.max(0, base - 60000) * 0.10);
  var csll     = opts.csll     || Math.round(base * 0.09);

  function fmt(v) { return v.toFixed(2).replace('.', ','); }

  return [
    '|0000|LECF|012|' + cnpj + '|' + nome + '|0||||20240101|20241231|N||LR||',
    '|M030|20240101|20240331|T01|',
    '|M300|1|ATIVIDADE GERAL||R||',
    '|M300|2|LUCRO LIQUIDO ANTES DO IRPJ|L||' + fmt(lucro) + '|',
    '|M300|3|ADICOES|R||' + fmt(adicao) + '|',
    '|M300|4|' + descAdd + '|A||' + fmt(adicao) + '|',
    '|M350|1|LUCRO ANTES DA CSLL|L||' + fmt(lucro) + '|',
    '|M350|3|ADICOES|R||' + fmt(adicao) + '|',
    '|M350|4|' + descAdd + '|A||' + fmt(adicao) + '|',
    '|N030|20240101|20240331|T01|',
    '|N500|1|BASE DO IRPJ|' + fmt(base) + '|',
    '|N650|1|BASE DA CSLL|' + fmt(base) + '|',
    '|N630|26|IMPOSTO DE RENDA A PAGAR|' + fmt(irpj) + '|',
    '|N670|21|CSLL A PAGAR|' + fmt(csll) + '|',
  ].join('\n');
}

// ------------------------------------------------------------------ ECF-CAT-001

test('ECF-CAT-001 lerEcf lê CNPJ, empresa e ano do registro 0000 sem avisos de catálogo', () => {
  const r = M.lerEcf(ecfFixture(), 'teste.ecf');
  assert.equal(r.cnpj, '12345678000199', 'CNPJ');
  assert.equal(r.empresa, 'EMPRESA TESTE ECF LTDA', 'empresa');
  assert.equal(r.ano, 2024, 'ano extraído de DT_FIN (aaaammdd → slice(0,4))');
  // catálogo deve ter carregado — sem aviso de posições hardcoded
  const avisoCatalogo = r.avisos.find((a) => /hardcoded|catálogo/i.test(a));
  assert.ok(!avisoCatalogo, 'não deve emitir aviso de catálogo não carregado: ' + (avisoCatalogo || ''));
});

// ------------------------------------------------------------------ ECF-CAT-002

test('ECF-CAT-002 lerEcf lê período M030 (DT_INI, DT_FIN, PER_APUR)', () => {
  const r = M.lerEcf(ecfFixture(), 'teste.ecf');
  assert.equal(r.periodos.length, 1, 'deve ter 1 período M030');
  const per = r.periodos[0];
  assert.equal(per.ini, '20240101', 'DT_INI do M030');
  assert.equal(per.fin, '20240331', 'DT_FIN do M030');
  assert.equal(per.cod, 'T01',      'PER_APUR do M030');
  assert.equal(per.bloco, 'M030',   'bloco deve ser M030');
});

// ------------------------------------------------------------------ ECF-CAT-003

test('ECF-CAT-003 lerEcf lê M300 (resultado, adição de provisão)', () => {
  const r = M.lerEcf(ecfFixture(), 'teste.ecf');
  assert.equal(r.trimestres.length, 1, 'deve ter 1 trimestre');
  const t = r.trimestres[0];
  assert.equal(t.resultado, 400000, 'resultado do lucro líquido IRPJ');
  assert.equal(t.adicoes.length, 1, 'deve ter 1 adição detalhada');
  assert.match(t.adicoes[0].descricao, /PROVISAO/i, 'descrição da adição');
  assert.equal(t.adicoes[0].valor, 200000, 'valor da adição');
});

// ------------------------------------------------------------------ ECF-CAT-004

test('ECF-CAT-004 lerEcf lê N630/N670 (imposto a pagar)', () => {
  const r = M.lerEcf(ecfFixture(), 'teste.ecf');
  const t = r.trimestres[0];
  assert.equal(t.pagoIrpj, 144000, 'IRPJ a pagar (N630)');
  assert.equal(t.pagoCsll, 54000,  'CSLL a pagar (N670)');
});

// ------------------------------------------------------------------ ECF-CAT-005

test('ECF-CAT-005 lerEcf lê N500/N650 (bases de cálculo)', () => {
  const r = M.lerEcf(ecfFixture(), 'teste.ecf');
  const t = r.trimestres[0];
  assert.equal(t.baseIrpj, 600000, 'base do IRPJ (N500)');
  assert.equal(t.baseCsll, 600000, 'base da CSLL (N650)');
});

// ------------------------------------------------------------------ ECF-CAT-006

test('ECF-CAT-006 apurar: conferência bate e tese de dedutível é encontrada', () => {
  const r  = M.lerEcf(ecfFixture(), 'teste.ecf');
  const ap = M.apurar([r]);
  assert.equal(ap.conferencia.length, 1, 'deve ter 1 linha de conferência');
  assert.equal(ap.conferencia[0].confere, true, 'imposto recalculado deve conferir com o declarado');
  assert.equal(ap.teses.length, 1, 'deve encontrar 1 tese (provisão de férias)');
  assert.ok(ap.total.valor > 0, 'valor total deve ser positivo');
  assert.equal(ap.avisos.length, 0, 'não deve emitir avisos');
});

// ------------------------------------------------------------------ ECF-CAT-007

test('ECF-CAT-007 arquivo sem LECF no 0000 emite aviso', () => {
  const semLECF = [
    '|0000|LEFD|012|12345678000199|EMPRESA|0||||20240101|20241231|N||LR||',
  ].join('\n');
  const r = M.lerEcf(semLECF, 'ruim.ecf');
  const aviso = r.avisos.find((a) => /LECF/i.test(a));
  assert.ok(aviso, 'deve emitir aviso quando NOME_ESC não é LECF');
});

// ------------------------------------------------------------------ ECF-CAT-008

test('ECF-CAT-008 vários trimestres: lê todos corretamente', () => {
  // 4 trimestres com mesmos valores
  const linhas = [
    '|0000|LECF|012|11111111000111|MULTI TRIM LTDA|0||||20240101|20241231|N||LR||',
  ];
  var trim_cod = ['T01', 'T02', 'T03', 'T04'];
  var datas = [
    ['20240101', '20240331'],
    ['20240401', '20240630'],
    ['20240701', '20240930'],
    ['20241001', '20241231'],
  ];
  datas.forEach(function (d, i) {
    linhas.push('|M030|' + d[0] + '|' + d[1] + '|' + trim_cod[i] + '|');
    linhas.push('|M300|1|ATIVIDADE GERAL||R||');
    linhas.push('|M300|2|LUCRO LIQUIDO ANTES DO IRPJ|L||400000,00|');
    linhas.push('|M300|3|ADICOES|R||200000,00|');
    linhas.push('|M300|4|PROVISAO DE FERIAS E 13 SALARIO|A||200000,00|');
    linhas.push('|M350|1|LUCRO ANTES DA CSLL|L||400000,00|');
    linhas.push('|M350|3|ADICOES|R||200000,00|');
    linhas.push('|M350|4|PROVISAO DE FERIAS E 13 SALARIO|A||200000,00|');
    linhas.push('|N030|' + d[0] + '|' + d[1] + '|' + trim_cod[i] + '|');
    linhas.push('|N500|1|BASE DO IRPJ|600000,00|');
    linhas.push('|N650|1|BASE DA CSLL|600000,00|');
    linhas.push('|N630|26|IMPOSTO DE RENDA A PAGAR|144000,00|');
    linhas.push('|N670|21|CSLL A PAGAR|54000,00|');
  });
  const r = M.lerEcf(linhas.join('\n'), 'multi.ecf');
  assert.equal(r.trimestres.length, 4, 'deve ter 4 trimestres');
  assert.equal(r.periodos.length, 4, 'deve ter 4 períodos M030');
  const ap = M.apurar([r]);
  assert.equal(ap.teses.length, 1, 'deve encontrar 1 tese');
  assert.equal(ap.teses[0].linhas.length, 4, 'tese deve ter 4 linhas (1 por trimestre)');
});
