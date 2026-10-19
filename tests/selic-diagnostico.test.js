// Selic aplicada aos diagnósticos (PIS/COFINS, previdenciário, IRPJ/CSLL). TODAS as taxas abaixo são FICTÍCIAS (1,00% ao mês), só para exercitar a regra.
const test = require('node:test');
const assert = require('node:assert/strict');
const Selic = require('../selic.js');
const SD = require('../selic-diagnostico.js');

function tabelaFicticia() { const t = {}; for (let a = 2015; a <= 2026; a++) for (let m = 1; m <= 12; m++) t[a + '-' + String(m).padStart(2, '0')] = 1.0; return t; } // fictícia
const SELIC = SD.estadoDe({ tabela: tabelaFicticia(), fontes: [{ nome: 'TESTE FICTÍCIO' }, { nome: 'OUTRA', ok: false }], ultimaCompetencia: '2026-09', aviso: 'aviso da rota' });
const HOJE = '2026-10-19';

test('datas de pagamento estimadas: PIS/COFINS dia 25 e previdência dia 20 do mês seguinte (virada de ano inclusa)', () => {
  assert.equal(SD.vencPisCofins('2025-03'), '2025-04-25');
  assert.equal(SD.vencPisCofins('2025-12'), '2026-01-25');
  assert.equal(SD.vencPrevidenciario('2025-03'), '2025-04-20');
  assert.equal(SD.vencPrevidenciario('2025-12'), '2026-01-20');
  assert.equal(SD.hojeISO(new Date(2026, 9, 9)), '2026-10-09');
});

test('estadoDe: resposta vazia ou nula vira "indisponível" e nenhum cálculo inventa Selic', () => {
  assert.equal(SD.estadoDe(null).ok, false);
  assert.equal(SD.estadoDe({ tabela: {} }).ok, false);
  assert.equal(SD.creditos({ teses: [] }, { ok: false }, HOJE), null);
  assert.equal(SD.previdenciario({ teses: [] }, undefined, HOJE), null);
  assert.equal(SD.ecf({ teses: [] }, [], null, HOJE), null);
  assert.deepEqual(SD.nota({ ok: false }, HOJE), ['Selic indisponível — valores sem atualização.']);
});

test('creditos (centavos): atualiza PIS e COFINS por competência, mantém o nominal e fecha totais/resumo', () => {
  const res = { teses: [
    { id: 'a', natureza: 'credito', competencias: [
      { cnpj: '1', competencia: '2025-03', pis: 10000, cofins: 46000, possivelmentePrescrito: false },
      { cnpj: '1', competencia: '2019-01', pis: 5000, cofins: 0, possivelmentePrescrito: true }] },
    { id: 'b', natureza: 'potencial', competencias: [{ cnpj: '1', competencia: '2025-03', pis: 1000, cofins: 0, possivelmentePrescrito: false }] },
    { id: 'c', natureza: 'risco', competencias: [{ cnpj: '1', competencia: '2019-01', pis: 700, cofins: 0, possivelmentePrescrito: true }] }] };
  const c = SD.creditos(res, SELIC, HOJE);
  // pago 25/04/2025, calculado 19/10/2026: maio/2025..set/2026 = 17 meses a 1% + 1% = 18%
  const esperado = Selic.atualizar(100, '2025-04-25', HOJE, tabelaFicticia());
  assert.equal(esperado.percentual, 18);
  const l = c.teses.a.linhas[0];
  assert.equal(l.pagamento, '2025-04-25'); assert.equal(l.pis, 10000); assert.equal(l.pisAt, 11800); assert.equal(l.cofinsAt, 54280);
  assert.equal(c.teses.a.total.pis, 15000); assert.equal(c.teses.a.totalNoPrazo.pis, 10000);
  assert.ok(c.teses.a.total.pisAt > c.teses.a.totalNoPrazo.pisAt);
  assert.equal(c.resumo.recuperavelNoPrazo.pis, 10000); assert.equal(c.resumo.recuperavelNoPrazo.pisAt, 11800);
  assert.equal(c.resumo.recuperavel.pis, 15000);
  assert.equal(c.resumo.potencial.pis, 1000); assert.equal(c.resumo.risco.pis, 700);
  assert.deepEqual(c.estimados, []);
});

test('mês sem taxa publicada usa a última taxa e vai para a lista de estimados e para a nota', () => {
  const t = tabelaFicticia(); delete t['2026-08']; delete t['2026-09'];
  const sel = SD.estadoDe({ tabela: t, fontes: [] });
  const c = SD.creditos({ teses: [{ id: 'a', natureza: 'credito', competencias: [{ cnpj: '1', competencia: '2025-03', pis: 10000, cofins: 0, possivelmentePrescrito: false }] }] }, sel, HOJE);
  assert.deepEqual(c.estimados, ['2026-08', '2026-09']);
  const nota = SD.nota(sel, HOJE, c.estimados).join(' ');
  assert.match(nota, /Meses sem taxa publicada \(2026-08 a 2026-09, 2 meses\)/);
});

test('previdenciario (reais): dia 20 do mês seguinte, só o "no prazo" entra no total do prazo', () => {
  const prev = { teses: [{ id: 'T007', porCompetencia: [{ competencia: '2025-03', valor: 1000, noPrazo: true }, { competencia: '2020-01', valor: 200, noPrazo: false }] }] };
  const p = SD.previdenciario(prev, SELIC, HOJE);
  assert.equal(p.teses.T007.linhas[0].pagamento, '2025-04-20');
  assert.equal(p.teses.T007.linhas[0].valorAt, 1180);
  assert.equal(p.totalNoPrazo.valor, 1000); assert.equal(p.totalNoPrazo.valorAt, 1180);
  assert.equal(p.total.valor, 1200); assert.ok(p.total.valorAt > 1380);
});

test('ecf (reais): usa o vencimento do DARF por tributo; sem DARF usa o vencimento estimado do motor', () => {
  const darf = (cod, tri, venc, principal) => ({ codigoReceita: cod, periodo: { ano: 2025, trimestre: tri }, vencimento: venc, principal });
  const r = { teses: [{ linhas: [
    { ano: 2025, trimestre: 1, irpj: 1000, csll: 500, valor: 1500, vencimentoEstimado: '2025-04-30', noPrazo: true },
    { ano: 2025, trimestre: 2, irpj: 1000, csll: 500, valor: 1500, vencimentoEstimado: '2025-07-31', noPrazo: true }] }] };
  const darfs = [darf('0220', 1, '2025-05-30', 9000), darf('0220', 1, '2025-06-30', 100), darf('6012', 1, '2025-04-30', 3000), darf('9999', 2, '2025-01-01', 1)];
  assert.equal(SD.vencimentosDarf(darfs)['2025-1-IRPJ'].vencimento, '2025-05-30', 'vale o DARF de maior principal');
  assert.equal(SD.vencimentosDarf(darfs)['2025-2-IRPJ'], undefined, 'código não reconhecido não conta');
  const e = SD.ecf(r, darfs, SELIC, HOJE);
  assert.equal(e.linhas[0].origem, 'DARF'); assert.equal(e.linhas[0].pagIrpj, '2025-05-30'); assert.equal(e.linhas[0].pagCsll, '2025-04-30');
  assert.equal(e.linhas[0].irpjAt, Selic.atualizar(1000, '2025-05-30', HOJE, tabelaFicticia()).atualizado);
  assert.equal(e.linhas[0].csllAt, Selic.atualizar(500, '2025-04-30', HOJE, tabelaFicticia()).atualizado);
  assert.equal(e.linhas[1].origem, 'estimado'); assert.equal(e.linhas[1].pagIrpj, '2025-07-31');
  assert.equal(e.total.valor, 3000); assert.equal(e.total.valorAt, e.linhas[0].valorAt + e.linhas[1].valorAt);
  assert.equal(SD.ecf(r, [], SELIC, HOJE).linhas[0].origem, 'estimado');
});

test('nota: competência da última Selic, fontes que responderam, critério de data e aviso da Receita', () => {
  const n = SD.nota(SELIC, HOJE, []).join('\n');
  assert.match(n, /19\/10\/2026/); assert.match(n, /Última competência da Selic: 09\/2026/);
  assert.match(n, /Fontes: TESTE FICTÍCIO\./); assert.ok(!/OUTRA/.test(n), 'fonte que falhou não é listada');
  assert.match(n, /PIS\/COFINS = dia 25 do mês seguinte/); assert.match(n, /previdenciária = dia 20 do mês seguinte/); assert.match(n, /vencimento do DARF/);
  assert.match(n, /aviso da rota/);
  assert.match(n, /Para compensação vale a tabela oficial da Receita Federal \(o PER\/DCOMP calcula na transmissão\)\./);
});

// Crédito escritural de PIS/COFINS não cumulativo não recebe Selic (Lei 10.637/2002 e Lei 10.833/2003, art. 13);
// indébito (pagamento indevido) recebe. Tabela FICTÍCIA de 1% a.m.
test('crédito escritural (insumos, saldo credor) fica nominal; indébito (Tema 69, monofásico, ICMS-ST) recebe Selic', () => {
  const c = (comp) => ({ cnpj: '1', competencia: comp, pis: 10000, cofins: 46000, possivelmentePrescrito: false });
  const res = { teses: ['tema69', 'monofasico', 'icmsSt', 'insumos', 'saldoCredor'].map((id) => ({ id, natureza: id === 'insumos' || id === 'saldoCredor' ? 'potencial' : 'credito', competencias: [c('2025-03')] })) };
  const r = SD.creditos(res, SELIC, HOJE);
  for (const id of ['insumos', 'saldoCredor']) {
    assert.equal(r.teses[id].total.pisAt, 10000, id); assert.equal(r.teses[id].total.cofinsAt, 46000, id);
    assert.equal(r.teses[id].semSelic, true, id); assert.match(r.teses[id].motivoSemSelic, /10\.833\/2003.*Tema 1003/);
  }
  for (const id of ['tema69', 'monofasico', 'icmsSt']) { assert.ok(r.teses[id].total.pisAt > 10000, id); assert.equal(r.teses[id].semSelic, false, id); }
});
