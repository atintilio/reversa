const test = require('node:test');
const assert = require('node:assert/strict');

const ECD = require('../lib/sped/leiautes/ecd.json');
const ECF = require('../lib/sped/leiautes/ecf.json');

function campo(catalogo, registro, pos) {
  return catalogo.registros[registro].campos.find((c) => c.pos === pos);
}

function valida(catalogo, quantidade, parametrizados) {
  assert.equal(Object.keys(catalogo.registros).length, quantidade);
  for (const [registro, dados] of Object.entries(catalogo.registros)) {
    const variavel = (parametrizados || []).includes(registro);
    if (variavel) {
      // registro parametrizavel: o manual nao fixa o numero de campos. Fica declarado
      // (completo=false, campo_parametrico e observacao), nunca escondido.
      assert.equal(dados.completo, false, registro);
      assert.equal(dados.posicoes_variaveis, true, registro);
      assert.ok(Array.isArray(dados.campo_parametrico) && dados.campo_parametrico.length, registro);
      assert.ok(dados.observacao, registro);
    } else {
      assert.equal(dados.completo, true, registro);
    }
    assert.deepEqual(dados.posicoes_faltantes, [], registro);
    assert.equal(dados.campos[0].nome, 'REG', registro);
    const fixas = dados.campos.filter((c) => Number.isInteger(c.pos));
    assert.deepEqual(fixas.map((c) => c.pos), fixas.map((_, i) => i + 1), registro);
  }
}

test('catálogo ECD oficial cobre os 72 registros do leiaute 9', () => {
  valida(ECD, 72, ['I550', 'I555']);
  assert.equal(campo(ECD, 'I051', 2).nome, 'COD_CCUS');
  assert.equal(campo(ECD, 'I051', 3).nome, 'COD_CTA_REF');
  assert.equal(campo(ECD, 'I200', 6).nome, 'DT_LCTO_EXT');
  assert.equal(campo(ECD, 'I250', 9).nome, 'COD_PART');
  assert.equal(campo(ECD, 'J100', 12).nome, 'NOTA_EXP_REF');
  assert.equal(campo(ECD, 'J150', 13).nome, 'NOTA_EXP_REF');
  assert.equal(ECD.registros.I550.posicoes_variaveis, true);
  assert.equal(ECD.registros.I555.posicoes_variaveis, true);
});

test('catálogo ECF oficial cobre os 188 registros do leiaute 12', () => {
  valida(ECF, 188);
  assert.equal(campo(ECF, '0000', 4).nome, 'CNPJ');
  assert.equal(campo(ECF, '0000', 10).nome, 'DT_INI');
  assert.equal(campo(ECF, '0000', 11).nome, 'DT_FIN');
  assert.equal(campo(ECF, 'M030', 2).nome, 'DT_INI');
  assert.equal(campo(ECF, 'M030', 3).nome, 'DT_FIN');
  assert.equal(campo(ECF, 'M300', 6).nome, 'VALOR');
  assert.equal(campo(ECF, 'M350', 6).nome, 'VALOR');
  assert.equal(campo(ECF, 'K155', 9).nome, 'IND_VL_SLD_FIN');
  assert.equal(campo(ECF, 'N500', 4).nome, 'VALOR');
  assert.equal(campo(ECF, 'Y730', 8).nome, 'OBSERVACAO');
});
