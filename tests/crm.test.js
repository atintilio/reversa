// CRM-001..003: payload Reversa → CRM (clientes, fase e diagnóstico preliminar por grupo).
const test = require('node:test');
const assert = require('node:assert');
const crm = require('../lib/crm');

const base = { id: '3a6f90ce-84c9-4b6a-827e-15991b720d86', legal_name: 'Metalúrgica Teste Ltda', cnpj: '11222333000181', tax_regime: 'Lucro Real', commercial_stage: 'apresentado' };

test('CRM-001 separa Fiscal e Previdenciário e só traz teses aplicáveis', () => {
  const c = crm.montarCliente({ ...base, perfil: { industria: true, folha: true, st: false }, estimated_value: '955050.00' });
  assert.deepStrictEqual(c.grupos.map((g) => g.id), ['fiscal', 'prev']);
  for (const g of c.grupos) for (const t of g.teses) assert.ok(['provavel', 'verificar'].includes(t.estado));
  assert.ok(c.grupos[1].teses.every((t) => /^T0/.test(t.id)));
  assert.ok(!c.grupos[0].teses.some((t) => t.id === 'T002'), 'ICMS-ST não se aplica sem ST');
  assert.strictEqual(c.fase, 'apresentado');
  assert.match(c.url, /clientes\.html\?id=/);
});

test('CRM-002 valor do motor só no Fiscal; diagnóstico traz segurança e base legal', () => {
  const c = crm.montarCliente({ ...base, perfil: { industria: true, folha: true }, estimated_value: '955050.00' });
  assert.strictEqual(c.grupos[0].valorEstimado, 955050);
  assert.strictEqual(c.grupos[1].valorEstimado, null);
  const t1 = c.grupos[0].teses.find((t) => t.id === 'T001');
  assert.strictEqual(t1.seguranca, 'verde');
  assert.ok(t1.base && t1.origem && t1.maturidade);
  const sem = crm.montarCliente({ ...base, perfil: {}, estimated_value: null });
  assert.strictEqual(sem.grupos[0].valorEstimado, null);
});

test('CRM-003 sem configuração, o envio automático não faz nada e não lança erro', async () => {
  delete process.env.CRM_API_URL; delete process.env.CRM_SYNC_SECRET;
  assert.strictEqual(crm.configured(), false);
  await crm.syncOne({ organization: { id: 'x' } }, base.id);
});
