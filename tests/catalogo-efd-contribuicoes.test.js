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

test('C100, M210 e M610 foram resolvidos no leiaute oficial (a repetição espúria do PDF não entra)', () => {
  // O PDF do Guia 1.35 traz mais de uma versão da tabela do C100 e do M210/M610.
  // O catálogo escolhe a versão vigente e a declara; não esconde nem escolhe em silêncio.
  const nomes = (codigo) => catalogo.registros[codigo].campos.map((c) => c.nome);
  for (const codigo of ['C100', 'M210', 'M610']) assert.equal(catalogo.registros[codigo].completo, true, codigo);
  // C100: CHV_NFE uma vez só (a base do python-sped duplica e desloca o resto em 1)
  assert.equal(nomes('C100').filter((n) => n === 'CHV_NFE').length, 1);
  // O próprio Guia v1.35 imprime "COD_SIT;" (com ponto e vírgula) na tabela do C100;
  // o catálogo guarda o nome como está no PDF e o gerador do leiaute limpa a pontuação.
  assert.equal(nomes('C100')[5], 'COD_SIT;');
  assert.equal(nomes('C100')[8], 'CHV_NFE');
  assert.equal(nomes('C100')[9], 'DT_DOC');
  // M210: leiaute vigente (16 campos), com os ajustes de base
  assert.equal(catalogo.registros.M210.campos.length, 16);
  assert.equal(nomes('M210')[4], 'VL_AJUS_ACRES_BC_PIS');
  assert.equal(nomes('M210')[6], 'VL_BC_CONT_AJUS');
  assert.equal(nomes('M210')[9], 'ALIQ_PIS_QUANT');
  // M610: mesmo leiaute, com os nomes de COFINS
  assert.equal(catalogo.registros.M610.campos.length, 16);
  assert.equal(nomes('M610')[9], 'ALIQ_COFINS_QUANT');
});
