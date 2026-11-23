const test = require('node:test');
const assert = require('node:assert');
const M = require('../motor-dctfweb.js');

// Dados fictícios no leiaute oficial (XMLSaida da DCTFWeb e texto do PDF como o pdf.js entrega).
const XML = '<?xml version="1.0" encoding="UTF-8"?><ProcDctf xmlns="http://www.serpro.gov.br/dctf/v1"><ConteudoDeclaracao><tns1:DctfXml xmlns:tns1="http://www.serpro.gov.br/dctf/v1" versao="3.0"><A000-DadosIdentificadoresContribuinte><nomeContribuinte>EMPRESA TESTE LTDA</nomeContribuinte><inscContrib>11222333000181</inscContrib><perApuracao>102025</perApuracao><numRecibo>50000000000001</numRecibo>' +
  '<A050-CreditosTributariosApurados><CreditoTributarioApurado><codReceita>113804</codReceita><ctDescricaoTributo>CP PATRONAL - CONTRIBUINTES INDIVIDUAIS</ctDescricaoTributo><ctDescGrupo>CONTRIBUIÇÃO PREVIDENCIÁRIA PATRONAL</ctDescGrupo><ctValor>303.60</ctValor><vlTotalCred>0</vlTotalCred><saldoaPagar>303.60</saldoaPagar></CreditoTributarioApurado>' +
  '<CreditoTributarioApurado><codReceita>170806</codReceita><ctDescricaoTributo>IRRF - REMUNER SERV PRESTADOS POR PJ</ctDescricaoTributo><ctDescGrupo>IRRF</ctDescGrupo><ctValor>1039.00</ctValor><vlTotalCred>0</vlTotalCred><saldoaPagar>1039.00</saldoaPagar></CreditoTributarioApurado></A050-CreditosTributariosApurados>' +
  '<ApuracoesDebito><ApuracaoDebito><sistemaUsuarioDctf>1</sistemaUsuarioDctf></ApuracaoDebito><ApuracaoDebito><sistemaUsuarioDctf>7</sistemaUsuarioDctf></ApuracaoDebito></ApuracoesDebito></A000-DadosIdentificadoresContribuinte></tns1:DctfXml></ConteudoDeclaracao>' +
  '<OutrasInformacoes><numeroRecibo>50000000000002</numeroRecibo><dataHoraTransmissao>20251114182344</dataHoraTransmissao></OutrasInformacoes></ProcDctf>';

const DECL = ['MINISTÉRIO DA FAZENDA', 'RELATÓRIO DA DECLARAÇÃO COMPLETA - DCTFWeb', 'EMPRESA TESTE', 'Nome do Contribuinte CNPJ 11.222.333/0001-81', 'LTDA',
  'Período apuração 10/2025 Número do Recibo 50000000000002', '35361005378 / eSocial', '14/11/2025 18:23:44 129414561 / Reinf RET',
  'Número do Recibo da Declaração Retificada 50000000000001',
  'Código da Receita 1138-04 Descrição CP PATRONAL - CONTRIBUINTES INDIVIDUAIS', 'Período Apuração', '10/2025', 'Débito', 'Débito Apurado 303,60', 'Saldo a Pagar 303,60',
  'Código da Receita 1708-06 Descrição IRRF - REMUNER SERV PRESTADOS POR PJ', 'Débito Apurado 1.039,00', 'Saldo a Pagar 1.039,00'].join('\n');

const RECIBO = ['Recibo de Entrega da Declaração de Débitos e Créditos Tributários Federais - DCTFWeb', 'CNPJ/CPF 11.222.333/0001-81', 'Nome EMPRESA TESTE LTDA',
  'Período de apuração 10/2025', 'Declaração Retificadora Sim', 'Contribuição Previdenciária Patronal R$ 303,60 R$ 303,60', 'IRRF R$ 1.039,00 R$ 1.039,00', 'TOTAL R$ 1.342,60 R$ 1.342,60'].join('\n');

test('XML da DCTFWeb: débitos, origem e transmissão', () => {
  const l = M.lerXml(XML, 'x.xml');
  assert.deepStrictEqual(l.erros, []);
  assert.strictEqual(l.cnpj, '11222333000181');
  assert.strictEqual(l.competencia, '2025-10');
  assert.strictEqual(l.retificadora, true);
  assert.strictEqual(l.recibo, '50000000000002');
  assert.strictEqual(l.transmissao, '2025-11-14T18:23:44');
  assert.deepStrictEqual(l.origens, ['eSocial', 'EFD-Reinf']);
  assert.deepStrictEqual(l.debitos.map((d) => [d.codigo, d.valor]), [['1138-04', 303.6], ['1708-06', 1039]]);
  assert.strictEqual(l.totalDebito, 1342.6);
});

test('PDF da declaração completa e do recibo', () => {
  const d = M.lerPdfTexto(DECL, 'd.pdf');
  assert.deepStrictEqual(d.erros, []);
  assert.strictEqual(d.documento, 'Declaração completa');
  assert.strictEqual(d.nome, 'EMPRESA TESTE LTDA');
  assert.strictEqual(d.competencia, '2025-10');
  assert.strictEqual(d.retificadora, true);
  assert.deepStrictEqual(d.debitos.map((x) => [x.codigo, x.valor, x.saldo]), [['1138-04', 303.6, 303.6], ['1708-06', 1039, 1039]]);
  assert.deepStrictEqual(d.origens, ['eSocial', 'EFD-Reinf']);
  const r = M.lerPdfTexto(RECIBO, 'r.pdf');
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.documento, 'Recibo');
  assert.strictEqual(r.nome, 'EMPRESA TESTE LTDA');
  assert.strictEqual(r.totalDebito, 1342.6);
});

test('consolidar: XML vale como fonte e o recibo confere o total', () => {
  const c = M.consolidar([M.lerPdfTexto(DECL, 'd.pdf'), M.lerXml(XML, 'x.xml'), M.lerPdfTexto(RECIBO, 'r.pdf')]);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].fonte, 'XML');
  assert.strictEqual(c[0].totalDebito, 1342.6);
  assert.deepStrictEqual(c[0].avisos, []);
});

test('documento que não é DCTFWeb vira erro, não é aceito', () => {
  assert.ok(M.lerXml('<eSocial/>', 'e.xml').erros.length);
  assert.ok(M.lerPdfTexto('DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS', 'darf.pdf').erros.length);
});
