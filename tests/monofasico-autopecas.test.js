const test = require('node:test');
const assert = require('node:assert');
const M = require('../motor-creditos.js');

test('autopeças da Lei 10.485: Anexo I, Ex da TIPI e Anexo II', () => {
  assert.strictEqual(M.classificarMonofasico('87089990', '').grupo, 'Autopeças (Anexo I)');
  assert.strictEqual(M.classificarMonofasico('85122011', '').grupo, 'Autopeças (Anexo I)');
  assert.strictEqual(M.classificarMonofasico('73201000', '01').grupo, 'Autopeças (Anexo I)');
  assert.strictEqual(M.classificarMonofasico('73201000', ''), null); // só com o Ex 01
  assert.strictEqual(M.classificarMonofasico('40169990', '5').grupo, 'Autopeças (Anexo I)');
  assert.strictEqual(M.classificarMonofasico('70140000', ''), null); // vidro de sinalização: fora dos anexos
  assert.strictEqual(M.classificarMonofasico('40093100', '').grupo, 'Autopeças (Anexo II, conferir aplicação)');
});
