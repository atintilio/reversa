// Pacote operacional de PIS/COFINS: posicao de creditos por origem e material de PER/DCOMP.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MC = require('../motor-creditos.js');
const Pacote = require('../pacote-pis.js');

// EFD-Contribuicao com o Bloco 1 (registro 1100 = PIS) no leiaute oficial do Guia v1.35:
// 2 PER_APU_CRED | 3 ORIG_CRED | 4 CNPJ_SUC | 5 COD_CRED | 6 VL_CRED_APU | 7 VL_CRED_EXT_APU
// 8 VL_TOT_CRED_APU | 9 VL_CRED_DESC_PA_ANT | 10 VL_CRED_PER_PA_ANT | 11 VL_CRED_DCOMP_PA_ANT
// 12 SD_CRED_DISP_EFD | 13 VL_CRED_DESC_EFD | 14 VL_CRED_PER_EFD | 15 VL_CRED_DCOMP_EFD
// 16 VL_CRED_TRANS | 17 VL_CRED_OUT | 18 SLD_CRED_FIM
const L = (...c) => '|' + c.join('|') + '|';
const cab = L('0000', '006', '0', '', '01012024', '31122024', 'EMPRESA TESTE', '12345678000190', 'SP', '3550308', '', '00', '9');
const r1100 = L('1100', '082024', '01', '', '101', '100000,00', '0,00', '100000,00', '0,00', '10000,00', '0,00', '90000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '90000,00');
const r1100b = L('1100', '092024', '02', '98765432000110', '301', '50000,00', '0,00', '50000,00', '0,00', '0,00', '0,00', '50000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '50000,00');
const r1500 = L('1500', '082024', '01', '', '101', '400000,00', '0,00', '400000,00', '0,00', '0,00', '0,00', '400000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '400000,00');
const arquivo = [cab, r1100, r1100b, r1500, L('9999', '4')].join('\r\n');

test('o motor le o Bloco 1 (1100 e 1500) com as posicoes do Guia v1.35', () => {
  const l = MC.lerEfdContribuicoes(arquivo, 'x.txt');
  assert.equal(l.creditosPosicao.length, 3);
  const p = l.creditosPosicao[0];
  assert.equal(p.tributo, 'pis');
  assert.equal(p.competenciaCredito, '082024');
  assert.equal(p.origem, '01');
  assert.equal(p.codCredito, '101');
  assert.equal(p.creditoApurado, 10000000);      // 100.000,00 em centavos
  assert.equal(p.usadoPerAnterior, 1000000);      // 10.000,00
  assert.equal(p.saldoDisponivel, 9000000);       // 90.000,00
  assert.equal(l.creditosPosicao[2].tributo, 'cofins');
});

test('o pacote mostra a posicao de creditos por origem, com o rotulo oficial do tipo de credito', () => {
  const l = MC.lerEfdContribuicoes(arquivo, 'x.txt');
  const p = Pacote.monta([l], { competencia: '2024-09' });
  assert.equal(p.competencia, '2024-09');
  assert.equal(p.creditos.length, 3);
  const c = p.creditos[0];
  assert.equal(c.competenciaCredito, '082024');
  assert.equal(c.origemRotulo, 'Crédito decorrente de operações próprias');
  assert.equal(c.codCreditoRotulo, 'Crédito vinculado à receita tributada no mercado interno – Alíquota Básica');
  assert.equal(c.apurado, 100000);
  assert.equal(c.disponivel, 90000);
  assert.equal(c.usadoPerAnterior, 10000);
  // o credito transferido por sucessao guarda o CNPJ cedente
  assert.equal(p.creditos[1].cnpjSuc, '98765432000110');
  assert.equal(p.creditos[1].origemRotulo, 'Crédito transferido por pessoa jurídica sucedida');
});

test('o pacote resume o disponivel por tributo e lista o que da para pedir (PER ou DCOMP)', () => {
  const l = MC.lerEfdContribuicoes(arquivo, 'x.txt');
  const pkg = Pacote.monta([l], { competencia: '2024-09' });
  assert.equal(pkg.resumo.pis.disponivel, 140000);   // 90.000 + 50.000
  assert.equal(pkg.resumo.cofins.disponivel, 400000);
  assert.equal(pkg.resumo.pis.creditos, 2);
  assert.equal(pkg.pedidos.length, 3, 'os tres creditos tem saldo disponivel');
  const pedido = pkg.pedidos[0];
  assert.ok(pedido.vias, 'o primeiro pedido traz as vias: ' + JSON.stringify(pedido));
  assert.equal(pedido.vias.length, 2);
  assert.match(pedido.vias[0], /PER/);
  assert.match(pedido.vias[1], /DCOMP/);
  assert.match(pedido.nota, /escolha do contador/);
});

test('credito sem saldo disponivel nao entra na lista de pedidos', () => {
  const l = MC.lerEfdContribuicoes([cab, L('1100', '082024', '01', '', '101', '100000,00', '0,00', '100000,00', '100000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00'), L('9999', '3')].join('\r\n'), 'y.txt');
  const p = Pacote.monta([l], { competencia: '2024-09' });
  assert.equal(p.pedidos.length, 0);
  assert.equal(p.resumo.pis.disponivel, 0);
});

test('o CSV exporta o pacote para o contador (separador ; e decimal com virgula)', () => {
  const l = MC.lerEfdContribuicoes(arquivo, 'x.txt');
  const p = Pacote.monta([l], { competencia: '2024-09' });
  const txt = Pacote.csv(p);
  const linhas = txt.trim().split('\r\n');
  assert.equal(linhas.length, 4, 'cabecalho + 3 creditos');
  assert.match(linhas[0], /^Tributo;Competência do crédito;Origem;/);
  assert.match(linhas[1], /^PIS;082024;01;;101;/);
  assert.match(linhas[1], /90000,00/);
});

test('credito repetido (mesma chave) nao e contado duas vezes e o motor avisa', () => {
  const l = MC.lerEfdContribuicoes([cab, r1100, r1100, L('9999', '3')].join('\r\n'), 'z.txt');
  const p = Pacote.monta([l], { competencia: '2024-09' });
  assert.equal(p.creditos.length, 1);
  assert.match(p.avisos.join(' '), /repetido/);
});

test('sem o Bloco 1 o pacote avisa que nao ha posicao de creditos', () => {
  const l = MC.lerEfdContribuicoes([cab, L('9999', '1')].join('\r\n'), 'w.txt');
  const p = Pacote.monta([l], { competencia: '2024-09' });
  assert.equal(p.creditos.length, 0);
  assert.match(p.avisos.join(' '), /Bloco 1/);
});
