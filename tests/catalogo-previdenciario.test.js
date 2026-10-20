const test = require('node:test');
const assert = require('node:assert/strict');
const TD = require('../teses-diagnostico');

const NOVAS = Array.from({ length: 21 }, (_, i) => 'T0' + (76 + i));
const MANTIDAS = ['T009', 'T010', 'T059', 'T061', 'T074'];
const CAMPOS = ['base', 'precedente', 'origem', 'maturidade', 'seguranca', 'docs', 'nota'];

test('catálogo previdenciário: T076–T096 e as teses mantidas existem e não se duplicam', () => {
  assert.equal(new Set(NOVAS).size, 21);
  [...NOVAS, ...MANTIDAS].forEach((id) => assert.ok(TD.de(id), id));
  const fonte = require('node:fs').readFileSync(require.resolve('../teses-diagnostico.js'), 'utf8');
  [...NOVAS, ...MANTIDAS].forEach((id) => assert.equal((fonte.match(new RegExp('\\n\\s+' + id + ': \\{', 'g')) || []).length, 1, 'duplicada: ' + id));
});

test('catálogo previdenciário: campos obrigatórios e classificação amarela a validar', () => {
  NOVAS.forEach((id) => {
    const d = TD.de(id);
    CAMPOS.forEach((c) => assert.ok(c in d, id + ' sem ' + c));
    assert.ok(d.base && d.origem && d.nota && Array.isArray(d.docs) && d.docs.length > 0, id);
    assert.equal(d.seguranca, 'amarelo', id); assert.equal(d.maturidade, 'em_disputa', id);
    assert.ok(TD.SEGURANCA[d.seguranca] && TD.MATURIDADE[d.maturidade], id);
    assert.equal(d.validacao, '', id + ': não pode constar como conferida');
    assert.ok(Array.isArray(d.requerDocumento) && (id === 'T076' || d.requerDocumento.length > 0), id + ' sem documentos externos');
    assert.equal(TD.desaconselhada(id), null, id);
  });
});

test('catálogo previdenciário: nenhum precedente inventado', () => {
  const comPrecedente = NOVAS.filter((id) => TD.de(id).precedente);
  assert.deepEqual(comPrecedente.sort(), ['T077', 'T083']);
  assert.match(TD.de('T083').precedente, /Tema 166/); assert.match(TD.de('T077').precedente, /Súmula 310/);
  comPrecedente.forEach((id) => assert.match(TD.de(id).precedente, /conferir/));
});

test('catálogo previdenciário: teses vermelhas são desaconselhadas com motivo; T009/T010/T061 pedem documentos', () => {
  ['T007', 'T062', 'T064'].forEach((id) => assert.ok(TD.desaconselhada(id).motivo.length > 20, id));
  ['T009', 'T010', 'T061'].forEach((id) => assert.ok(TD.requerDocumento(id).length > 0, id));
});
