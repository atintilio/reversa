// Pacote operacional de PIS/COFINS ligado à interface: a página carrega o módulo e a
// memória técnica (PDF) traz a posição de créditos e o material de PER/DCOMP.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const MC = require('../motor-creditos.js');
const Pacote = require('../pacote-pis.js');

// EFD-Contribuição sintética com o Bloco 1 (1100 = PIS, 1500 = Cofins) — leiaute do Guia v1.35.
const L = (...c) => '|' + c.join('|') + '|';
const cab = L('0000', '006', '0', '', '01012024', '31122024', 'EMPRESA TESTE', '12345678000190', 'SP', '3550308', '', '00', '9');
const r1100 = L('1100', '082024', '01', '', '101', '100000,00', '0,00', '100000,00', '0,00', '10000,00', '0,00', '90000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '90000,00');
const r1500 = L('1500', '082024', '01', '', '101', '400000,00', '0,00', '400000,00', '0,00', '0,00', '0,00', '400000,00', '0,00', '0,00', '0,00', '0,00', '0,00', '400000,00');
const arquivo = [cab, r1100, r1500, L('9999', '3')].join('\r\n');

function htmlDaPagina() { return fs.readFileSync(require.resolve('../index.html'), 'utf8'); }
function scriptDaMemoria() {
  const html = htmlDaPagina();
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('root.GeradorMemoria ='));
}

test('a página carrega o pacote de PIS depois da tabela oficial de códigos de crédito', () => {
  const html = htmlDaPagina();
  const iTab = html.indexOf('src="/lib/sped/tabelas/codigos-credito.js"');
  const iPacote = html.indexOf('src="/pacote-pis.js"');
  const iMotor = html.indexOf('src="/motor-creditos.js"');
  assert.ok(iTab > 0 && iPacote > 0 && iMotor > 0, 'os três scripts precisam estar na página');
  assert.ok(iTab < iPacote, 'o módulo do pacote usa a tabela de códigos no carregamento');
  assert.ok(iPacote < iMotor, 'o pacote entra antes do motor');
});

// No navegador o motor captura o leiaute no carregamento do script: se o leiaute vier depois,
// o motor cai na tabela legada (sem o Bloco 1) e o registro 1100/1500 não é lido.
test('os leiautes são carregados antes dos motores em todas as páginas que os usam', () => {
  for (const pagina of ['../index.html', '../execucao.html']) {
    const html = fs.readFileSync(require.resolve(pagina), 'utf8');
    const iLeiauteContrib = html.indexOf('src="/lib/sped/leiautes/leiaute-efd-contribuicoes.js"');
    const iLeiauteIcms = html.indexOf('src="/lib/sped/leiautes/leiaute-efd-icms-ipi.js"');
    assert.ok(iLeiauteContrib > 0 && iLeiauteIcms > 0, pagina + ': os leiautes precisam estar na página');
    for (const motor of ['/motor-creditos.js', '/motor-efd-icms.js']) {
      const iMotor = html.indexOf('src="' + motor + '"');
      if (iMotor < 0) continue; // a página não usa este motor
      assert.ok(iLeiauteContrib < iMotor && iLeiauteIcms < iMotor, pagina + ': o leiaute tem de vir antes de ' + motor);
    }
  }
});

test('a tela tem a seção do pacote de créditos e o botão de exportar o CSV', () => {
  const html = htmlDaPagina();
  assert.ok(html.includes('id="sec-pacote"'));
  assert.ok(html.includes('id="tab-pacote"') && html.includes('id="tab-pacote-pedidos"'));
  assert.ok(html.includes('id="btn-pacote-csv"'));
  assert.ok(html.includes('renderPacote()'), 'a seção é desenhada no render do resultado');
  assert.ok(html.includes('PP.csv(estado.pacote)'), 'o botão exporta o CSV do pacote');
});

test('a memória técnica inclui a posição de créditos e o material de PER/DCOMP', () => {
  const textos = [];
  function PDF() { // stub do jsPDF: registra textos e tabelas; demais métodos são no-op
    const base = {
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
      text: x => textos.push(x), splitTextToSize: x => [x], getNumberOfPages: () => 1,
      autoTable: cfg => { textos.push(cfg.head || [], cfg.body || []); base.lastAutoTable = { finalY: 80 }; },
      output: () => textos
    };
    return new Proxy(base, { get: (o, k) => (k in o ? o[k] : () => {}) });
  }
  const window = {
    jspdf: { jsPDF: PDF },
    MotorCreditos: { formatarReais: c => 'R$' + c },
    PacotePis: Pacote
  };
  vm.runInNewContext(scriptDaMemoria(), { window });

  const lido = MC.lerEfdContribuicoes(arquivo, 'x.txt');
  const res = {
    competencias: [{ cnpj: '12345678000190', nome: 'EMPRESA TESTE', competencia: '2024-09' }],
    resumo: {
      recuperavelNoPrazo: { pis: 0, cofins: 0 }, recuperavel: { pis: 0, cofins: 0 },
      potencial: { pis: 0, cofins: 0 }, risco: { pis: 0, cofins: 0 }
    },
    teses: [], catalogo: [], regimes: [], avisos: [], versaoMotor: 'teste'
  };
  window.GeradorMemoria.gerar(res, [lido], {});
  const str = JSON.stringify(textos);
  assert.ok(str.includes('Pacote operacional de PIS/COFINS'), 'a seção do pacote entra na memória técnica');
  assert.ok(str.includes('Créditos com saldo disponível para pedido'), 'o material de PER/DCOMP entra na memória técnica');
  assert.ok(str.includes('PER (Pedido de Ressarcimento)') || str.includes('PER ou DCOMP'), 'as vias do pedido são identificadas');
  assert.ok(str.includes('082024'), 'a competência do crédito aparece');
  assert.ok(str.includes('R$90000'), 'o saldo disponível de 90.000,00 aparece em centavos (90000)');
  assert.ok(str.includes('R$400000'), 'o saldo disponível de Cofins de 400.000,00 aparece');
});
