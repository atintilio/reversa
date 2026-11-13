// Regra única de liberação da retificadora: o que pode ser baixado, compactado, registrado e aprovado.
// A regra roda no navegador (execucao.html) e no servidor (lib/domain/execucao.js) — o teste fixa as duas pontas.
const test = require('node:test');
const assert = require('node:assert/strict');
const Guard = require('../retificadora-guard.js');

const ok = { erros: 0, avisos: 3, itensAlterados: 2, shaOriginal: 'a'.repeat(64), shaRetificada: 'b'.repeat(64) };

test('GUA-001: retificadora sem erro, com itens alterados e diferente do original é liberada', () => {
  const v = Guard.avaliar(ok);
  assert.equal(v.liberado, true);
  assert.equal(v.codigo, Guard.CODIGOS.LIBERADO);
  assert.equal(v.mensagem, '');
  assert.equal(v.avisos, 3, 'aviso não bloqueia');
});

test('GUA-002: erro de pré-validação bloqueia a liberação', () => {
  const v = Guard.avaliar(Object.assign({}, ok, { erros: 2 }));
  assert.equal(v.liberado, false);
  assert.equal(v.codigo, Guard.CODIGOS.ERRO_VALIDACAO);
  assert.match(v.mensagem, /pré-validação/);
});

test('GUA-003: retificadora sem alteração efetiva não é liberada', () => {
  for (const itens of [0, undefined, null, -1]) {
    const v = Guard.avaliar(Object.assign({}, ok, { itensAlterados: itens }));
    assert.equal(v.liberado, false, 'itensAlterados=' + itens);
    assert.equal(v.codigo, Guard.CODIGOS.SEM_ALTERACAO);
  }
});

test('GUA-004: arquivo idêntico ao original não é liberado', () => {
  const v = Guard.avaliar(Object.assign({}, ok, { shaRetificada: 'a'.repeat(64) }));
  assert.equal(v.liberado, false);
  assert.equal(v.codigo, Guard.CODIGOS.ARQUIVO_IGUAL);
});

test('GUA-005: ordem das regras — erro tem precedência sobre a falta de alteração', () => {
  const v = Guard.avaliar({ erros: 1, itensAlterados: 0, shaOriginal: 'a'.repeat(64), shaRetificada: 'a'.repeat(64) });
  assert.equal(v.codigo, Guard.CODIGOS.ERRO_VALIDACAO);
});

test('GUA-006: liberado/bloqueado separam a lista que segue para o pacote', () => {
  const lista = [ok, Object.assign({}, ok, { erros: 1, nome: 'com-erro' }), Object.assign({}, ok, { itensAlterados: 0, nome: 'sem-efeito' })];
  assert.equal(Guard.liberados(lista).length, 1);
  const bloq = Guard.bloqueados(lista);
  assert.equal(bloq.length, 2);
  assert.equal(bloq[0].artefato.nome, 'com-erro');
  assert.equal(bloq[0].veredito.codigo, Guard.CODIGOS.ERRO_VALIDACAO);
  assert.equal(bloq[1].artefato.nome, 'sem-efeito');
  assert.equal(bloq[1].veredito.codigo, Guard.CODIGOS.SEM_ALTERACAO);
});

test('GUA-007: entrada vazia ou indefinida não libera nada', () => {
  assert.equal(Guard.avaliar(undefined).liberado, false);
  assert.equal(Guard.avaliar({}).liberado, false);
  assert.deepEqual(Guard.liberados(null), []);
  assert.deepEqual(Guard.liberados(undefined), []);
});
