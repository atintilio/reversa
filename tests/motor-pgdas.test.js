const test = require('node:test');
const assert = require('node:assert');
const M = require('../motor-pgdas.js');

// Texto sintético no leiaute oficial do PGDAS-D (Declaratório do Simples Nacional).
const DECL = [
  'Programa Gerador do Documento de Arrecadação',
  'do Simples Nacional - Declaratório',
  'Declaração Original',
  'Período de Apuração: 01/01/2021 a 31/01/2021',
  '.',
  '1. Identificação do Contribuinte',
  'CNPJ Matriz: 05.875.580/0001-84',
  'Nome empresarial: EMPRESA TESTE LTDA',
  'Optante pelo Simples Nacional: Sim',
  'Regime de Apuração: Competência',
  'Nº da Declaração: 05875580202101001',
  '.',
  '2.Apuração do Simples Nacional',
  '2.1 Discriminativo de Receitas',
  'Total de Receitas Brutas (R$) Mercado Interno Mercado Externo Total',
  'Receita Bruta do PA (RPA) - Competência 47.947,47 0,00 47.947,47',
  'Receita bruta acumulada nos doze meses anteriores',
  'ao PA (RBT12) 503.264,67 0,00 503.264,67',
  '2.7) Informações da Declaração por Estabelecimento',
  'CNPJ Estabelecimento: 05.875.580/0001-84',
  'Revenda de mercadorias, exceto para o exterior - Sem substituição tributária/tributação',
  'monofásica/antecipação com encerramento de tributação',
  'Receita Bruta Informada: R$ 4.090,99',
  'IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total',
  '15,18 9,66 35,16 7,62 115,91 92,45 0,00 0,00 275,98',
  'Parcela 1: R$ 4.090,99',
  'Revenda de mercadorias, exceto para o exterior - Com substituição tributária/tributação',
  'monofásica/antecipação com encerramento de tributação (o substituído tributário do ICMS',
  'deve utilizar essa opção)',
  'Receita Bruta Informada: R$ 43.856,48',
  'IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total',
  '162,72 103,55 376,92 81,66 1.242,59 0,00 0,00 0,00 1.967,44',
  'Parcela 1: R$ 43.856,48',
  'Totais do Estabelecimento',
  'Valor Informado: 47.947,47',
  'Total do Débito Declarado (exigível + suspenso)',
  'IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total',
  '177,90 113,21 412,08 89,28 1.358,50 92,45 0,00 0,00 2.243,42',
  '.',
  '3. Informações da Recepção da Declaração',
  'Data e horário da transmissão da Declaração: 09/02/2021 12:12:42',
  'Número do Recibo: 01.07.21040.0174754-6',
].join('\n');

const RETIF = DECL
  .replace('Declaração Original', 'Declaração Retificadora')
  .replace('05875580202101001', '05875580202101002')
  .replace('R$ 43.856,48\nIRPJ', 'R$ 50.000,00\nIRPJ'); // receita maior na retificadora

test('PGDAS-D original: campos básicos', () => {
  const r = M.lerPdfTexto(DECL, 'pgdas-01-2021.pdf');
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.cnpj, '05875580000184');
  assert.strictEqual(r.competencia, '2021-01');
  assert.strictEqual(r.retificadora, false);
  assert.strictEqual(r.numero, '05875580202101001');
  assert.strictEqual(r.recibo, '01.07.21040.0174754-6');
  assert.strictEqual(r.transmissao, '2021-02-09T12:12:42');
});

test('PGDAS-D: receitas e tributos por atividade', () => {
  const r = M.lerPdfTexto(DECL, 'x.pdf');
  assert.strictEqual(r.atividades.length, 2);
  const semMono = r.atividades.find(a => !a.comMono);
  const comMono = r.atividades.find(a => a.comMono);
  assert.ok(semMono, 'deve ter atividade sem monofásico');
  assert.ok(comMono, 'deve ter atividade com monofásico');
  assert.strictEqual(semMono.receita, 4090.99);
  assert.strictEqual(comMono.receita, 43856.48);
  assert.strictEqual(comMono.icms, 0);
  assert.strictEqual(comMono.cofins, 376.92);
  assert.strictEqual(comMono.pis, 81.66);
});

test('PGDAS-D: segregação monofásica calculada', () => {
  const r = M.lerPdfTexto(DECL, 'x.pdf');
  assert.strictEqual(r.receitaMono, 43856.48);
  assert.strictEqual(r.pisCofinsMono, 458.58); // 376,92 + 81,66 arredondado
});

test('PGDAS-D: totalDas', () => {
  const r = M.lerPdfTexto(DECL, 'x.pdf');
  assert.strictEqual(r.totalDas, 2243.42);
});

test('consolidar: retificadora prevalece sobre original', () => {
  const orig = M.lerPdfTexto(DECL, 'orig.pdf');
  const retif = M.lerPdfTexto(RETIF, 'retif.pdf');
  const c = M.consolidar([orig, retif]);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].retificadora, true);
  assert.strictEqual(c[0].numero, '05875580202101002');
});

test('documento que não é PGDAS-D vira erro', () => {
  const r = M.lerPdfTexto('DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS', 'darf.pdf');
  assert.ok(r.erros.length > 0);
});
