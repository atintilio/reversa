// Motor de PIS/COFINS (EFD-Contribuições): valores conferíveis à mão sobre os SPEDs sintéticos da demonstração.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-creditos');
const EXEMPLO = require('../demo-sped');

const arq = (prefixo) => EXEMPLO.find((a) => a.nome.startsWith(prefixo));
const ler = (a) => M.lerEfdContribuicoes(a.texto, a.nome);
const HOJE = new Date('2026-10-14T12:00:00-03:00');

test('MOTOR-001 regra do Tema 69 item a item (centavos)', () => {
  const base = { vlItem: 100000, vlDesc: 0, vlIcms: 18000, cstPis: '01', cstCofins: '01', aliqPis: 1.65, aliqCofins: 7.6 };
  const r = M.calcularItem({ ...base, bcPis: 100000, bcCofins: 100000 });
  assert.equal(r.creditoPis, 297); assert.equal(r.creditoCofins, 1368); assert.equal(r.baseCorreta, 82000);
  assert.equal(M.calcularItem({ ...base, bcPis: 82000, bcCofins: 82000 }).creditoPis, 0, 'ICMS já excluído');
  assert.equal(M.calcularItem({ ...base, bcPis: 100000, bcCofins: 100000, cstPis: '06', cstCofins: '06' }).creditoPis, 0, 'alíquota zero fora do escopo');
  assert.equal(M.calcularItem({ ...base, vlIcms: 0, bcPis: 100000, bcCofins: 100000 }).creditoPis, 0, 'sem ICMS destacado');
});

test('MOTOR-002 arquivo não cumulativo: só saídas válidas e tributadas geram crédito', () => {
  const r = M.apurar([ler(arq('A_'))], { hoje: HOJE });
  // itens 1, 2 e 8 com excesso de ICMS na base (3,6 mi + 1,62 mi + 1,6 mi); 3 já excluído; 4 CST 06; 5 sem ICMS;
  // 6 é entrada; 7 nota cancelada (fora); 9 nota sem itens.
  assert.equal(r.total.creditoPis, 11253000);       // R$ 112.530,00 = 6,82 mi × 1,65%
  assert.equal(r.total.creditoCofins, 51832000);    // R$ 518.320,00 = 6,82 mi × 7,60%
  assert.equal(r.total.itensComCredito, 3);
});

test('MOTOR-003 retificadora substitui a original da mesma competência', () => {
  const r = M.apurar([ler(arq('B_')), ler(arq('C_'))], { hoje: HOJE });
  const t69 = r.teses.find((t) => t.id === 'tema69');
  assert.equal(t69.competencias.length, 1);
  assert.equal(t69.competencias[0].arquivo, arq('C_').nome);
  assert.equal(t69.total.pis, 1820000);   // cumulativo 0,65% × excesso de 2,8 mi
  assert.equal(t69.total.cofins, 8400000); // 3% × 2,8 mi
  assert.ok(r.avisos.some((a) => /Usado: C_/.test(a)));
});

test('MOTOR-004 competência fora de 5 anos entra no total mas não no recuperável no prazo', () => {
  const r = M.apurar(EXEMPLO.map(ler), { hoje: HOJE });
  assert.equal(r.resumo.recuperavel.pis - r.resumo.recuperavelNoPrazo.pis, 594000); // 2019-01: 360 mil × 1,65%
  const e = r.teses.find((t) => t.id === 'tema69').competencias.find((c) => c.arquivo.startsWith('E_'));
  assert.equal(e.possivelmentePrescrito, true);
});

test('MOTOR-005 monofásico tem prioridade e insumos/risco ficam fora do recuperável', () => {
  const r = M.apurar(EXEMPLO.map(ler), { hoje: HOJE });
  const mono = r.teses.find((t) => t.id === 'monofasico');
  assert.ok(mono.total.pis > 0, 'perfume revendido tributado gera restituição');
  const t69 = r.teses.find((t) => t.id === 'tema69');
  const dupla = t69.detalhes.filter((d) => d.status === 'Coberto pela tese dos monofásicos');
  dupla.forEach((d) => assert.equal(d.pis, 0, 'mesmo item não soma nas duas teses'));
  const soma = (nat, k) => r.teses.filter((t) => t.natureza === nat).reduce((s, t) => s + t.total[k], 0);
  assert.equal(r.resumo.recuperavel.pis, soma('credito', 'pis'));
  assert.ok(r.resumo.potencial.pis > 0 && r.resumo.risco.pis > 0);
});

test('MOTOR-006 arquivos inválidos são recusados com mensagem clara', () => {
  const icms = M.lerEfdContribuicoes('|0000|017|0|01012024|31012024|EMPRESA|11222333000181|||SC|4205407|||A|1|\n|9999|1|\n', 'icms.txt');
  assert.ok(icms.erros.some((e) => /EFD ICMS\/IPI/.test(e)));
  const lixo = M.lerEfdContribuicoes('não é sped', 'x.txt');
  assert.ok(lixo.erros.length > 0);
  assert.equal(M.formatarReais(123456789), 'R$ 1.234.567,89');
});
