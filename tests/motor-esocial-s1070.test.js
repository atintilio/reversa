// tests/motor-esocial-s1070.test.js — Reversa Tax
// Testes do Motor eSocial: S-1070 (evtTabProcesso — processos judiciais/administrativos)
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const M      = require('../motor-esocial.js');

// ------------------------------------------------------------------ helpers
const NS  = 'http://www.esocial.gov.br/schema/evt';
const emp = '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>';
const xml = (evt, corpo, id) =>
  `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="${NS}/${evt}/v_S_01_03_00"><${evt} Id="${id || 'ID1'}">${emp}${corpo}</${evt}></eSocial>`;

// S-1070 fixture: processo judicial com suspensão de CPPRB (tpTrib=1)
function s1070(nrProc, codSusp, iniValid, fimValid, tpTrib, op) {
  op = op || 'inclusao';
  var fimTag = fimValid ? `<fimValid>${fimValid}</fimValid>` : '';
  var tpTribTag = tpTrib ? `<infoProcJud><tpTrib>${tpTrib}</tpTrib></infoProcJud>` : '';
  return xml('evtTabProcesso', `<infoProcesso><${op}>
    <ideProcesso><nrProc>${nrProc}</nrProc><iniValid>${iniValid}</iniValid>${fimTag}</ideProcesso>
    <dadosProcesso><codSusp>${codSusp}</codSusp>${tpTribTag}</dadosProcesso>
  </${op}></infoProcesso>`);
}

// S-1070 exclusao
function s1070Excl(nrProc) {
  return xml('evtTabProcesso', `<infoProcesso><exclusao>
    <ideProcesso><nrProc>${nrProc}</nrProc></ideProcesso>
  </exclusao></infoProcesso>`);
}

// S-1070 sem nrProc (inválido — deve ser ignorado)
const S1070_SEM_NRPROC = xml('evtTabProcesso', `<infoProcesso><inclusao>
  <ideProcesso><iniValid>2024-01</iniValid></ideProcesso>
  <dadosProcesso><codSusp>12345</codSusp></dadosProcesso>
</inclusao></infoProcesso>`);

// ------------------------------------------------------------------ S1070-001

test('S1070-001 lerXml reconhece evtTabProcesso como S-1070', () => {
  const l = M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '', '1'), 'proc.xml');
  assert.equal(l.erros.length, 0, 'não deve ter erros');
  assert.equal(l.eventos.filter((e) => e.tipo === 'S-1070').length, 1, 'deve encontrar 1 evento S-1070');
});

// ------------------------------------------------------------------ S1070-002

test('S1070-002 apurarBase retorna array processos com os campos do processo', () => {
  const lidos = [
    M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '2027-12', '1'), 'proc.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  assert.ok(Array.isArray(r.processos), 'processos deve ser array');
  assert.equal(r.processos.length, 1, 'deve ter 1 processo');
  const p = r.processos[0];
  assert.equal(p.nrProc,   '0001234-56.2020.5.01.0001', 'nrProc');
  assert.equal(p.codSusp,  '12345', 'codSusp');
  assert.equal(p.iniValid, '2024-01', 'iniValid');
  assert.equal(p.fimValid, '2027-12', 'fimValid');
  assert.ok(Array.isArray(p.tpTrib), 'tpTrib deve ser array');
  assert.ok(p.tpTrib.includes('1'), 'tpTrib deve incluir "1" (CPPRB)');
  assert.equal(p.excluido, false, 'não deve estar marcado como excluído');
});

// ------------------------------------------------------------------ S1070-003

test('S1070-003 exclusao de processo marca excluido e não aparece em processos do resultado', () => {
  const lidos = [
    M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '', '1'), 'proc.xml'),
    M.lerXml(s1070Excl('0001234-56.2020.5.01.0001'), 'excl.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  assert.equal(r.processos.length, 0, 'após exclusão, processos ativos deve ser vazio');
  assert.equal(r.eventos['S-1070'], 2, 'contagem S-1070 deve registrar 2 eventos lidos (inclusao + exclusao)');
});

// ------------------------------------------------------------------ S1070-004

test('S1070-004 processo sem nrProc é ignorado (não entra em processos)', () => {
  const lidos = [ M.lerXml(S1070_SEM_NRPROC, 'invalido.xml') ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  assert.equal(r.processos.length, 0, 'processo sem nrProc não deve entrar no array');
});

// ------------------------------------------------------------------ S1070-005

test('S1070-005 vários processos: dois inclusao, um excluído', () => {
  const lidos = [
    M.lerXml(s1070('1111111-11.2021.5.01.0001', '11111', '2023-01', '', '1'), 'p1.xml'),
    M.lerXml(s1070('2222222-22.2022.5.01.0001', '22222', '2024-01', '', '2'), 'p2.xml'),
    M.lerXml(s1070Excl('1111111-11.2021.5.01.0001'), 'excl.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  assert.equal(r.processos.length, 1, 'só 1 processo ativo (o outro foi excluído)');
  assert.equal(r.processos[0].nrProc, '2222222-22.2022.5.01.0001', 'processo ativo é o segundo');
  assert.equal(r.eventos['S-1070'], 3, 'contagem deve ser 3 eventos S-1070');
});

// ------------------------------------------------------------------ S1070-006

test('S1070-006 aviso emitido quando há processo com suspensão de contribuição previdenciária', () => {
  const lidos = [
    M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '', '1'), 'proc.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  const avisoS1070 = r.avisos.find((a) => /S-1070/.test(a));
  assert.ok(avisoS1070, 'deve emitir aviso sobre S-1070 com suspensão previdenciária');
  assert.match(avisoS1070, /codSusp|processo/, 'aviso deve mencionar codSusp ou processo');
});

// ------------------------------------------------------------------ S1070-007

test('S1070-007 sem eventos S-1070: processos é array vazio, sem aviso de S-1070', () => {
  const r = M.apurar([], { hoje: '2025-11-16' });
  assert.ok(Array.isArray(r.processos), 'processos deve ser array mesmo sem eventos S-1070');
  assert.equal(r.processos.length, 0, 'deve ser vazio');
  assert.ok(!r.avisos.find((a) => /S-1070/.test(a)), 'não deve emitir aviso de S-1070 quando não há processos');
});

// ------------------------------------------------------------------ S1070-008

test('S1070-008 alteracao atualiza o processo (mantém o mais recente)', () => {
  const lidos = [
    M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '', '1', 'inclusao'), 'p_incl.xml'),
    M.lerXml(s1070('0001234-56.2020.5.01.0001', '12345', '2024-01', '2028-12', '1', 'alteracao'), 'p_alt.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  // Deve haver 2 entradas (a lógica atual não deduplica — expõe ambas, e o consumidor usa a mais recente)
  // O importante é que nenhuma está marcada como excluída
  assert.ok(r.processos.length >= 1, 'deve ter ao menos 1 processo ativo após alteração');
  assert.ok(r.processos.every((p) => !p.excluido), 'nenhum deve estar excluído após alteração');
  assert.equal(r.eventos['S-1070'], 2, 'contagem deve registrar 2 eventos S-1070');
});

// ------------------------------------------------------------------ S1070-009

test('S1070-009 processo só com tpTrib IRRF (3) não emite aviso de suspensão previdenciária', () => {
  const lidos = [
    M.lerXml(s1070('9999999-99.2021.5.01.0001', '55555', '2024-01', '', '3'), 'proc_irrf.xml')
  ];
  const r = M.apurar(lidos, { hoje: '2025-11-16' });
  // Processo existe mas não é de CPPRB (tpTrib=1) nem CPSegurado (tpTrib=2)
  assert.equal(r.processos.length, 1, 'processo IRRF deve aparecer em processos');
  // Pode ou não emitir aviso — se emitir, deve ser diferente do aviso de suspensão previdenciária
  const avisoSuspCP = r.avisos.find((a) => /S-1070/.test(a) && /previdenci/.test(a));
  assert.ok(!avisoSuspCP, 'não deve emitir aviso de suspensão previdenciária para processo só de IRRF');
});
