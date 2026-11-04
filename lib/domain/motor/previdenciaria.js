// Motor previdenciário do município — funções puras.
const { arred, diffDias, MotorCalculoError, num, data } = require('./util');

/**
 * Situação do CRP (Certificado de Regularidade Previdenciária).
 * Sem número → NAO_EMITIDO; validade passada → VENCIDO; até 30 dias → A_VENCER; senão REGULAR.
 */
function validarCRP(crp, params, hoje = new Date()) {
  const limite = params.limiteAlertaCrpDias ?? 30;
  if (!crp || !crp.numero || !crp.dataValidade) return { status: 'NAO_EMITIDO', regular: false, criticidade: 'CRITICA', diasParaVencer: null };
  const dias = diffDias(data(crp.dataValidade, 'crp.dataValidade'), hoje);
  const nivel = dias < 0 ? 'CRITICO' : dias <= 30 ? 'ALTO' : dias <= 60 ? 'MEDIO' : 'BAIXO';
  if (dias < 0) return { status: 'VENCIDO', regular: false, criticidade: 'CRITICA', diasParaVencer: dias, diasVencido: -dias, nivelAlerta: nivel };
  if (dias <= limite) return { status: 'A_VENCER', regular: true, criticidade: 'ALTA', diasParaVencer: dias, nivelAlerta: nivel };
  return { status: 'REGULAR', regular: true, criticidade: 'BAIXA', diasParaVencer: dias, nivelAlerta: nivel };
}

function classificarCriticidade(resultado, receita) {
  if (resultado >= 0) return 'BAIXA';
  const pct = receita > 0 ? Math.abs(resultado) / receita : 1;
  return pct > 0.30 ? 'ALTA' : pct > 0.10 ? 'MEDIA' : 'BAIXA';
}

/**
 * Resultado previdenciário anual = receita − despesa.
 * Receita = base anual dos servidores ativos × (alíquota servidor + alíquota patronal) + repasses + receitas patrimoniais.
 * Despesa = (aposentadorias + pensões + auxílios) × meses de pagamento (13 por padrão) + despesas administrativas.
 */
function calcularResultadoPrevidenciario(dados, params) {
  const base = num(dados.baseServidoresAnual, 'baseServidoresAnual');
  const aposentados = num(dados.aposentados ?? 0, 'aposentados');
  const pensionistas = num(dados.pensionistas ?? 0, 'pensionistas');
  const vmAposentadoria = num(dados.valorMedioAposentadoria ?? 0, 'valorMedioAposentadoria');
  const vmPensao = num(dados.valorMedioPensao ?? 0, 'valorMedioPensao');
  const auxilios = num(dados.auxiliosMensal ?? 0, 'auxiliosMensal');
  const meses = num(dados.mesesPagamento, 'mesesPagamento', { padrao: 13, min: 1, max: 14 });
  const receita = arred(base * (params.aliquotaServidor + params.aliquotaPatronal)
    + num(dados.repassesConstitucionais ?? 0, 'repassesConstitucionais') + num(dados.receitasPatrimoniais ?? 0, 'receitasPatrimoniais'));
  const despesa = arred((aposentados * vmAposentadoria + pensionistas * vmPensao + auxilios) * meses
    + num(dados.despesasAdministrativas ?? 0, 'despesasAdministrativas'));
  const resultado = arred(receita - despesa);
  return {
    receita, despesa, resultado, tipo: resultado >= 0 ? 'SUPERAVIT' : 'DEFICIT',
    percentualSobreReceita: receita > 0 ? arred((resultado / receita) * 100) : null,
    nivelCriticidade: classificarCriticidade(resultado, receita)
  };
}

/**
 * Estimativa de compensação previdenciária (COMPREV, Lei 9.796/1999) por benefício concedido:
 * valor mensal = benefício limitado ao teto do RGPS × (tempo no regime de origem ÷ tempo total).
 * É estimativa de diagnóstico: o valor devido depende do processamento no sistema COMPREV.
 */
function estimarCompensacao(dados, params, tetoRGPS) {
  const beneficio = num(dados.valorBeneficio, 'valorBeneficio');
  const tempoOrigem = num(dados.tempoRegimeOrigemAnos, 'tempoRegimeOrigemAnos');
  const tempoTotal = num(dados.tempoTotalAnos, 'tempoTotalAnos');
  if (tempoTotal <= 0 || tempoOrigem > tempoTotal) throw new MotorCalculoError('Tempos informados são incoerentes.', 'ENTRADA_INVALIDA');
  const motivos = [];
  if (tempoOrigem < 1) motivos.push('Tempo no regime de origem inferior a 1 ano.');
  if (dados.compensacaoPrevia) motivos.push('Já existe compensação registrada para este benefício.');
  if (dados.documentacaoCompleta === false) motivos.push('Documentação comprobatória incompleta.');
  if (motivos.length) return { elegivel: false, valorMensal: 0, valorAnual: 0, motivos };
  const baseBeneficio = Math.min(beneficio, tetoRGPS);
  const proporcao = tempoOrigem / tempoTotal;
  const mensal = arred(baseBeneficio * proporcao);
  return {
    elegivel: true, valorMensal: mensal, valorAnual: arred(mensal * 13), motivos: [],
    memoriaCalculo: { beneficio, tetoRGPS, baseBeneficio, tempoOrigem, tempoTotal, proporcao: arred(proporcao * 10000) / 10000, meses: 13 }
  };
}

/** Valor presente de um fluxo anual (ano 1 em diante) à taxa informada. */
function valorPresente(fluxos, taxa) {
  return arred(fluxos.reduce((acc, v, i) => acc + v / Math.pow(1 + taxa, i + 1), 0));
}

/**
 * Projeção atuarial simplificada (diagnóstico, não substitui a avaliação atuarial oficial):
 * ativos caem pela taxa de permanência e por novas aposentadorias; inativos crescem com aposentadorias e caem com óbitos.
 * Déficit atuarial = valor presente dos resultados anuais negativos.
 */
function calcularProjecaoAtuarial(dados, params) {
  const horizonte = num(dados.horizonteAnos, 'horizonteAnos', { padrao: 35, min: 1, max: 75 });
  const taxa = num(dados.taxaJuros, 'taxaJuros', { padrao: params.metaAtuarial, max: 0.5 });
  let ativos = num(dados.ativos, 'ativos'); let inativos = num(dados.inativos, 'inativos');
  const permanencia = num(dados.taxaPermanencia, 'taxaPermanencia', { padrao: 0.98, max: 1 });
  const pAposent = num(dados.taxaNovasAposentadorias, 'taxaNovasAposentadorias', { padrao: 0.02, max: 1 });
  const pObitos = num(dados.taxaObitos, 'taxaObitos', { padrao: 0.03, max: 1 });
  const cresc = num(dados.crescimentoSalarial, 'crescimentoSalarial', { padrao: params.crescimentoSalarial, max: 1 });
  let salario = num(dados.salarioMedioAnual, 'salarioMedioAnual'); let beneficio = num(dados.beneficioMedioAnual, 'beneficioMedioAnual');
  const anos = []; const resultados = [];
  for (let ano = 1; ano <= horizonte; ano += 1) {
    const novos = ativos * pAposent;
    ativos = ativos * permanencia - novos;
    inativos = inativos + novos - inativos * pObitos;
    salario *= 1 + cresc; beneficio *= 1 + cresc;
    const receita = ativos * salario * (params.aliquotaServidor + params.aliquotaPatronal);
    const despesa = inativos * beneficio;
    const resultado = receita - despesa;
    resultados.push(resultado);
    anos.push({ ano, ativos: arred(ativos), inativos: arred(inativos), receita: arred(receita), despesa: arred(despesa), resultado: arred(resultado) });
  }
  const deficits = resultados.map((r) => Math.min(0, r));
  return {
    anos, deficitAtuarialValorPresente: valorPresente(deficits, taxa), taxaJuros: taxa,
    anoPrimeiroDeficit: (anos.find((a) => a.resultado < 0) || {}).ano ?? null
  };
}

module.exports = { validarCRP, calcularResultadoPrevidenciario, estimarCompensacao, calcularProjecaoAtuarial, valorPresente, classificarCriticidade };
