// Motor de IRRF e retenções do município — funções puras.
const { arred, diffDias, MotorCalculoError, num, data } = require('./util');
const { RETENCAO_FORNECEDOR } = require('./parametros');

/**
 * Contribuição previdenciária oficial (INSS) progressiva por faixa: soma de (valor na faixa × alíquota).
 * Limitada ao teto do salário de contribuição.
 */
function calcularINSS(tabela, salarioBruto) {
  const bruto = num(salarioBruto, 'salarioBruto');
  let anterior = 0; let total = 0;
  for (const f of tabela.faixas) {
    if (bruto <= anterior) break;
    total += (Math.min(bruto, f.ate) - anterior) * f.aliquota;
    anterior = f.ate;
  }
  return arred(total);
}

/** Imposto pela tabela progressiva: base × alíquota − parcela a deduzir (nunca negativo). */
function impostoTabela(tabela, base) {
  const b = num(base, 'baseCalculo');
  const faixa = tabela.faixas.find((f) => f.ate == null || b <= f.ate);
  const bruto = b * faixa.aliquota;
  return { faixa, impostoBruto: arred(bruto), imposto: Math.max(0, arred(bruto - faixa.deduzir)) };
}

/**
 * IRRF mensal de rendimento do trabalho (servidor), vigência 2026.
 * Base = rendimento − (contribuição oficial + dependentes + pensão + previdência complementar) — ou, se mais vantajoso,
 * desconto simplificado. Depois aplica o redutor da Lei 15.270/2025, calculado sobre o rendimento tributável bruto.
 */
function calcularIRRFMensal(tabela, inssTabela, dados) {
  const bruto = num(dados.rendimentoBruto, 'rendimentoBruto');
  const dependentes = num(dados.dependentes ?? 0, 'dependentes', { max: 50 });
  if (!Number.isInteger(dependentes)) throw new MotorCalculoError('dependentes inválido.', 'ENTRADA_INVALIDA', { campo: 'dependentes' });
  const pensao = num(dados.pensaoAlimenticia ?? 0, 'pensaoAlimenticia');
  const prevComplementar = num(dados.prevComplementar ?? 0, 'prevComplementar');
  const contribOficial = dados.contribuicaoOficial != null ? num(dados.contribuicaoOficial, 'contribuicaoOficial') : calcularINSS(inssTabela, bruto);
  // Previdência complementar: dedução limitada a 12% do rendimento bruto.
  const prevDedutivel = Math.min(prevComplementar, bruto * 0.12);

  const deducoesLegais = contribOficial + dependentes * tabela.deducaoDependente + pensao + prevDedutivel;
  const usaSimplificado = tabela.descontoSimplificado > deducoesLegais;
  const deducoes = usaSimplificado ? tabela.descontoSimplificado : deducoesLegais;
  const base = Math.max(0, arred(bruto - deducoes));

  const t = impostoTabela(tabela, base);
  const r = tabela.redutor;
  let redutor = 0;
  if (bruto <= r.isencaoAte) redutor = t.imposto;
  else if (bruto <= r.reducaoAte) redutor = Math.max(0, r.a - r.b * bruto);
  const imposto = Math.max(0, arred(t.imposto - redutor));

  return {
    rendimentoBruto: bruto, contribuicaoOficial: contribOficial, deducoes: arred(deducoes),
    modeloDeducao: usaSimplificado ? 'SIMPLIFICADO' : 'LEGAL', baseCalculo: base,
    aliquotaFaixa: t.faixa.aliquota, impostoTabela: t.imposto, redutor: arred(Math.min(redutor, t.imposto)), impostoDevido: imposto,
    aliquotaEfetiva: bruto > 0 ? arred((imposto / bruto) * 100) : 0
  };
}

/** IRRF total mensal da folha: soma por servidor (cada item no formato de calcularIRRFMensal). */
function calcularIRRFFolha(tabela, inssTabela, servidores) {
  if (!Array.isArray(servidores)) throw new MotorCalculoError('servidores deve ser uma lista.', 'ENTRADA_INVALIDA');
  const itens = servidores.map((s) => calcularIRRFMensal(tabela, inssTabela, s));
  return { quantidade: itens.length, irrfTotal: arred(itens.reduce((a, i) => a + i.impostoDevido, 0)), itens };
}

/**
 * Retenção do município sobre pagamento a fornecedor pessoa jurídica (IR retido pertence ao município — CF, art. 158, I).
 * natureza: 'bens' ou 'servicos'. Taxas em parametros.RETENCAO_FORNECEDOR (ou tabela informada).
 */
function calcularRetencaoFornecedor(dados, taxas = RETENCAO_FORNECEDOR) {
  const valor = num(dados.valorNota, 'valorNota');
  const aliquota = taxas[dados.natureza];
  if (aliquota == null) throw new MotorCalculoError('Natureza do pagamento não parametrizada.', 'NATUREZA_NAO_PARAMETRIZADA', { natureza: dados.natureza });
  return { baseCalculo: valor, aliquota, valorRetido: arred(valor * aliquota), natureza: dados.natureza };
}

/**
 * Multa de mora sobre tributo pago em atraso: 0,33% ao dia, limitada a 20% (Lei 9.430/1996, art. 61).
 * Juros (Selic) são calculados à parte, com a série oficial.
 */
function calcularMultaMora({ valorDevido, dataVencimento, dataPagamento }) {
  const v = num(valorDevido, 'valorDevido');
  const venc = data(dataVencimento, 'dataVencimento');
  const pag = data(dataPagamento ?? new Date(), 'dataPagamento');
  const dias = diffDias(pag, venc);
  if (dias <= 0) return { aplicada: false, valor: 0, diasAtraso: 0, percentual: 0 };
  const percentual = Math.min(dias * 0.33, 20);
  return { aplicada: true, valor: arred(v * percentual / 100), diasAtraso: dias, percentual: arred(percentual) };
}

/** Passivo fiscal = tributo não recolhido + multa + juros + correção (valores já calculados). */
function calcularPassivoFiscal({ tributo = 0, multa = 0, juros = 0, correcao = 0 }) {
  return arred(num(tributo, 'tributo') + num(multa, 'multa') + num(juros, 'juros') + num(correcao, 'correcao'));
}

module.exports = { calcularINSS, impostoTabela, calcularIRRFMensal, calcularIRRFFolha, calcularRetencaoFornecedor, calcularMultaMora, calcularPassivoFiscal };
