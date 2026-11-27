const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/dossier');

test('memória conserva fórmula e origem e concilia nominal/Selic', () => {
  const r = D.memory([{ materia: 'PIS', nominal: 100, selicRate: .1, documento: 'efd.xml', referencia: 'M100-1' }]);
  assert.equal(r.nominalCentavos, 10000); assert.equal(r.atualizadoCentavos, 11000);
  assert.equal(r.itens[0].origem, 'efd.xml'); assert.match(r.itens[0].formula, /nominal/);
});
test('versões e workspace permitem cliente sem documentos', () => {
  assert.equal(D.version({}, []).versao, 1); assert.equal(D.version({}, [{ versao: 1 }]).versao, 2);
  assert.equal(D.workspace({ id: 'c1' }).semDocumentos, true);
});
