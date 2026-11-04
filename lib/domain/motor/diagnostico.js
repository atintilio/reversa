// Diagnóstico, score de regularidade, riscos e recomendações — funções puras.
const { arred, MotorCalculoError, num } = require('./util');
const prev = require('./previdenciaria');
const irrf = require('./irrf');

const ORDEM = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
const CLASSES = [[90, 'EXCELENTE'], [75, 'BOA'], [60, 'REGULAR'], [40, 'RUIM'], [-Infinity, 'CRITICA']];
const classificar = (s) => CLASSES.find(([min]) => s >= min)[1];
const bool = (v) => v === true;

/** Score previdenciário (0–100): CRP 30 · resultado 25 · RGPS 20 · RPPS 15 · compensações 10. */
function scorePrevidenciario({ crp, resultado, obrigacoesRGPSRegularizadas, rppsRegularizado, compensacoesAtualizadas }) {
  const pctDeficit = resultado.tipo === 'DEFICIT' && resultado.percentualSobreReceita != null ? Math.abs(resultado.percentualSobreReceita) : 0;
  const pontosResultado = resultado.tipo === 'SUPERAVIT' ? 25 : Math.max(0, 25 - pctDeficit);
  return arred((crp.regular ? 30 : 0)
    + pontosResultado + (bool(obrigacoesRGPSRegularizadas) ? 20 : 0) + (bool(rppsRegularizado) ? 15 : 0) + (bool(compensacoesAtualizadas) ? 10 : 0));
}

/** Score fiscal (0–100): notificações 30 · obrigações 30 · tributos recolhidos 25 · passivo 15. */
function scoreFiscal({ notificacoes, todasObrigacoesEmDia, impostosRecolhidos, passivoFiscal, receitaCorrenteLiquida }) {
  const pontosNotif = notificacoes === 0 ? 30 : Math.max(0, 30 - notificacoes * 10);
  const pctPassivo = receitaCorrenteLiquida > 0 ? (passivoFiscal / receitaCorrenteLiquida) * 100 : (passivoFiscal > 0 ? 100 : 0);
  const pontosPassivo = passivoFiscal <= 0 ? 15 : Math.max(0, 15 - pctPassivo);
  return arred(pontosNotif + (bool(todasObrigacoesEmDia) ? 30 : 0) + (bool(impostosRecolhidos) ? 25 : 0) + pontosPassivo);
}

/** Score consolidado: 50% previdenciário, 50% fiscal. Se só um módulo foi calculado, usa apenas ele. */
function scoreConsolidado(scorePrev, scoreFisc) {
  const partes = [scorePrev, scoreFisc].filter((s) => typeof s === 'number');
  if (!partes.length) throw new MotorCalculoError('Nenhum score disponível.', 'SEM_DADOS');
  const total = arred(partes.reduce((a, b) => a + b, 0) / partes.length);
  return { scoreTotal: total, scorePrevidenciario: scorePrev ?? null, scoreFiscal: scoreFisc ?? null, classificacao: classificar(total) };
}

/** Diagnóstico previdenciário completo (CRP, resultado, compensação, atuarial, riscos, recomendações, score). */
function diagnosticoPrevidenciario(dados, params, { tetoRGPS, hoje = new Date() } = {}) {
  const crp = prev.validarCRP(dados.crp, params, hoje);
  const resultado = prev.calcularResultadoPrevidenciario(dados, params);
  const compensacoes = (dados.beneficios || []).map((b) => prev.estimarCompensacao(b, params, tetoRGPS));
  const potencialCompensacao = arred(compensacoes.reduce((a, c) => a + (c.elegivel ? c.valorAnual : 0), 0));
  const atuarial = dados.atuarial ? prev.calcularProjecaoAtuarial(dados.atuarial, params) : null;
  const rcl = num(dados.receitaCorrenteLiquida ?? 0, 'receitaCorrenteLiquida');
  const repassesBloqueados = num(dados.repassesBloqueados ?? 0, 'repassesBloqueados');

  const riscos = []; const recomendacoes = [];
  if (!crp.regular) {
    riscos.push({ id: 'R001', tipo: 'PREVIDENCIARIO', severidade: 'CRITICA', descricao: crp.status === 'VENCIDO' ? 'CRP vencido: município em situação irregular.' : 'CRP não emitido.', impactoFinanceiro: repassesBloqueados, recomendacao: 'Regularizar junto à Secretaria de Previdência.' });
    recomendacoes.push({ titulo: 'Regularizar o CRP', prioridade: 'CRITICA', prazo: 'IMEDIATO', impactoFinanceiro: repassesBloqueados, passos: ['Levantar pendências na Secretaria de Previdência', 'Regularizar repasses em atraso', 'Solicitar a emissão do CRP'] });
  } else if (crp.status === 'A_VENCER') {
    riscos.push({ id: 'R001A', tipo: 'PREVIDENCIARIO', severidade: 'ALTA', descricao: `CRP vence em ${crp.diasParaVencer} dia(s).`, impactoFinanceiro: repassesBloqueados, recomendacao: 'Antecipar a renovação.' });
    recomendacoes.push({ titulo: 'Renovar o CRP antes do vencimento', prioridade: 'ALTA', prazo: '15_DIAS', impactoFinanceiro: repassesBloqueados, passos: ['Conferir as pendências do período', 'Protocolar a renovação'] });
  }
  if (resultado.tipo === 'DEFICIT') {
    riscos.push({ id: 'R002', tipo: 'PREVIDENCIARIO', severidade: 'ALTA', descricao: 'Déficit previdenciário corrente.', impactoFinanceiro: Math.abs(resultado.resultado), recomendacao: 'Revisar alíquotas e buscar compensações.' });
    const pct = resultado.receita > 0 ? Math.abs(resultado.resultado) / resultado.receita : 1;
    recomendacoes.push(pct > 0.30
      ? { titulo: 'Reforma previdenciária municipal', prioridade: 'ALTA', prazo: '6_MESES', impactoFinanceiro: Math.abs(resultado.resultado), passos: ['Estudo atuarial completo', 'Revisão de alíquotas', 'Proposta de lei municipal'] }
      : { titulo: 'Buscar compensação previdenciária', prioridade: 'MEDIA', prazo: '3_MESES', impactoFinanceiro: potencialCompensacao, passos: ['Levantar servidores com tempo em outros regimes', 'Calcular valores a compensar', 'Protocolar os pedidos'] });
  }
  if (atuarial && rcl > 0 && Math.abs(atuarial.deficitAtuarialValorPresente) > rcl * 0.5) {
    riscos.push({ id: 'R004', tipo: 'ATUARIAL', severidade: 'CRITICA', descricao: 'Déficit atuarial acima de 50% da receita corrente líquida.', impactoFinanceiro: Math.abs(atuarial.deficitAtuarialValorPresente), recomendacao: 'Plano de amortização.' });
  }
  const score = scorePrevidenciario({ crp, resultado, obrigacoesRGPSRegularizadas: dados.obrigacoesRGPSRegularizadas, rppsRegularizado: dados.rppsRegularizado, compensacoesAtualizadas: dados.compensacoesAtualizadas });
  return { crp, resultado, compensacoes, potencialCompensacao, atuarial, riscos, recomendacoes: ordenarRecomendacoes(recomendacoes), scorePrevidenciario: score, classificacao: classificar(score) };
}

/** Diagnóstico de IRRF (retenções, obrigações acessórias, passivo, riscos, recomendações, score). */
function diagnosticoIRRF(dados, tabelas, { hoje = new Date() } = {}) {
  const folha = irrf.calcularIRRFFolha(tabelas.irrf, tabelas.inss, dados.servidores || []);
  const irrfServidores = dados.irrfServidoresInformado != null ? num(dados.irrfServidoresInformado, 'irrfServidoresInformado') : folha.irrfTotal;
  const prestadores = (dados.pagamentos || []).map((p) => irrf.calcularRetencaoFornecedor(p, tabelas.retencao));
  const irrfPrestadores = arred(prestadores.reduce((a, p) => a + p.valorRetido, 0));
  const obrigacoes = dados.obrigacoes || [];
  const atrasadas = obrigacoes.filter((o) => o.situacao === 'ATRASADA');
  const multasObrigacoes = arred(atrasadas.reduce((a, o) => a + irrf.calcularMultaMora({ valorDevido: num(o.valorDevido ?? 0, 'valorDevido'), dataVencimento: o.vencimento, dataPagamento: hoje }).valor, 0));
  const passivoFiscal = irrf.calcularPassivoFiscal({ tributo: dados.tributoNaoRecolhido ?? 0, multa: (dados.multasAplicadas ?? 0) + multasObrigacoes, juros: dados.jurosMora ?? 0, correcao: dados.correcaoMonetaria ?? 0 });
  const notificacoes = num(dados.notificacoesFiscais ?? 0, 'notificacoesFiscais');
  const todasEmDia = atrasadas.length === 0;
  const status = notificacoes > 0 || !todasEmDia ? 'IRREGULAR' : (dados.pendenciasMenores ? 'PENDENTE' : 'REGULAR');
  const rcl = num(dados.receitaCorrenteLiquida ?? 0, 'receitaCorrenteLiquida');

  const riscos = []; const recomendacoes = [];
  if (atrasadas.length) {
    riscos.push({ id: 'R003', tipo: 'FISCAL', severidade: 'ALTA', descricao: 'Obrigações acessórias em atraso.', impactoFinanceiro: multasObrigacoes, recomendacao: 'Entregar as obrigações pendentes e tratar as multas.' });
    recomendacoes.push({ titulo: 'Regularizar obrigações acessórias', prioridade: 'ALTA', prazo: '15_DIAS', impactoFinanceiro: multasObrigacoes, passos: atrasadas.map((o) => `Entregar ${o.tipo}${o.periodo ? ` (${o.periodo})` : ''}`) });
  }
  if (notificacoes > 0) {
    riscos.push({ id: 'R005', tipo: 'FISCAL', severidade: 'ALTA', descricao: `${notificacoes} notificação(ões) fiscal(is) aberta(s).`, impactoFinanceiro: passivoFiscal, recomendacao: 'Responder ou regularizar as notificações.' });
    recomendacoes.push({ titulo: 'Tratar notificações fiscais', prioridade: 'ALTA', prazo: '30_DIAS', impactoFinanceiro: passivoFiscal, passos: ['Levantar as notificações no e-CAC', 'Responder ou regularizar cada uma'] });
  }
  const score = scoreFiscal({ notificacoes, todasObrigacoesEmDia: todasEmDia, impostosRecolhidos: dados.impostosRecolhidos !== false, passivoFiscal, receitaCorrenteLiquida: rcl });
  return {
    statusFiscal: status, retencoes: { servidores: arred(irrfServidores), prestadores: irrfPrestadores, total: arred(irrfServidores + irrfPrestadores) },
    folha: { quantidade: folha.quantidade, irrfCalculado: folha.irrfTotal }, obrigacoes, passivoFiscal,
    riscos, recomendacoes: ordenarRecomendacoes(recomendacoes), scoreFiscal: score, classificacao: classificar(score)
  };
}

function ordenarRecomendacoes(lista) {
  return lista.slice().sort((a, b) => (ORDEM[a.prioridade] - ORDEM[b.prioridade]) || (b.impactoFinanceiro - a.impactoFinanceiro));
}

module.exports = { scorePrevidenciario, scoreFiscal, scoreConsolidado, classificar, diagnosticoPrevidenciario, diagnosticoIRRF, ordenarRecomendacoes };
