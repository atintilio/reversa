const test = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../lib/sped/leiautes/efd_contribuicoes.json');

test('catálogo EFD-Contribuições identifica toda tabela incompleta sem escondê-la', () => {
  assert.equal(catalogo.leiaute, 'efd_contribuicoes');
  assert.equal(Object.keys(catalogo.registros).length, 203);
  for (const registro of Object.values(catalogo.registros)) {
    const posicoes = registro.campos.map((campo) => campo.pos);
    const esperado = Array.from({ length: Math.max(...posicoes) }, (_, i) => i + 1);
    assert.equal(registro.completo, posicoes.length > 0 && registro.campos[0].nome === 'REG' &&
      JSON.stringify(posicoes) === JSON.stringify(esperado));
  }
});

test('variantes de M210/M610 e repetição espúria de C100 ficam pendentes', () => {
  for (const codigo of ['C100', 'M210', 'M610']) assert.equal(catalogo.registros[codigo].completo, false);
});
