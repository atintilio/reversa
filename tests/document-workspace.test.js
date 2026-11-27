const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/document-workspace');

test('workspace reúne documentos, retificações e PER/DCOMP sem alterar os dados', () => {
  const w = W.workspace({ documents: [{ id: 'd1', name: 'a.xml', document_kind: 'sped', competence: '2025-01', sha256: 'x' }], retificacoes: [{ id: 'r1', name: 'ret.xml', status: 'approved' }], recoveryPackages: [{ id: 'p1', package_type: 'perdcomp_compensacao', total_approved: '10.00' }] });
  assert.equal(w.documentos[0].competencia, '2025-01');
  assert.equal(w.retificacoes[0].status, 'approved');
  assert.equal(w.perdcomp[0].totalAprovado, '10.00');
});

test('exportação CSV usa separador semicolon e escapa conteúdo', () => {
  const out = W.exportInventory([{ id: 'd1', name: 'a;original.xml', document_kind: 'sped' }]);
  assert.match(out, /^id;nome;tipo;/);
  assert.match(out, /"a;original\.xml"/);
});
