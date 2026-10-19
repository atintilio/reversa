// Selic (atualizar + consenso). TODAS as taxas abaixo são FICTÍCIAS, só para exercitar a regra — não são dados reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const Selic = require('../selic');

const FICTICIA = { '2024-02': 1.0, '2024-03': 0.5, '2024-04': 0.5, '2024-05': 2.0 }; // fictícia

test('atualizar: meses entre pagamento e cálculo + 1% no mês do cálculo', () => {
  // pago em jan/2024 (nenhuma taxa de jan), calculado em mai/2024: fev+mar+abr (2,0) + 1% = 3,0%
  const r = Selic.atualizar(1000, '2024-01-15', '2024-05-10', FICTICIA);
  assert.equal(r.percentual, 3); assert.equal(r.juros, 30); assert.equal(r.atualizado, 1030);
  assert.deepEqual(r.meses, ['2024-02', '2024-03', '2024-04']); assert.deepEqual(r.estimados, []); assert.deepEqual(r.avisos, []);
});

test('atualizar: mesmo mês → 0; mês seguinte → só 1%; cálculo antes do pagamento → 0', () => {
  assert.equal(Selic.atualizar(1000, '2024-03-01', '2024-03-31', FICTICIA).juros, 0);
  assert.equal(Selic.atualizar(1000, '2024-03-31', '2024-04-01', FICTICIA).percentual, 1);
  assert.equal(Selic.atualizar(1000, '2024-05-01', '2024-03-01', FICTICIA).juros, 0);
});

test('atualizar: mês sem taxa usa a última publicada e avisa', () => {
  const r = Selic.atualizar(100, '2024-04-10', '2024-08-10', { '2024-05': 2.0, '2024-06': 1.5 }); // fictícia
  assert.deepEqual(r.meses, ['2024-05', '2024-06']); assert.deepEqual(r.estimados, ['2024-07']);
  assert.equal(r.percentual, 6); // 2,0 + 1,5 + 1,5 (estimada) + 1
  assert.equal(r.atualizado, 106);
  assert.match(r.avisos[0], /^Selic estimada para os meses 2024-07/);
});

test('atualizar: tabela vazia não inventa taxa (só o 1% do mês do cálculo) e avisa', () => {
  const r = Selic.atualizar(200, '2024-01-01', '2024-04-01', {});
  assert.equal(r.percentual, 1); assert.equal(r.estimados.length, 2); assert.equal(r.avisos.length, 1);
});

test('atualizar: aceita Date e arredonda em 2 casas', () => {
  const r = Selic.atualizar(333.33, new Date(Date.UTC(2024, 0, 20)), new Date(Date.UTC(2024, 4, 5)), FICTICIA);
  assert.equal(r.juros, 10); assert.equal(r.atualizado, 343.33);
});

test('consenso: duas fontes iguais confirmam; tolerância de 0,0001 p.p.', () => {
  const c = Selic.consenso([
    { nome: 'A', tabela: { '2024-02': 1.0, '2024-03': 0.5 } },
    { nome: 'B', tabela: { '2024-02': 1.00005, '2024-03': 0.5 } }
  ]); // fictícias
  assert.deepEqual(c.confirmados, ['2024-02', '2024-03']); assert.equal(c.tabela['2024-03'], 0.5);
  assert.equal(c.divergencias.length, 0); assert.equal(c.ultimaCompetencia, '2024-03');
});

test('consenso: divergência com maioria (3 fontes) usa a maioria e registra a divergência', () => {
  const c = Selic.consenso([
    { nome: 'A', tabela: { '2024-02': 1.0 } }, { nome: 'B', tabela: { '2024-02': 1.0 } }, { nome: 'C', tabela: { '2024-02': 9.9 } }
  ]); // fictícias
  assert.equal(c.tabela['2024-02'], 1.0);
  assert.deepEqual(c.divergencias, [{ mes: '2024-02', valores: { A: 1.0, B: 1.0, C: 9.9 } }]);
  assert.deepEqual(c.confirmados, ['2024-02']);
});

test('consenso: divergência sem maioria NÃO é usada (faltante) e gera aviso', () => {
  const c = Selic.consenso([
    { nome: 'A', tabela: { '2024-02': 1.0, '2024-03': 0.5 } }, { nome: 'B', tabela: { '2024-02': 1.2, '2024-03': 0.5 } }
  ]); // fictícias
  assert.equal(c.tabela['2024-02'], undefined); assert.equal(c.tabela['2024-03'], 0.5);
  assert.equal(c.divergencias.length, 1);
  assert.ok(c.avisos.some((a) => /2024-02.*sem maioria/.test(a)));
  // mês faltante vira estimativa em atualizar()
  assert.deepEqual(Selic.atualizar(100, '2024-01-01', '2024-04-01', c.tabela).estimados, ['2024-02']);
});

test('consenso: mês com fonte única é usado com aviso', () => {
  const c = Selic.consenso([
    { nome: 'A', tabela: { '2024-02': 1.0, '2024-03': 0.5 } }, { nome: 'B', tabela: { '2024-02': 1.0 } }
  ]); // fictícias
  assert.equal(c.tabela['2024-03'], 0.5); assert.deepEqual(c.confirmados, ['2024-02']);
  assert.ok(c.avisos.some((a) => /2024-03: confirmado por uma única fonte/.test(a)));
  assert.equal(c.ultimaCompetencia, '2024-03');
});

test('consenso: fonte com erro é ignorada e listada como não ok; todas com erro → tabela vazia', () => {
  const c = Selic.consenso([{ nome: 'A', tabela: { '2024-02': 1.0 } }, { nome: 'B', tabela: {}, erro: 'timeout' }]); // fictícias
  assert.deepEqual(c.fontes.map((f) => [f.nome, f.ok, f.meses]), [['A', true, 1], ['B', false, 0]]);
  assert.equal(c.tabela['2024-02'], 1.0);
  const vazio = Selic.consenso([{ nome: 'A', tabela: {}, erro: 'x' }]);
  assert.deepEqual(vazio.tabela, {}); assert.equal(vazio.ultimaCompetencia, null);
});
