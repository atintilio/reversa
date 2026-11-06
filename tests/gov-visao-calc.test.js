// Visão geral v2: agregações puras (por UF, estágio, série temporal, maiores municípios).
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../gov-visao-calc.js');

const D = {
  municipios: [{ ibge: '3170206', nome: 'Uberlândia', uf: 'MG' }, { ibge: '4113700', nome: 'Londrina', uf: null }],
  casos: [
    { id: 1, ibge: '3170206', municipio: 'Uberlândia', uf: null, tributo: 'irrf', valor: 480000, criado: '2026-09-16' },
    { id: 2, ibge: '3170206', municipio: 'Uberlândia', uf: null, tributo: 'prev', valor: 520000, criado: '2026-09-23T10:00:00Z' },
    { id: 3, ibge: '4113700', municipio: 'Londrina', uf: null, tributo: 'irrf', valor: null, criado: null },
    { id: 4, ibge: '5201108', municipio: 'Anápolis', uf: 'go', tributo: 'consolidado', valor: 100, criado: 'lixo' }
  ],
  estoque: { irrf: { identificado: 10, validado: 20, compensacao: 30, recuperado: 40 }, prev: { identificado: 1, validado: 2, compensacao: 3, recuperado: 4 } }
};

test('porUF: UF vem do caso, do município ou do código IBGE; valores nulos somam 0 mas o caso conta', () => {
  const A = K.porUF(D);
  assert.deepEqual(A.MG, { n: 2, municipios: 1, i: 480000, p: 520000, c: 0, v: 1000000 });
  assert.deepEqual(A.PR, { n: 1, municipios: 1, i: 0, p: 0, c: 0, v: 0 });
  assert.equal(A.GO.n, 1); assert.equal(A.GO.c, 100);
});
test('porUF: sem casos devolve objeto vazio', () => {
  assert.deepEqual(K.porUF({ casos: [], municipios: [] }), {});
  assert.deepEqual(K.porUF({}), {});
});
test('fatiasUF: ordena, ignora zero e agrupa o excedente em Demais UFs', () => {
  const A = {}; ['A', 'B', 'C', 'D'].forEach((u, i) => { A[u] = { v: (i + 1) * 10 }; }); A.Z = { v: 0 };
  assert.deepEqual(K.fatiasUF(A, 8).map(x => x.nome), ['D', 'C', 'B', 'A']);
  assert.deepEqual(K.fatiasUF(A, 3), [{ nome: 'D', valor: 40 }, { nome: 'C', valor: 30 }, { nome: 'Demais UFs', valor: 30 }]);
});
test('porEstagio: soma IRRF + Previdenciário nos 4 estágios; sem estoque dá zeros', () => {
  assert.deepEqual(K.porEstagio(D).map(x => x.valor), [11, 22, 33, 44]);
  assert.deepEqual(K.porEstagio({}).map(x => x.valor), [0, 0, 0, 0]);
  assert.deepEqual(K.estagiosDe(D.estoque.irrf).map(x => x.valor), [10, 20, 30, 40]);
});
test('serieTemporal: acumulado por data de criação, ignora datas inválidas e conta as sem data', () => {
  const s = K.serieTemporal(D.casos);
  assert.deepEqual(s.map(x => [x.d, x.i, x.p, x.n]), [['2026-09-16', 480000, 0, 1], ['2026-09-23', 480000, 520000, 2]]);
  assert.equal(s.semData, 2);
  assert.equal(K.serieTemporal([]).length, 0);
  assert.equal(K.data10('2026-02-31'), null);
});
test('topMunicipios e atividade', () => {
  const t = K.topMunicipios(D, 8);
  assert.deepEqual(t.map(x => [x.nome, x.uf, x.i + x.p]), [['Uberlândia', 'MG', 1000000]]);
  assert.deepEqual(K.atividade(D.casos, 6).map(c => c.id), [2, 1]);
});
test('maxBonito e pct', () => {
  assert.equal(K.maxBonito(6430000), 10000000); assert.equal(K.maxBonito(1800000), 2000000); assert.equal(K.maxBonito(0), 1); assert.equal(K.maxBonito(2300), 2500);
  assert.equal(K.pct(1, 0), null); assert.equal(K.pct(1, 4), 0.25);
});
