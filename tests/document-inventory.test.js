const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, inventory } = require('../lib/document-inventory');

test('classifica SPED original e retificadora por competência', () => {
  const a = classify({ name: 'EFD-Contribuicoes_2024-01.txt', buffer: '|0000|202401|\n' });
  const b = classify({ name: 'EFD-Contribuicoes_2024-01_retificadora.xml', buffer: '<EFD><competencia>2024-01</competencia></EFD>' });
  assert.equal(a.tipo, 'efd_contribuicoes'); assert.equal(a.competencia, '2024-01'); assert.equal(a.original, null);
  assert.equal(b.retificadora, true); assert.equal(b.competencia, '2024-01');
});

test('reconhece nomes PGDAS, PIS/COFINS e DCTF sem abrir PDF', () => {
  assert.equal(classify({ name: 'PGDASD-DECLARACAO-05875580202301001.pdf' }).tipo, 'pgdas');
  assert.equal(classify({ name: 'PISCOFINS_20250101_arquivo.txt' }).competencia, '2025-01');
  assert.equal(classify({ name: 'DeclaracaoCompleta_012026_40.pdf' }).competencia, '2026-01');
  assert.equal(classify({ name: 'recibo_2025-01.rec' }).tipo, 'recibo');
  assert.equal(classify({ name: 'assinatura.p7s' }).tipo, 'recibo');
  assert.equal(classify({ name: 'LECD_arquivo.txt', buffer: '|0000|01012024|' }).tipo, 'ecd');
  assert.equal(classify({ name: 'arquivo-SPED-EFD.txt', buffer: '|0000|01012024|' }).tipo, 'sped');
  assert.equal(classify({ name: 'DCTF_012026_40.pdf' }).tipo, 'dctfweb');
  assert.equal(classify({ name: 'arquivo_original.txt', buffer: '' }).original, true);
});

test('preserva hash, duplicidade e versões lógicas', () => {
  const files = [{ name: 'efd_2024-01.txt', buffer: 'same' }, { name: 'efd_2024-01.txt', buffer: 'same' }, { name: 'efd_2024-01_retificadora.txt', buffer: 'new' }];
  const r = inventory(files);
  assert.equal(r.documents[1].duplicateOf, 'efd_2024-01.txt');
  assert.equal(r.versions.length, 1); assert.equal(r.versions[0].length, 3);
  assert.equal(r.documents[0].sha256.length, 64);
});

test('lacuna distingue ausência de documento, e-CAC e acesso', () => {
  const r = inventory([], [{ tipo: 'sped', competencia: '2024-01' }, { tipo: 'sped', competencia: '2024-02' }, { tipo: 'sped', competencia: '2024-03' }], [
    { tipo: 'sped', competencia: '2024-02', encontrada: false, perfil: 'fiscal', referencia: 'consulta-1', consultadaEm: '2026-11-27T10:00:00Z' },
    { tipo: 'sped', competencia: '2024-03', acessoDisponivel: false, perfil: 'fiscal' }
  ]);
  assert.deepEqual(r.gaps.map((x) => x.estado), ['documento_ausente', 'declaracao_nao_encontrada_ecac', 'acesso_nao_disponivel']);
  assert.equal(r.gaps[1].evidenciaConsulta.perfil, 'fiscal');
  assert.equal(inventory([], [{ tipo: 'dctfweb', competencia: '2025-01' }], [{ tipo: 'dctfweb', competencia: '2025-01', encontrada: false }]).gaps[0].estado, 'consulta_inconclusiva');
  assert.equal(inventory([{ name: 'Recibo_DCTF_012025.pdf', buffer: 'recibo' }], [{ tipo: 'dctfweb', competencia: '2025-01' }]).gaps[0].estado, 'documento_ausente');
});
