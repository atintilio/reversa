const test = require('node:test');
const assert = require('node:assert');
const M = require('../motor-creditos.js');

test('EFD transmitida: a assinatura PKCS#7 após o |9999| é ignorada', () => {
  const sped = ['|0000|006|0|||01012025|31012025|EMPRESA TESTE LTDA|11222333000181||SC|||00|1|', '|9999|2|'].join('\r\n');
  const limpo = M.lerEfdContribuicoes(sped, 'a.txt');
  const assinado = M.lerEfdContribuicoes(sped + '\r\nSBRCAAEPDR0\u0082\r\nICP-Brasil\r\n\u0000ÿ', 'b.txt');
  assert.deepStrictEqual(assinado.erros, limpo.erros);
});
