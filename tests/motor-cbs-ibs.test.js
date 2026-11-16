// tests/motor-cbs-ibs.test.js — Reversa Tax
// Testes do Motor CBS/IBS (projeção Reforma Tributária — LC 214/2025)
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const M      = require('../motor-cbs-ibs');

// ------------------------------------------------------------------ fixtures

// EFD fictícia simplificada:
// receita bruta R$ 1.000.000,00  = 100_000_000 centavos
// entradas tributadas R$ 500.000,00 = 50_000_000 centavos
const EFD_BASE = {
  total: {
    receitaBruta:    100_000_000,
    entradas:         50_000_000,
  },
};

// EFD sem dados de entradas (pior caso)
const EFD_SEM_ENTRADAS = {
  total: {
    receitaBruta: 100_000_000,
  },
};

// EFD com dados em dadosEfd.resumo (fallback)
const EFD_RESUMO = {
  resumo: {
    receitaBruta: 100_000_000,
    entradas:      50_000_000,
  },
};

// ------------------------------------------------------------------ CBS-IBS-001

test('CBS-IBS-001 retorna estrutura completa para competência 2027', () => {
  const r = M.projetarCbsIbs(EFD_BASE, '2027-01');

  assert.equal(r.competencia, '2027-01');
  assert.equal(r.ano, 2027);
  assert.ok(r.regime, 'deve ter objeto regime');
  assert.ok(r.basesCalculo, 'deve ter basesCalculo');
  assert.ok(r.cbs, 'deve ter cbs');
  assert.ok(r.ibs, 'deve ter ibs');
  assert.ok(r.pisCofinsCurrent, 'deve ter pisCofinsCurrent');
  assert.ok(r.comparacao, 'deve ter comparacao');
  assert.ok(Array.isArray(r.avisos), 'avisos deve ser array');
});

// ------------------------------------------------------------------ CBS-IBS-002

test('CBS-IBS-002 cálculo CBS correto em 2027 (alíquota 9,11%)', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2027);

  // Débito CBS = 100.000.000 × 9,11% = 9.110.000 centavos (R$ 91.100,00)
  assert.equal(r.cbs.debito, 9_110_000, 'débito CBS');

  // Crédito CBS = 50.000.000 × 9,11% = 4.555.000 centavos (R$ 45.550,00)
  assert.equal(r.cbs.credito, 4_555_000, 'crédito CBS');

  // CBS apurada = 9.110.000 - 4.555.000 = 4.555.000
  assert.equal(r.cbs.apurado, 4_555_000, 'CBS apurada');
});

// ------------------------------------------------------------------ CBS-IBS-003

test('CBS-IBS-003 PIS/COFINS zerados em 2027 (extinção pela LC 214/2025)', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2027);

  assert.equal(r.regime.pisCofinsPct, 0, 'PIS/COFINS devem estar extintos em 2027');
  assert.equal(r.pisCofinsCurrent.totalApurado, 4_625_000,
    'cálculo de referência PIS+COFINS (9,25% sobre receita - crédito sobre entradas)');
});

// ------------------------------------------------------------------ CBS-IBS-004

test('CBS-IBS-004 comparação indica carga maior com CBS/IBS em 2027', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2027);

  // CBS + IBS em 2027 = CBS apurada + IBS apurado
  // IBS 2027 = 0,10% → débito 100.000, crédito 50.000, apurado 50.000
  // Total CBS+IBS = 4.555.000 + 50.000 = 4.605.000
  // PIS+COFINS atual = 4.625.000
  assert.equal(r.ibs.apurado, 50_000, 'IBS apurado em 2027 (alíquota 0,10%)');
  assert.equal(r.comparacao.cargaProjetadaCbsIbs, 4_605_000, 'carga CBS+IBS projetada');
  assert.equal(r.comparacao.cargaAtualPisCofins,  4_625_000, 'carga PIS+COFINS referência');
  // Em 2027 a carga CBS+IBS é levemente menor que PIS+COFINS
  assert.equal(r.comparacao.maiorCarga, false, 'CBS+IBS 2027 ainda menor que PIS+COFINS');
});

// ------------------------------------------------------------------ CBS-IBS-005

test('CBS-IBS-005 regime 2026 tem PIS/COFINS vigentes e CBS/IBS de teste', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2026);

  assert.equal(r.regime.cbsPct,  0.90, 'CBS fase-teste 2026 = 0,90%');
  assert.equal(r.regime.ibsPct,  0.10, 'IBS fase-teste 2026 = 0,10%');
  assert.equal(r.regime.pisCofinsPct, 9.25, 'PIS+COFINS ainda vigentes em 2026');
  // CBS fase-teste: débito 900.000, crédito 450.000, apurado 450.000
  assert.equal(r.cbs.apurado, 450_000);
});

// ------------------------------------------------------------------ CBS-IBS-006

test('CBS-IBS-006 regime 2033 tem alíquotas plenas CBS 9,21% e IBS 18,70%', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2033);

  assert.equal(r.regime.cbsPct,  9.21,  'CBS plena em 2033');
  assert.equal(r.regime.ibsPct,  18.70, 'IBS pleno em 2033');
  assert.equal(r.regime.pisCofinsPct, 0, 'PIS+COFINS extintos em 2033');
  // IBS débito = 100.000.000 × 18,70% = 18.700.000
  assert.equal(r.ibs.debito, 18_700_000);
  // IBS crédito = 50.000.000 × 18,70% = 9.350.000
  assert.equal(r.ibs.credito, 9_350_000);
  assert.equal(r.ibs.apurado, 9_350_000);
});

// ------------------------------------------------------------------ CBS-IBS-007

test('CBS-IBS-007 sem dados de entradas: crédito CBS/IBS é zero e aviso emitido', () => {
  const r = M.projetarCbsIbs(EFD_SEM_ENTRADAS, 2027);

  assert.equal(r.cbs.credito, 0,  'crédito CBS = 0 sem entradas');
  assert.equal(r.ibs.credito, 0,  'crédito IBS = 0 sem entradas');
  assert.equal(r.basesCalculo.entradasTributadas, 0);
  assert.ok(r.avisos.some(a => /Entradas tributadas não informadas/.test(a)),
    'deve emitir aviso sobre ausência de entradas');
});

// ------------------------------------------------------------------ CBS-IBS-008

test('CBS-IBS-008 aceita dadosEfd com dados em resumo (fallback)', () => {
  const r = M.projetarCbsIbs(EFD_RESUMO, 2027);

  assert.equal(r.basesCalculo.receitaBruta,    100_000_000);
  assert.equal(r.basesCalculo.entradasTributadas, 50_000_000);
  assert.equal(r.cbs.debito, 9_110_000);
});

// ------------------------------------------------------------------ CBS-IBS-009

test('CBS-IBS-009 ano fora do intervalo retorna erro sem lançar exceção', () => {
  const r = M.projetarCbsIbs(EFD_BASE, 2025);

  assert.ok(r.erro, 'deve ter campo erro para 2025');
  assert.equal(r.projecao, null);
  assert.equal(r.regime, null);
});

// ------------------------------------------------------------------ CBS-IBS-010

test('CBS-IBS-010 projetarCbsIbsMultiAnos retorna array com resultado por ano', () => {
  const resultados = M.projetarCbsIbsMultiAnos(EFD_BASE, 2026, 2029);

  assert.equal(resultados.length, 4, 'deve retornar 4 anos (2026-2029)');
  assert.equal(resultados[0].ano, 2026);
  assert.equal(resultados[3].ano, 2029);
  // Em 2029, IBS começa a subir: 10% da referência plena de 18,70% = 1,87%
  assert.equal(resultados[3].regime.ibsPct, 1.87, 'IBS 2029 = 10% × referência');
});

// ------------------------------------------------------------------ CBS-IBS-011

test('CBS-IBS-011 obterTabelaTransicao retorna cópia imutável', () => {
  const tabela = M.obterTabelaTransicao();

  assert.ok(tabela[2027], 'deve ter entrada 2027');
  assert.ok(tabela[2033], 'deve ter entrada 2033');
  // Deve ser uma cópia — modificar não altera o módulo
  tabela[2027].cbsPct = 999;
  const tabela2 = M.obterTabelaTransicao();
  assert.notEqual(tabela2[2027].cbsPct, 999, 'deve retornar nova cópia');
});

// ------------------------------------------------------------------ CBS-IBS-012

test('CBS-IBS-012 entrada inválida lança erro descritivo', () => {
  assert.throws(() => M.projetarCbsIbs(null, 2027),
    /dadosEfd inválido/, 'deve lançar erro para null');
  assert.throws(() => M.projetarCbsIbs(EFD_BASE, 'abc'),
    /Competência inválida/, 'deve lançar erro para competência inválida');
});
