const test = require('node:test');
const assert = require('node:assert/strict');
const { projetarAmostra } = require('../lib/domain/diagnosticos');

test('projeta janela uniforme de cinco anos sem misturar regimes', () => {
  const r = projetarAmostra([
    { competencia: '2020-01', regime: 'presumido', valor: 100 },
    { competencia: '2024-12', regime: 'presumido', valor: 300 },
    { competencia: '2025-01', regime: 'real', valor: 500 },
    { competencia: '2025-06', regime: 'real', valor: 700 }
  ], { mudancasRegime: [{ inicio: '2020-01', regime: 'presumido' }, { inicio: '2025-01', regime: 'real' }], periodoFim: '2025-06' });
  assert.equal(r.segmentos.length, 2);
  assert.equal(r.segmentos[0].mesesProjetados, 60);
  assert.equal(r.segmentos[1].mesesProjetados, 6);
  assert.ok(r.segmentos.every((s) => s.cobertura < 1 && s.limitacoes.length));
});
