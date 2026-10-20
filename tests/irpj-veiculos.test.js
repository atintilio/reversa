// REV-IRPJ-CSLL-VEICULOS-001 (T099) — Fase 1. Tese judicial em disputa: saída só como "oportunidade estimada".
const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('../motor-irpj-veiculos'); const TD = require('../teses-diagnostico');
const tri4 = (ano, extra) => { const o = {}; for (let t = 1; t <= 4; t++) o[ano + '-T' + t] = Object.assign({ margem: 250000 }, extra || {}); return o; };
const ok = { objetoSocialVeiculos: true, operacoesDocumentadas: true };
const hoje = '2026-10-20';

test('IRPJV-001 cenário de referência: 4 x R$ 250 mil => original 84.800, tese 22.800, diferença 62.000', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: tri4(2025) }, { hoje });
  assert.equal(r.total.apuradoOriginal, 8480000); assert.equal(r.total.recalculadoTese, 2280000); assert.equal(r.total.diferencaNominal, 6200000);
  assert.equal(r.trimestres[0].original.irpj, 1400000); assert.equal(r.trimestres[0].tese.csll, 270000);
});
test('IRPJV-002 adicional de 10% incide sobre a base total, não isolada na margem', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: { '2025-T1': { margem: 250000, outrasBases: { irpj: 100000, csll: 100000 } } } }, { hoje });
  const l = r.trimestres[0];
  assert.equal(l.tese.baseIrpj, 2000000 + 10000000); assert.equal(l.tese.irpj, 1800000 + 600000);
  assert.equal(l.original.irpj, 2700000 + 1200000 + 0); // base (80 mil + 100 mil) = 180 mil: 15% = 27 mil; adicional 10% x (180-60) = 12 mil
  assert.ok(l.diferencaNominal > 0);
});
test('IRPJV-003 aritmética exata em centavos, sem ponto flutuante', () => {
  assert.equal(M.pct(1000000000000, 3200), 320000000000); assert.equal(M.pct(1, 3200), 0); assert.equal(M.pct(50, 1000), 5);
  const r = M.analisar({ contribuinte: ok, trimestres: { '2025-T2': { margem: 0.07 } } }, { hoje });
  assert.ok(Number.isInteger(r.trimestres[0].diferencaNominal));
});
test('IRPJV-004 majoração LC 224/2025 só com limite informado; sem limite, avisa e não inventa', () => {
  const t = { '2026-T3': { margem: 250000, receitaBruta: 1000000 } };
  const sem = M.analisar({ contribuinte: ok, trimestres: t }, { hoje });
  assert.ok(sem.avisos.some(a => /LC 224/.test(a) && /limite/.test(a)));
  const com = M.analisar({ contribuinte: ok, trimestres: t }, { hoje, lc224: { limiteTrimestre: 500000 } });
  assert.ok(com.trimestres[0].original.baseIrpj > sem.trimestres[0].original.baseIrpj);
  assert.ok(com.trimestres[0].majoracaoLc224.original.irpj);
  const velho = M.analisar({ contribuinte: ok, trimestres: { '2025-T3': { margem: 250000, receitaBruta: 1000000 } } }, { hoje, lc224: { limiteTrimestre: 500000 } });
  assert.equal(velho.trimestres[0].majoracaoLc224.original.irpj, null);
  assert.ok(M.REGRAS_LC224.find(r => r.tributo === 'csll').desde.tri === 2);
});
test('IRPJV-005 margem não positiva: sem diferença e sem compensação automática entre trimestres', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: { '2025-T1': { margem: -50000 }, '2025-T2': { margem: 250000 } } }, { hoje });
  assert.equal(r.trimestres[0].diferencaNominal, 0); assert.ok(r.trimestres[0].alertas.length);
  assert.equal(r.trimestres[1].diferencaNominal, 1100000 + 450000); // IRPJ 14.000-3.000; CSLL 7.200-2.700
  assert.equal(r.total.diferencaNominal, r.trimestres[1].diferencaNominal);
});
test('IRPJV-006 pagamento parcial limita o crédito ao efetivamente recolhido', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: { '2025-T1': { margem: 250000, recolhido: { irpj: 1500000, csll: 720000, data: '2025-04-30' } } } }, { hoje });
  const l = r.trimestres[0];
  assert.equal(l.pagamento, 'informado'); assert.equal(l.confirmado.irpj, 1400000 - 300000); // limitado ao devido original (14.000), não ao recolhido a maior assert.equal(l.confirmado.csll, 720000 - 270000);
  assert.ok(l.confirmado.total <= l.diferencaNominal);
  const sem = M.analisar({ contribuinte: ok, trimestres: { '2025-T1': { margem: 250000 } } }, { hoje });
  assert.equal(sem.trimestres[0].status, 'estimada, pagamento não confirmado');
});
test('IRPJV-007 prescrição de 5 anos pela data de pagamento ou vencimento estimado', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: { '2020-T3': { margem: 250000 }, '2022-T1': { margem: 250000 } } }, { hoje });
  assert.equal(r.trimestres[0].noPrazo, false); assert.equal(r.trimestres[0].status, 'fora do prazo de 5 anos');
  assert.equal(r.trimestres[1].noPrazo, true); assert.equal(r.trimestres[1].vencimento, '2022-04-30');
  assert.equal(r.total.noPrazo, r.trimestres[1].diferencaNominal); assert.ok(r.total.foraDoPrazo > 0);
  const aj = M.analisar({ contribuinte: ok, trimestres: { '2022-T1': { margem: 250000 } } }, { hoje, dataAjuizamento: '2027-06-01' });
  assert.equal(aj.trimestres[0].noPrazo, false);
});
test('IRPJV-008 travas: oportunidade estimada, nada disponível, sem PER/DCOMP, fora do recuperável', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: tri4(2025) }, { hoje });
  assert.equal(r.classificacao.creditoJudicialmenteReconhecido, 0); assert.equal(r.classificacao.efetivamenteCompensavel, 0);
  assert.equal(r.classificacao.oportunidadeEstimada, r.total.noPrazo); assert.equal(r.foraDoRecuperavel, true);
  assert.notEqual(r.estadoAtual, 'credito_disponivel_compensacao'); assert.equal(r.risco.grau, 'alto');
  const g = M.gerarPerdcomp(); assert.equal(g.ok, false); assert.equal(g.bloqueado, true);
  assert.equal(r.atualizacaoSelic.disponivel, false);
});
test('IRPJV-009 fluxo de estados: ordem obrigatória e evidências para habilitar/compensar', () => {
  assert.equal(M.ESTADOS.length, 13);
  assert.equal(M.validarTransicao('calculo_concluido', 'judicializada').ok, false);
  assert.equal(M.validarTransicao('judicializada', 'decisao_favoravel', {}).ok, false);
  assert.equal(M.validarTransicao('judicializada', 'decisao_favoravel', { decisaoFavoravel: true }).ok, true);
  assert.equal(M.validarTransicao('habilitacao_deferida', 'credito_disponivel_compensacao', { transitoJulgado: true, habilitacaoDeferida: true }).ok, false);
  assert.equal(M.validarTransicao('credito_disponivel_compensacao', 'compensacao_transmitida', { transitoJulgado: true, habilitacaoDeferida: true, validacaoHumana: true }).ok, false);
  assert.equal(M.validarTransicao('credito_disponivel_compensacao', 'compensacao_transmitida', { transitoJulgado: true, habilitacaoDeferida: true, validacaoHumana: true, autorizacaoResponsavel: true }).ok, true);
});
test('IRPJV-010 triagem: Simples/Real não elegíveis; sem documentos pendente; alertas rebaixam', () => {
  const t = tri4(2025);
  assert.equal(M.analisar({ contribuinte: Object.assign({ simples: true }, ok), trimestres: t }, { hoje }).triagem.classe, 'Não elegível');
  assert.equal(M.analisar({ contribuinte: Object.assign({ regime: 'real' }, ok), trimestres: t }, { hoje }).triagem.classe, 'Não elegível');
  assert.equal(M.analisar({ contribuinte: {}, trimestres: t }, { hoje }).triagem.classe, 'Pendente de documentação');
  assert.equal(M.analisar({ contribuinte: Object.assign({ acaoJudicialAnterior: true }, ok), trimestres: t }, { hoje }).triagem.classe, 'Potencialmente elegível');
  const ecf = M.lerEcfPresumido('|0000|LECF|01012025|31122025|E|12345678000190|0|\n|P200|1|PERCENTUAL|32,00|', 'x');
  assert.equal(M.analisar({ contribuinte: ok, trimestres: t }, { hoje }).triagem.classe, 'Potencialmente elegível'); // sem ECF para conferir
  assert.equal(M.analisar({ ecfs: [ecf], contribuinte: ok, trimestres: t }, { hoje }).triagem.classe, 'Elegível');
  assert.equal(M.analisar({ contribuinte: ok, trimestres: {} }, { hoje }).triagem.classe, 'Pendente de documentação');
});
test('IRPJV-011 leitura mínima da ECF do Lucro Presumido (P030/P200/P400) e coeficientes', () => {
  const txt = ['|0000|LECF|01012025|31122025|EMPRESA X|12345678000190|0|', '|0010|1|N|N|P|', '|P030|A01|01012025|31032025|',
    '|P200|1|PERCENTUAL APLICADO|32,00|', '|P400|1|PERCENTUAL APLICADO|32,00|', '|P300|1|RECEITA|1.000.000,00|'].join('\n');
  const e = M.lerEcfPresumido(txt, 'x.txt');
  assert.equal(e.cnpj, '12345678000190'); assert.equal(e.p.P200.length, 1); assert.equal(e.p.P300[0].valor, 1000000);
  assert.equal(M.coeficientesEcf(e).irpj[0].pct, 32);
  assert.ok(e.avisos.some(a => /conferir/.test(a)));
  const r = M.analisar({ ecfs: [e], contribuinte: ok, trimestres: { '2025-T1': { margem: 250000 } } }, { hoje });
  assert.equal(r.trimestres[0].origemCoef, 'ECF');
  const real = M.lerEcfPresumido('|0000|LECF|01012025|31122025|E|11111111000111|0|\n|N630|1|X|1,00|', 'r');
  assert.equal(real.temReal, true);
});
test('IRPJV-012 contribuinte que já usa 8%/12% não gera diferença', () => {
  const r = M.analisar({ contribuinte: ok, trimestres: { '2025-T1': { margem: 250000, coefOriginal: { irpj: 8, csll: 12 } } } }, { hoje });
  assert.equal(r.trimestres[0].diferencaNominal, 0);
});
test('IRPJV-013 cadastro: fundamentos, precedentes A/B/C como informados, divergência CARF 85/Cosit 398', () => {
  assert.equal(M.PRECEDENTES.length, 3); M.PRECEDENTES.forEach(p => { assert.equal(p.vinculante, false); assert.equal(p.repetitivo, false); assert.match(p.situacao, /conferir/); });
  assert.ok(M.DIVERGENCIA.some(d => /85/.test(d.ato))); assert.ok(M.DIVERGENCIA.some(d => /398/.test(d.ato)));
  assert.ok(M.FUNDAMENTOS.some(f => /9\.716/.test(f.norma)) && M.FUNDAMENTOS.some(f => /LC 224/.test(f.norma)));
  assert.equal(M.TESE_ID, 'REV-IRPJ-CSLL-VEICULOS-001');
});
test('IRPJV-014 catálogo: T099 verde com ressalvas explícitas; T098 não se sobrepõe', () => {
  const d = TD.de('T099');
  assert.equal(d.identificador, 'REV-IRPJ-CSLL-VEICULOS-001'); assert.equal(d.seguranca, 'verde'); assert.equal(d.maturidade, 'em_disputa');
  assert.match(d.nota, /divergência administrativa registrada/); assert.match(d.nota, /sem PER\/DCOMP/); assert.match(d.precedente, /não são repetitivos nem vinculantes/);
  assert.match(d.precedente, /Súmula CARF 85/); assert.match(TD.de('T098').nota, /não sobrepõe REV-IRPJ-CSLL-VEICULOS-001/i);
});
