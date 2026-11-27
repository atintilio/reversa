const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/diagnostico-consistente');

test('composição mantém teses de qualquer classificação e soma em centavos', () => {
  const r = M.comporPotencial([{ id: 'fiscal', teses: [
    { id: 'T1', nome: 'Provável', seguranca: 'verde', valor: 1.01 },
    { id: 'T2', nome: 'Remota', seguranca: 'vermelho', valor: 2.02 }
  ] }]);
  assert.equal(r.totalCentavos, 303);
  assert.equal(r.linhas.length, 2);
});

test('composição sinaliza referência repetida sem excluir automaticamente', () => {
  const r = M.comporPotencial([{ id: 'fiscal', teses: [
    { id: 'T1', valor: 10, referencia: 'doc-1' },
    { id: 'T2', valor: 5, referencia: 'doc-1' }
  ] }]);
  assert.equal(r.total, 15);
  assert.equal(r.alertas[0].tipo, 'POSSIVEL_SOBREPOSICAO');
});

test('teses aplicáveis são preservadas para revisão humana', () => {
  const r = M.avaliarTesesAplicaveis(() => [{ id: 'fiscal', teses: [{ id: 'T1' }] }], {});
  assert.equal(r[0].teses[0].aplicavel, true);
});

