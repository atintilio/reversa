// Paridade do leiaute: o motor deve ler o mesmo arquivo com o catálogo oficial e com a tabela
// antiga, e dar exatamente o mesmo resultado. Se o catálogo oficial mudar a leitura de alguma
// coisa, este teste falha — e a mudança tem de ser conscious, não acidental.
//
// Cadeia de verdade: PDF oficial -> lib/sped/leiautes/*.json (catálogo) -> scripts/gera-leiautes-motor.js
// -> lib/sped/leiautes/leiaute-*.js (o que o motor carrega) -> motor.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MC = require('../motor-creditos.js');
const MI = require('../motor-efd-icms.js');
const catalogoContrib = require('../lib/sped/leiautes/efd_contribuicoes.json');
const catalogoIcms = require('../lib/sped/leiautes/efd_icms_ipi.json');

const DIR_FISCAL = path.join(__dirname, 'fixtures', 'grupo-mateus', 'fiscal');
const arquivosContrib = fs.readdirSync(DIR_FISCAL).filter((f) => f.endsWith('.txt')).sort();

// ---------------------------------------------------------------- EFD-Contribuições
test('EFD-Contribuições: os arquivos reais lidem com o catálogo oficial dão o mesmo resultado que com a tabela antiga', () => {
  assert.ok(arquivosContrib.length >= 2, 'os arquivos reais de EFD-Contribuições estão nos fixtures');
  for (const nome of arquivosContrib) {
    const txt = fs.readFileSync(path.join(DIR_FISCAL, nome), 'latin1');
    const comCatalogo = MC.lerEfdContribuicoes(txt, nome);
    const comLegado = MC.lerEfdContribuicoes(txt, nome, { leiaute: MC.LEIAUTE_LEGADO });
    assert.deepEqual(comCatalogo, comLegado, 'divergência de leitura em ' + nome);
  }
});

test('EFD-Contribuições: o motor carrega o catálogo oficial (não a tabela de reserva)', () => {
  assert.ok(MC.LEIAUTE_CATALOGO, 'o catálogo oficial não foi carregado pelo motor');
  assert.equal(MC.LEIAUTE, MC.LEIAUTE_CATALOGO);
});

test('EFD-Contribuições: todo campo usado pelo motor está na mesma posição no catálogo oficial', () => {
  for (const [reg, legado] of Object.entries(MC.LEIAUTE_LEGADO)) {
    const cat = MC.LEIAUTE_CATALOGO[reg];
    assert.ok(cat, 'registro ' + reg + ' não existe no catálogo oficial');
    for (const [nome, idx] of Object.entries(legado)) {
      assert.equal(cat[nome], idx, 'posição diferente em ' + reg + '.' + nome);
    }
  }
});

test('EFD-Contribuições: o nome oficial do campo está na posição que o motor usa', () => {
  // Confere o catálogo contra si mesmo: na posição X, o nome oficial tem de ser o campo lido.
  const traducao = {
    '0000': { NUM_REC_ANT: 'NUM_REC_ANTERIOR' },
    'C181': { CST: 'CST_PIS', VL_BC: 'VL_BC_PIS', ALIQ: 'ALIQ_PIS', VL_TRIB: 'VL_PIS' },
    'C185': { CST: 'CST_COFINS', VL_BC: 'VL_BC_COFINS', ALIQ: 'ALIQ_COFINS', VL_TRIB: 'VL_COFINS' },
    'M210': { ALIQ: 'ALIQ_PIS', QUANT_BC: 'QUANT_BC_PIS', ALIQ_QUANT: 'ALIQ_PIS_QUANT', VL_AJUS_ACRES_BC: 'VL_AJUS_ACRES_BC_PIS', VL_AJUS_REDUC_BC: 'VL_AJUS_REDUC_BC_PIS' },
    'M610': { ALIQ: 'ALIQ_COFINS', QUANT_BC: 'QUANT_BC_COFINS', ALIQ_QUANT: 'ALIQ_COFINS_QUANT', VL_AJUS_ACRES_BC: 'VL_AJUS_ACRES_BC_COFINS', VL_AJUS_REDUC_BC: 'VL_AJUS_REDUC_BC_COFINS' }
  };
  for (const [reg, legado] of Object.entries(MC.LEIAUTE_LEGADO)) {
    const cat = catalogoContrib.registros[reg];
    assert.ok(cat, 'registro ' + reg + ' não existe no catálogo oficial');
    const nomes = cat.campos.map((c) => String(c.nome).replace(/\(.*$/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase());
    for (const [nome, idx] of Object.entries(legado)) {
      const oficial = (traducao[reg] || {})[nome] || nome;
      assert.equal(nomes[idx], oficial, reg + '.' + nome + ': o catálogo oficial tem "' + nomes[idx] + '" na posição ' + (idx + 1));
    }
  }
});

test('EFD-Contribuições: a apuração (M200/M600/M210/M610) do arquivo real não muda com o catálogo', () => {
  const txt = fs.readFileSync(path.join(DIR_FISCAL, arquivosContrib[0]), 'latin1');
  const hoje = new Date('2024-01-31');
  const comCatalogo = MC.apurar([MC.lerEfdContribuicoes(txt, arquivosContrib[0])], { hoje: hoje });
  const comLegado = MC.apurar([MC.lerEfdContribuicoes(txt, arquivosContrib[0], { leiaute: MC.LEIAUTE_LEGADO })], { hoje: hoje });
  assert.deepEqual(comCatalogo, comLegado);
});

// ---------------------------------------------------------------- EFD ICMS/IPI
const L = (...c) => '|' + c.join('|') + '|';
const arquivoIcms = [
  L('0000', '019', '0', '01012024', '31012024', 'EMPRESA TESTE LTDA', '12345678000190', '', 'SC', '255000000', '4205407', '', '', 'A', '0'),
  L('0150', 'F001', 'FORNECEDOR SA', '01058', '98765432000110', '', '111222333', '4205407', '', 'RUA A', '10', '', 'CENTRO'),
  L('0200', 'P1', 'PRODUTO UM', '', '', 'UN', '00', '22021000', '', '', '', '17,00', ''),
  L('C100', '1', '0', 'F001', '55', '00', '1', '100', '4'.repeat(44), '05012024', '05012024', '1500,00', '0', '0,00', '0,00', '1500,00', '9', '0,00', '0,00', '0,00', '1000,00', '170,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00'),
  L('C170', '1', 'P1', '', '10,00', 'UN', '1000,00', '0,00', '0', '000', '5102', '', '1000,00', '17,00', '170,00', '0,00', '0,00', '0,00', '0', '50', '', '0,00', '0,00', '0,00', '01', '0,00', '0,00', '', '', '0,00', '01', '0,00', '0,00', '', '', '0,00', '', '0,00'),
  L('C190', '000', '5102', '17,00', '1000,00', '1000,00', '170,00', '0,00', '0,00', '0,00', '0,00', ''),
  L('E100', '01012024', '31012024'),
  L('E110', '170,00', '0,00', '0,00', '0,00', '102,00', '0,00', '0,00', '0,00', '0,00', '68,00', '0,00', '68,00', '0,00', '0,00'),
  L('E111', 'SC020001', 'AJUSTE DE APURACAO', '5,00'),
  L('E116', '000', '68,00', '20022024', '1006', '', '', '', '', '012024'),
  L('H010', 'P1', 'UN', '3,000', '10,00', '30,00', '0', '', '', '', '30,00'),
  L('9999', '1')
].join('\r\n') + '\r\n';

test('EFD ICMS/IPI: o mesmo arquivo lido com o catálogo oficial e com a tabela antiga dá o mesmo resultado', () => {
  const comCatalogo = MI.lerEfdIcms(arquivoIcms, 'janeiro.txt');
  const comLegado = MI.lerEfdIcms(arquivoIcms, 'janeiro.txt', { leiaute: MI.LEIAUTE_LEGADO });
  assert.deepEqual(comCatalogo, comLegado);
});

test('EFD ICMS/IPI: o motor carrega o catálogo oficial (não a tabela de reserva)', () => {
  assert.ok(MI.LEIAUTE_CATALOGO, 'o catálogo oficial não foi carregado pelo motor');
  assert.equal(MI.LEIAUTE, MI.LEIAUTE_CATALOGO);
});

test('EFD ICMS/IPI: nome e posição de cada campo são os do catálogo oficial', () => {
  for (const [reg, legado] of Object.entries(MI.LEIAUTE_LEGADO)) {
    const cat = MI.LEIAUTE_CATALOGO[reg];
    assert.ok(cat, 'registro ' + reg + ' não existe no catálogo oficial');
    const nomes = catalogoIcms.registros[reg].campos.map((c) => String(c.nome).replace(/\(.*$/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase());
    // No C170 o leiaute oficial repete ALIQ_PIS (percentual e em reais); o motor distingue com nome interno.
    const oficial = { ALIQ_PIS_PERC: 'ALIQ_PIS', ALIQ_PIS_REAIS: 'ALIQ_PIS', ALIQ_COFINS_PERC: 'ALIQ_COFINS', ALIQ_COFINS_REAIS: 'ALIQ_COFINS' };
    legado.forEach((nome, i) => {
      const pos = i + 1;
      assert.equal(nomes[i], oficial[nome] || nome, reg + '.' + nome + ': o catálogo oficial tem "' + nomes[i] + '" na posição ' + pos);
    });
    assert.equal(cat.length, legado.length, 'registro ' + reg + ' com número de campos diferente do catálogo');
  }
});

// ---------------------------------------------------------------- cadeia de verdade
test('os leiautes dos motores estão em dia com os catálogos oficiais', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'gera-leiautes-motor.js'), '--check'], { encoding: 'utf8' });
  assert.ok(!/DIVERGENTE/.test(out), 'os leiautes dos motores estão desatualizados:\n' + out);
});

test('catálogo da EFD-Contribuições: todos os registros têm os campos em sequência, começando em REG', () => {
  for (const [reg, r] of Object.entries(catalogoContrib.registros)) {
    assert.equal(r.posicoes_faltantes.length, 0, reg + ' com posições faltando: ' + r.posicoes_faltantes.join(','));
    assert.equal(r.campos[0].nome, 'REG', reg + ' não começa em REG');
    r.campos.forEach((c, i) => assert.equal(c.pos, i + 1, reg + ' fora de sequência na posição ' + c.pos));
    assert.equal(r.completo, true, reg + ' marcado como incompleto');
  }
});
