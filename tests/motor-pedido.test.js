// Motor de decisão do pedido de crédito de PIS/COFINS: PER (ressarcimento) x DCOMP (compensação).
// A regra vem do roteiro oficial da Receita "PER/DCOMP Web: Ressarcimento de PIS/Pasep e Cofins
// Não Cumulativos" (ver motor-pedido.js) — o teste trava cada uma delas.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Pedido = require('../motor-pedido.js');

function credito(extra) {
  return Object.assign({
    tributo: 'pis', competenciaCredito: '032024', origem: '01', cnpjSuc: '', codCredito: '101',
    codCreditoRotulo: 'Crédito vinculado à receita tributada no mercado interno – Alíquota Básica',
    apurado: 10000, extemporaneo: 0, total: 10000,
    usadoDescontoAnterior: 0, usadoPerAnterior: 0, usadoDcompAnterior: 0,
    disponivel: 10000, usadoDesconto: 0, pedidoPer: 0, pedidoDcomp: 0, transferido: 0,
    usadoOutros: 0, saldoFinal: 10000
  }, extra || {});
}

test('sem débito próprio posterior, a via sugerida é o PER (a DCOMP não teria objeto)', () => {
  const r = Pedido.avaliar({ creditos: [credito()], competenciaRef: '2024-05' });
  assert.equal(r.pedidos.length, 1);
  const p = r.pedidos[0];
  assert.equal(p.via, 'PER');
  assert.equal(p.trimestre, '2024T1');
  assert.equal(p.valorPedido, 10000);
  assert.ok(p.fundamento.some(f => /declaração de compensação \(DCOMP\) é posterior/i.test(f)), 'explica a ordem PER → DCOMP');
  assert.ok(p.pendencias.some(t => /débito próprio a compensar/i.test(t)), 'pede conferência de débito');
});

test('com DARF de PIS/Cofins em período posterior, a via é PER e depois DCOMP', () => {
  const r = Pedido.avaliar({
    creditos: [credito()],
    darfs: [{ codigoReceita: '6912', principal: 500000, periodo: { competencia: '2024-06' } }],
    competenciaRef: '2024-07'
  });
  const p = r.pedidos[0];
  assert.equal(p.via, 'PER_E_DCOMP');
  assert.ok(p.valorCompensavel > 0);
  assert.ok(p.fundamento.some(f => /PER \(pedido\) e DCOMP \(compensação\)/.test(f)));
  assert.ok(p.fundamento.some(f => /Selic/.test(f)), 'explica a atualização pela Selic entre PER e DCOMP');
});

test('o prazo decadencial é de 5 anos contados do encerramento do trimestre do crédito', () => {
  const dentro = Pedido.avaliar({ creditos: [credito({ competenciaCredito: '032021' })], competenciaRef: '2026-01' });
  assert.equal(dentro.pedidos[0].prazo.situacao, 'no_prazo');
  assert.equal(dentro.pedidos[0].prazo.limite, '2026-03');
  const fora = Pedido.avaliar({ creditos: [credito({ competenciaCredito: '032021' })], competenciaRef: '2026-04' });
  assert.equal(fora.pedidos[0].prazo.situacao, 'prescrito');
  assert.equal(fora.pedidos[0].via, 'NENHUMA');
  assert.equal(fora.pedidos[0].valorPedido, 0);
});

test('crédito já objeto de PER no período não entra na lista de novo pedido', () => {
  const r = Pedido.avaliar({ creditos: [credito({ pedidoPer: 10000 })], competenciaRef: '2024-05' });
  assert.equal(r.pedidos[0].via, 'NENHUMA');
  assert.ok(r.pedidos[0].pendencias.some(t => /já foi pedido/i.test(t)));
});

test('saldo do crédito segue a fórmula do PER/DCOMP Web (apurado − deduções − utilizações)', () => {
  const r = Pedido.avaliar({
    creditos: [credito({ apurado: 10000, usadoDesconto: 2500, disponivel: 7500 })],
    competenciaRef: '2024-05'
  });
  assert.equal(r.pedidos[0].saldo, 7500);
  assert.equal(r.pedidos[0].valorPedido, 7500);
});

test('crédito de empresa sucedida avisa sobre o evento de sucessão', () => {
  const r = Pedido.avaliar({
    creditos: [credito({ origem: '02', cnpjSuc: '98765432000110' })],
    competenciaRef: '2024-05'
  });
  assert.ok(r.pedidos[0].pendencias.some(t => /sucessão/.test(t)));
  assert.ok(r.pedidos[0].pendencias.some(t => /passível de ressarcimento\/compensação/.test(t)));
  assert.ok(r.pedidos[0].pendencias.some(t => /litígio/.test(t)));
});

test('a ficha sai na ordem das abas do roteiro oficial da Receita', () => {
  const r = Pedido.avaliar({ creditos: [credito()], competenciaRef: '2024-05' });
  const f = Pedido.ficha(r);
  const abas = f.map(x => x.aba);
  assert.ok(abas.indexOf('Identificar Documento') < abas.indexOf('Valores Apurados'));
  assert.ok(abas.indexOf('Valores Apurados') < abas.indexOf('Saldo do Crédito'));
  assert.ok(abas.indexOf('Saldo do Crédito') < abas.indexOf('Demonstrativo do Crédito'));
  const csv = Pedido.csv(r);
  assert.ok(csv.startsWith('Aba;Campo;Valor')); // cabecalho
  assert.ok(csv.includes('PIS/PASEP Não-Cumulativo - Ressarcimento/Compensação'));
  assert.ok(csv.includes('10000,00')); // numero sem separador de milhar: o contador importa direto na planilha
});

// fluxo completo: EFD-Contribuições -> motor -> pacote -> decisão de via
test('fluxo completo: a EFD-Contribuições vira decisão de via com o fundamento', () => {
  const MC = require('../motor-creditos.js');
  const Pacote = require('../pacote-pis.js');
  const L = (...c) => '|' + c.join('|') + '|';
  const cab = L('0000', '006', '0', '', '', '01012024', '31122024', 'EMPRESA TESTE', '12345678000190', 'SP', '3550308', '', '00', '9');
  const r1100 = L('1100', '082024', '01', '', '101', '100000,00', '0,00', '100000,00', '0,00', '0,00', '0,00', '90000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '90000,00');
  const m100 = L('M100', '101', '0', '150000,00', '1,6500', '', '2475,00', '0,00', '0,00', '0,00', '2475,00', '0', '2475,00', '0,00', '');
  const lido = MC.lerEfdContribuicoes([cab, r1100, m100, L('9999', '4')].join('\r\n'), 'x.txt');
  const pkg = Pacote.monta([lido], { competencia: '2024-09' });
  const apurados = lido.creditosApurados.map(a => ({ tributo: a.tributo, competencia: lido.meta.competencia, codCredito: a.codCredito, vlCred: a.vlCred }));
  const r = Pedido.avaliar({
    creditos: pkg.creditos, creditosApurados: apurados,
    darfs: [{ codigoReceita: '6912', principal: 5000, periodo: { ano: 2024, mes: 10 } }],
    competenciaRef: '2024-11', competenciaEscrituracao: '2024-12'
  });
  assert.equal(r.pedidos.length, 1);
  assert.equal(r.pedidos[0].via, 'PER_E_DCOMP');          // há DARF de PIS depois -> PER e DCOMP
  // saldo pela fórmula do PER/DCOMP Web (apurado − deduções − utilizações) = 100.000,00
  assert.equal(r.pedidos[0].saldo, 100000);
  assert.equal(r.pedidos[0].valorPedido, 100000);
  // o 1100 declara 90.000,00 de saldo disponível: a diferença tem de ser conferida
  assert.equal(r.pedidos[0].saldoDeclarado, 90000);
  assert.ok(r.pedidos[0].pendencias.some(t => /difere do saldo disponível declarado/.test(t)));
  assert.ok(r.pedidos[0].fundamento.length > 0 && r.pedidos[0].pendencias.length > 0);
});

test('a conciliação com o M100/M500 acusa divergência entre apurado e declarado', () => {
  const r = Pedido.avaliar({
    creditos: [credito({ apurado: 10000, disponivel: 10000 })],
    creditosApurados: [{ tributo: 'pis', competencia: '2024-05', codCredito: '101', vlCred: 800000 }], // R$ 8.000
    competenciaEscrituracao: '2024-05',
    competenciaRef: '2024-06'
  });
  assert.equal(r.pedidos[0].conciliacao.length, 1);
  assert.equal(r.pedidos[0].conciliacao[0].apurado, 8000);
  assert.ok(r.pedidos[0].pendencias.some(t => /Conciliação da competência 2024-05/.test(t)));
});

test('sem crédito com saldo, o motor avisa em vez de inventar pedido', () => {
  const r = Pedido.avaliar({ creditos: [], competenciaRef: '2024-05' });
  assert.equal(r.pedidos.length, 0);
  assert.ok(r.avisos.some(a => /Nenhum crédito com saldo disponível/.test(a)));
});
