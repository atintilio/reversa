const test = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../lib/sped/leiautes/efd_icms_ipi.json');

const corrigidos = ['B035', 'C115', 'C165', 'C173', 'C180', 'C181', 'C185', 'C350', 'C500', 'D190', 'D690', 'D696', 'D750', 'K275', 'K280'];

test('catálogo ICMS/IPI fecha os 15 registros quebrados pelo PDF', () => {
  for (const reg of corrigidos) {
    const item = catalogo.registros[reg];
    assert.equal(item.completo, true, reg);
    assert.deepEqual(item.posicoes_faltantes, [], reg);
    assert.equal(item.campos[0].nome, 'REG', reg);
    item.campos.forEach((campo, i) => assert.equal(campo.pos, i + 1, reg));
  }
});

test('catálogo preserva os nomes oficiais que estavam truncados', () => {
  const campo = (reg, pos) => catalogo.registros[reg].campos.find((x) => x.pos === pos).nome;
  assert.equal(campo('C181', 21), 'VL_UNIT_FCP_ST_CONV_COMPL');
  assert.equal(campo('C185', 18), 'VL_UNIT_FCP_ST_CONV_COMPL');
  assert.equal(campo('C500', 30), 'CHV_DOCe_REF');
  assert.equal(campo('D696', 5), 'VL_OPR');
  assert.equal(campo('K275', 4), 'QTD_COR_NEG');
  assert.equal(campo('K280', 7), 'COD_PART');
});
