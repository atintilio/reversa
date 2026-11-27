const test = require('node:test');
const assert = require('node:assert/strict');
const { validarTaxId } = require('../lib/domain/tax');

test('Tax ID CNPJ é normalizado e validado', () => {
  assert.deepEqual(validarTaxId('05.875.580/0001-84'), { type: 'CNPJ', value: '05875580000184', valid: true });
  assert.equal(validarTaxId('11.111.111/1111-11').valid, false);
});
