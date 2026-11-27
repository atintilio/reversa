const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/operacao-dashboard');

test('projeção usa tributo mensal e calcula duração do estoque', () => {
  assert.deepEqual(O.projetarCompensacao({ credito: 12000, tributoMensal: 2500, inicio: '2025-01' }), { credito: 12000, tributoMensal: 2500, meses: 5, fimEstimado: '2025-05' });
});
test('dashboard temporal agrega estoque, utilização e recuperado por competência', () => {
  assert.deepEqual(O.dashboardTemporal([{ competencia: '2025-02', estoque: 10, utilizado: 2 }, { competencia: '2025-02', estoque: 5, recuperado: 1 }]), [{ competencia: '2025-02', estoque: 15, utilizado: 2, recuperado: 1 }]);
});
test('etapas preservam revisão humana e evidência', () => assert.equal(O.etapasComEvidencia([{ etapa: 'aprovado', evidencia: 'doc.pdf' }])[0].revisaoHumana, true));
