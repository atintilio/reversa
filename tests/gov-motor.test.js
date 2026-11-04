// Testes do motor de cálculo do Reversa Gov (funções puras): casos normais e de borda.
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../lib/domain/motor');
const { IRRF_2026: T, INSS_2026: I, PREVIDENCIARIO_2026: P } = m.parametros;
const hoje = new Date('2026-11-04T12:00:00Z');
const dia = (n) => new Date(hoje.getTime() + n * 86400000).toISOString().slice(0, 10);

test('INSS progressivo: faixas, teto e zero', () => {
  assert.equal(m.irrf.calcularINSS(I, 0), 0);
  assert.equal(m.irrf.calcularINSS(I, 1621), 121.58);        // 7,5% de 1.621,00
  assert.equal(m.irrf.calcularINSS(I, 10000), 988.09);       // limitado ao teto de 8.475,55
  assert.equal(m.irrf.calcularINSS(I, 8475.55), m.irrf.calcularINSS(I, 99999));
});

test('IRRF mensal: isenção até 5.000 (Lei 15.270), redutor entre 5.000 e 7.350 e tabela cheia acima', () => {
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 2000 }).impostoDevido, 0);
  const r5 = m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 5000 });
  assert.equal(r5.impostoDevido, 0);
  assert.equal(r5.redutor, 312.89);
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 6000 }).impostoDevido, 385.1);
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 10000 }).impostoDevido, 1569.55);
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 10000 }).aliquotaFaixa, 0.275);
});

test('IRRF mensal: dependentes, pensão e limite de 12% da previdência complementar reduzem a base', () => {
  const sem = m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 9000 });
  const com = m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 9000, dependentes: 2, pensaoAlimenticia: 500 });
  assert.ok(com.impostoDevido < sem.impostoDevido);
  const lim = m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 9000, prevComplementar: 5000 });
  const igual = m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 9000, prevComplementar: 1080 }); // 12% de 9.000
  assert.equal(lim.impostoDevido, igual.impostoDevido);
});

test('IRRF mensal: usa o desconto simplificado quando é mais vantajoso', () => {
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 3000 }).modeloDeducao, 'SIMPLIFICADO');
  assert.equal(m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 9000 }).modeloDeducao, 'LEGAL');
});

test('entradas inválidas viram MotorCalculoError', () => {
  assert.throws(() => m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: -1 }), { name: 'MotorCalculoError', codigo: 'ENTRADA_INVALIDA' });
  assert.throws(() => m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: '5000' }), { codigo: 'ENTRADA_INVALIDA' });
  assert.throws(() => m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: 5000, dependentes: 1.5 }), { codigo: 'ENTRADA_INVALIDA' });
  assert.throws(() => m.irrf.calcularIRRFMensal(T, I, { rendimentoBruto: NaN }), { codigo: 'ENTRADA_INVALIDA' });
});

test('retenção sobre fornecedor: bens 1,2% e serviços 4,8%; natureza desconhecida é recusada', () => {
  assert.equal(m.irrf.calcularRetencaoFornecedor({ valorNota: 10000, natureza: 'bens' }).valorRetido, 120);
  assert.equal(m.irrf.calcularRetencaoFornecedor({ valorNota: 10000, natureza: 'servicos' }).valorRetido, 480);
  assert.throws(() => m.irrf.calcularRetencaoFornecedor({ valorNota: 1, natureza: 'xyz' }), { codigo: 'NATUREZA_NAO_PARAMETRIZADA' });
});

test('multa de mora: 0,33% ao dia limitada a 20%; sem atraso não há multa', () => {
  const dez = m.irrf.calcularMultaMora({ valorDevido: 10000, dataVencimento: dia(-10), dataPagamento: hoje });
  assert.equal(dez.percentual, 3.3); assert.equal(dez.valor, 330);
  const longa = m.irrf.calcularMultaMora({ valorDevido: 10000, dataVencimento: dia(-365), dataPagamento: hoje });
  assert.equal(longa.valor, 2000);
  assert.equal(m.irrf.calcularMultaMora({ valorDevido: 10000, dataVencimento: dia(0), dataPagamento: hoje }).aplicada, false);
  assert.equal(m.irrf.calcularMultaMora({ valorDevido: 10000, dataVencimento: dia(5), dataPagamento: hoje }).valor, 0);
});

test('CRP: não emitido, vencido, a vencer (≤30 dias) e regular', () => {
  assert.equal(m.previdenciaria.validarCRP(null, P, hoje).status, 'NAO_EMITIDO');
  const v = m.previdenciaria.validarCRP({ numero: 'X', dataValidade: dia(-1) }, P, hoje);
  assert.equal(v.status, 'VENCIDO'); assert.equal(v.regular, false); assert.equal(v.diasVencido, 1);
  assert.equal(m.previdenciaria.validarCRP({ numero: 'X', dataValidade: dia(20) }, P, hoje).status, 'A_VENCER');
  assert.equal(m.previdenciaria.validarCRP({ numero: 'X', dataValidade: dia(30) }, P, hoje).status, 'A_VENCER');
  assert.equal(m.previdenciaria.validarCRP({ numero: 'X', dataValidade: dia(31) }, P, hoje).status, 'REGULAR');
  assert.equal(m.previdenciaria.validarCRP({ numero: 'X', dataValidade: dia(0) }, P, hoje).status, 'A_VENCER'); // vence hoje
});

test('resultado previdenciário: superávit, déficit e criticidade', () => {
  const sup = m.previdenciaria.calcularResultadoPrevidenciario({ baseServidoresAnual: 60000000, aposentados: 200, pensionistas: 50, valorMedioAposentadoria: 3500, valorMedioPensao: 2000 }, P);
  assert.equal(sup.tipo, 'SUPERAVIT'); assert.ok(sup.resultado > 0);
  const def = m.previdenciaria.calcularResultadoPrevidenciario({ baseServidoresAnual: 6000000, aposentados: 500, pensionistas: 100, valorMedioAposentadoria: 4000, valorMedioPensao: 2500 }, P);
  assert.equal(def.tipo, 'DEFICIT'); assert.equal(def.nivelCriticidade, 'ALTA');
  const zero = m.previdenciaria.calcularResultadoPrevidenciario({ baseServidoresAnual: 0 }, P);
  assert.equal(zero.resultado, 0); assert.equal(zero.tipo, 'SUPERAVIT'); assert.equal(zero.percentualSobreReceita, null);
});

test('compensação: elegível proporcional ao tempo de origem, limitada ao teto; inelegível com motivos', () => {
  const ok = m.previdenciaria.estimarCompensacao({ valorBeneficio: 5000, tempoRegimeOrigemAnos: 10, tempoTotalAnos: 30 }, P, I.tetoRGPS);
  assert.equal(ok.elegivel, true); assert.equal(ok.valorMensal, 1666.67); assert.equal(ok.valorAnual, 21666.71);
  const teto = m.previdenciaria.estimarCompensacao({ valorBeneficio: 20000, tempoRegimeOrigemAnos: 15, tempoTotalAnos: 30 }, P, I.tetoRGPS);
  assert.equal(teto.valorMensal, 4237.78);
  const curto = m.previdenciaria.estimarCompensacao({ valorBeneficio: 5000, tempoRegimeOrigemAnos: 0.5, tempoTotalAnos: 30 }, P, I.tetoRGPS);
  assert.equal(curto.elegivel, false); assert.equal(curto.valorMensal, 0);
  assert.equal(m.previdenciaria.estimarCompensacao({ valorBeneficio: 5000, tempoRegimeOrigemAnos: 10, tempoTotalAnos: 30, compensacaoPrevia: true }, P, I.tetoRGPS).elegivel, false);
  assert.throws(() => m.previdenciaria.estimarCompensacao({ valorBeneficio: 5000, tempoRegimeOrigemAnos: 40, tempoTotalAnos: 30 }, P, I.tetoRGPS), { codigo: 'ENTRADA_INVALIDA' });
});

test('projeção atuarial: gera o horizonte e acha o ano do primeiro déficit', () => {
  const r = m.previdenciaria.calcularProjecaoAtuarial({ ativos: 100, inativos: 400, salarioMedioAnual: 50000, beneficioMedioAnual: 60000, horizonteAnos: 10 }, P);
  assert.equal(r.anos.length, 10); assert.equal(r.anoPrimeiroDeficit, 1);
  assert.ok(r.deficitAtuarialValorPresente < 0);
  const ok = m.previdenciaria.calcularProjecaoAtuarial({ ativos: 1000, inativos: 10, salarioMedioAnual: 50000, beneficioMedioAnual: 10000, horizonteAnos: 3 }, P);
  assert.equal(ok.anoPrimeiroDeficit, null); assert.equal(ok.deficitAtuarialValorPresente, 0);
});

test('score: pesos, limites e classificação', () => {
  const D = m.diagnostico;
  const crpOk = { regular: true, status: 'REGULAR' };
  const sup = { tipo: 'SUPERAVIT', percentualSobreReceita: 10 };
  assert.equal(D.scorePrevidenciario({ crp: crpOk, resultado: sup, obrigacoesRGPSRegularizadas: true, rppsRegularizado: true, compensacoesAtualizadas: true }), 100);
  assert.equal(D.scorePrevidenciario({ crp: { regular: false }, resultado: { tipo: 'DEFICIT', percentualSobreReceita: -40 }, obrigacoesRGPSRegularizadas: false }), 0);
  assert.equal(D.scoreFiscal({ notificacoes: 0, todasObrigacoesEmDia: true, impostosRecolhidos: true, passivoFiscal: 0, receitaCorrenteLiquida: 1e6 }), 100);
  assert.equal(D.scoreFiscal({ notificacoes: 5, todasObrigacoesEmDia: false, impostosRecolhidos: false, passivoFiscal: 5e6, receitaCorrenteLiquida: 1e6 }), 0);
  assert.equal(D.scoreConsolidado(80, 70).scoreTotal, 75); assert.equal(D.scoreConsolidado(80, 70).classificacao, 'BOA');
  assert.equal(D.scoreConsolidado(95).classificacao, 'EXCELENTE');
  assert.equal(D.classificar(60), 'REGULAR'); assert.equal(D.classificar(39.9), 'CRITICA'); assert.equal(D.classificar(40), 'RUIM');
  assert.throws(() => D.scoreConsolidado(), { codigo: 'SEM_DADOS' });
});

test('diagnóstico previdenciário: CRP vencido gera risco R001 e recomendação crítica primeiro', () => {
  const d = m.diagnostico.diagnosticoPrevidenciario({
    baseServidoresAnual: 6000000, aposentados: 500, pensionistas: 100, valorMedioAposentadoria: 4000, valorMedioPensao: 2500,
    crp: { numero: 'C1', dataValidade: dia(-10) }, repassesBloqueados: 900000,
    beneficios: [{ valorBeneficio: 5000, tempoRegimeOrigemAnos: 10, tempoTotalAnos: 30 }]
  }, P, { tetoRGPS: I.tetoRGPS, hoje });
  assert.ok(d.riscos.some((r) => r.id === 'R001' && r.severidade === 'CRITICA'));
  assert.equal(d.recomendacoes[0].prioridade, 'CRITICA');
  assert.equal(d.potencialCompensacao, 21666.71);
  assert.ok(d.scorePrevidenciario >= 0 && d.scorePrevidenciario <= 100);
});

test('diagnóstico IRRF: obrigação atrasada gera multa, risco R003 e status IRREGULAR', () => {
  const d = m.diagnostico.diagnosticoIRRF({
    servidores: [{ rendimentoBruto: 10000 }, { rendimentoBruto: 3000 }],
    pagamentos: [{ valorNota: 100000, natureza: 'servicos' }],
    obrigacoes: [{ tipo: 'DCTFWeb', periodo: '2026-09', situacao: 'ATRASADA', valorDevido: 10000, vencimento: dia(-10) }, { tipo: 'EFD-Reinf', situacao: 'EM_DIA' }],
    notificacoesFiscais: 1, receitaCorrenteLiquida: 5000000
  }, { irrf: T, inss: I, retencao: m.parametros.RETENCAO_FORNECEDOR }, { hoje });
  assert.equal(d.statusFiscal, 'IRREGULAR');
  assert.equal(d.retencoes.prestadores, 4800);
  assert.ok(d.riscos.some((r) => r.id === 'R003')); assert.ok(d.riscos.some((r) => r.id === 'R005'));
  assert.ok(d.passivoFiscal >= 330);
  const limpo = m.diagnostico.diagnosticoIRRF({ servidores: [], obrigacoes: [] }, { irrf: T, inss: I, retencao: m.parametros.RETENCAO_FORNECEDOR }, { hoje });
  assert.equal(limpo.statusFiscal, 'REGULAR'); assert.equal(limpo.scoreFiscal, 100);
});
