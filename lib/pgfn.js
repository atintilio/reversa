
const brlT = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });// Motor determinístico da Transação PGFN (adesão por capacidade de pagamento) — sem banco, sem rede, sem aleatoriedade.
// Mesmos insumos + mesmo catálogo = mesmo resultado e mesmo input_hash.
//
// O QUE ESTE MOTOR FAZ E NÃO FAZ
//  - A CAPAG oficial é uma ESTIMATIVA da PGFN (valor em R$ que o contribuinte pagaria em 60 meses numa execução fiscal),
//    consultada no Regularize. O motor NÃO a recalcula: usa o valor informado e compara com o passivo.
//  - A: alta e B: média recuperabilidade (CAPAG suficiente para quitar o passivo) → entrada facilitada, SEM desconto.
//    C: difícil e D: irrecuperável (CAPAG insuficiente) → prazo alongado e desconto sobre juros, multas e encargo legal.
//    A fronteira entre A×B e entre C×D segue metodologia do Regularize que não conseguimos reproduzir: o motor trabalha
//    com o GRUPO (A/B ou C/D). Se o rating exato for informado, ele é respeitado.
//  - Regras R01–R18 do catálogo de André ainda NÃO foram informadas. As verificações abaixo (P01+) usam apenas norma conferida.
//  - Tratamento de IRPJ/CSLL sobre o desconto/pagamentos: NÃO avaliado (a confirmar). Nenhum número é inventado.
const crypto = require('node:crypto');

const ENGINE_VERSION = 'pgfn-engine-0.1';

// Parâmetros vigentes conforme Edital PGDAU nº 6/2026 (reaberto pelo nº 10/2026 até 29/01/2027), Portaria PGFN/MF nº 6.757/2022
// e Lei nº 13.988/2020. FONTE: páginas de escritórios (Barbieri, Sarkis Angelo, Scott Group) e página oficial do edital anterior
// (PGDAU nº 2/2024). Confirmar no texto oficial do edital antes de uso com cliente: por isso o status abaixo.
const CATALOG = {
  version: 'pgdau-6-2026+10-2026|portaria-6757-2022|lei-13988-2020|2026-10-15',
  status: 'a_confirmar_no_edital_oficial',
  verificadoEm: '2026-10-15',
  adesaoAte: '2027-01-29',
  inscricoesAte: '2026-07-03',
  limiteConsolidado: 45000000,
  previdenciarioMaxParcelas: 60,
  descontoMaxSobreTotal: { geral: 0.65, diferenciado: 0.70 }, // Lei 13.988 art. 11 §2º e edital
  entradaPct: 0.06,
  entradaParcelas: { geral: 6, diferenciado: 12 },
  saldoParcelas: { geral: 114, diferenciado: 133 },
  parcelaMinima: { mei: 25, demais: 100 },
  perfis: {
    geral: 'Pessoa jurídica em geral',
    diferenciado: 'ME, EPP, cooperativa, OSC, instituição de ensino, Santa Casa ou empresa em recuperação judicial',
    mei: 'MEI'
  },
  fontes: [
    { kind: 'norma', url: 'https://www.gov.br/pgfn/pt-br/servicos/orientacoes-contribuintes/acordo-de-transacao/edital/transacao-conforme-a-capacidade-de-pagamento', validationStatus: 'informado_nao_validado' },
    { kind: 'norma', url: 'https://www.barbieriadvogados.com/edital-pgfn-6-2026-transacao-tributaria/', validationStatus: 'informado_nao_validado' },
    { kind: 'norma', url: 'https://www.barbieriadvogados.com/capag-pgfn-transacao-tributaria/', validationStatus: 'informado_nao_validado' }
  ],
  revisaoCapag: {
    prazoDias: 30, recursoDias: 10, onde: 'Regularize > Negociar Dívida > Revisão da Capacidade de Pagamento (CAPAG); conta gov.br prata ou ouro',
    documentosPJ: ['Laudo técnico', 'Balanço, DRE e fluxo de caixa pelo método direto dos dois últimos exercícios e do exercício em curso', 'Declarações cadastrais, patrimoniais e econômico-fiscais'],
    novoPedido: 'Só diante de fato superveniente ou mudança substancial da capacidade presumida; não se rediscute os mesmos elementos.',
    base: 'Portaria PGFN/MF 6.757/2022 arts. 30, 33, 34-A e 34-B; Portaria PGFN/MF 1.241/2023 e 1.457/2024'
  }
};

// Verificações provisórias (P01+). Cada uma cita a base; nenhuma depende do catálogo R01–R18 ainda não informado.
const REGRAS = [
  { code: 'P01', titulo: 'Valor consolidado até R$ 45 milhões', severity: 'hard' },
  { code: 'P02', titulo: 'Inscrições até 03/07/2026 (data de corte do edital)', severity: 'hard' },
  { code: 'P03', titulo: 'Inscrições garantidas, parceladas ou suspensas por decisão judicial ficam fora do cálculo', severity: 'hard' },
  { code: 'P04', titulo: 'Devedor contumaz é vedado (Lei 13.988/2020 art. 5º, III)', severity: 'hard' },
  { code: 'P05', titulo: 'Sem transação rescindida nos últimos 2 anos', severity: 'hard' },
  { code: 'P06', titulo: 'Classificação CAPAG conhecida (A/B sem desconto; C/D com desconto e prazo alongado)', severity: 'hard' },
  { code: 'P07', titulo: 'Prestação cabe no caixa mensal informado', severity: 'hard' },
  { code: 'P08', titulo: 'Desconto só sobre juros, multas e encargo legal, até o teto sobre o total; principal nunca é reduzido', severity: 'hard' },
  { code: 'P09', titulo: 'Previdenciário: no máximo 60 prestações', severity: 'hard' },
  { code: 'P10', titulo: 'Prestação mínima (R$ 100; R$ 25 para MEI)', severity: 'hard' },
  { code: 'P11', titulo: 'Crédito irrecuperável (Portaria 6.757/2022, art. 25) pode mudar o enquadramento', severity: 'informational' },
  { code: 'P12', titulo: 'Prejuízo fiscal e base negativa da CSLL não podem ser usados na adesão', severity: 'informational' }
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
// FactNumber {value,status} ou número puro → valor
function fact(v) { if (v && typeof v === 'object' && !Array.isArray(v)) return num(v.value); return num(v); }
function factStatus(v) { return v && typeof v === 'object' && v.status ? v.status : (num(v) === null ? 'desconhecido' : 'informado_nao_validado'); }

function canonical(o) {
  if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  return JSON.stringify(o === undefined ? null : o);
}
function inputHash(debts, facts) { return crypto.createHash('sha256').update(canonical({ debts, facts, catalog: CATALOG.version, engine: ENGINE_VERSION })).digest('hex'); }

function normFacts(raw) {
  const f = raw || {};
  return {
    perfil: ['geral', 'diferenciado', 'mei'].includes(f.perfil) ? f.perfil : null,
    capag: fact(f.capagValue), capagStatus: factStatus(f.capagValue),
    rating: ['A', 'B', 'C', 'D'].includes(String(f.capagRating || '').toUpperCase()) ? String(f.capagRating).toUpperCase() : null,
    passivoOutros: fact(f.passivoRfb), // passivo na Receita Federal e outros que a CAPAG também considera
    caixaMensal: fact(f.monthlyCashCapacity),
    selicAnual: fact(f.selicAnnual), // taxa anual assumida para o reajuste das prestações (Selic + 1% no mês do pagamento)
    descontoAnual: fact(f.discountRateAnnual), // taxa anual para valor presente
    contumaz: f.devedorContumaz === true ? true : f.devedorContumaz === false ? false : null,
    rescindida2anos: f.transacaoRescindida2anos === true ? true : f.transacaoRescindida2anos === false ? false : null,
    sensibilidades: Array.isArray(f.rateSensitivities) ? f.rateSensitivities : []
  };
}

// Normaliza uma dívida: total, principal e acréscimos (o que pode ser descontado) — nulo quando não dá para saber.
function normDebt(d, i) {
  const principal = num(d.principalAmount), updated = num(d.updatedBalance), original = num(d.originalAmount);
  const parts = [num(d.interestAmount), num(d.penaltyAmount), num(d.legalChargesAmount)];
  let total = updated;
  if (total === null && principal !== null && parts.every((p) => p !== null)) total = principal + parts[0] + parts[1] + parts[2];
  if (total === null) total = original; // último recurso, marcado como estimativa
  const totalEstimado = updated === null && !(principal !== null && parts.every((p) => p !== null));
  let acrescimos = null;
  if (principal !== null && total !== null) acrescimos = Math.max(0, round2(total - principal));
  else if (parts.every((p) => p !== null)) acrescimos = round2(parts[0] + parts[1] + parts[2]);
  return {
    ref: d.externalDebtReference || d.id || ('#' + (i + 1)), kind: d.debtKind || 'desconhecido', status: d.administrativeStatus || 'desconhecida',
    inscricao: d.inscriptionDate || null, total: total === null ? null : round2(total), principal: principal === null ? null : round2(principal),
    acrescimos, totalEstimado, previdenciario: d.debtKind === 'previdenciario', dataStatus: d.dataStatus || 'informado_nao_validado'
  };
}

function elegibilidade(debts, cat) {
  const fora = [];
  const dentro = debts.filter((d) => {
    if (d.status === 'quitada') { fora.push({ ref: d.ref, motivo: 'quitada' }); return false; }
    if (['suspensa', 'garantida', 'parcelada'].includes(d.status)) { fora.push({ ref: d.ref, motivo: d.status === 'suspensa' ? 'suspensa por decisão judicial' : d.status }); return false; }
    if (d.inscricao && d.inscricao > cat.inscricoesAte) { fora.push({ ref: d.ref, motivo: 'inscrita após ' + cat.inscricoesAte }); return false; }
    return true;
  });
  return { dentro, fora };
}

// ---- cronograma de pagamento -------------------------------------------------------------------------------------------
function mensal(anual) { return anual === null ? null : Math.pow(1 + anual, 1 / 12) - 1; }

// n = número de prestações do saldo (0 = à vista). Retorna fluxo mês a mês.
function cronograma({ dentro, group, perfil, n, desconto, cat, selicAnual }) {
  const total = dentro.reduce((s, d) => s + (d.total || 0), 0);
  const prev = dentro.filter((d) => d.previdenciario);
  const outros = dentro.filter((d) => !d.previdenciario);
  const dscPrev = desconto.porDivida.filter((x) => x.prev).reduce((s, x) => s + x.valor, 0);
  const dscOutros = desconto.porDivida.filter((x) => !x.prev).reduce((s, x) => s + x.valor, 0);
  const totPrev = prev.reduce((s, d) => s + (d.total || 0), 0), totOutros = total - totPrev;
  const dif = perfil === 'diferenciado' || perfil === 'mei';
  const flux = [];
  const mSelic = mensal(selicAnual);
  const fator = (t) => (mSelic === null ? 1 : Math.pow(1 + mSelic, t) + 0.01);
  if (n === 0) { // à vista
    flux.push({ t: 1, valor: round2(total - desconto.total), tipo: 'avista' });
    return { flux, entrada: 0, saldo: round2(total - desconto.total), total: round2(total), parcelasSaldo: 0, nSaldoPrev: 0, ajustes: [] };
  }
  const E = dif ? cat.entradaParcelas.diferenciado : cat.entradaParcelas.geral;
  const entrada = round2(total * cat.entradaPct);
  for (let t = 1; t <= E; t++) flux.push({ t, valor: round2(entrada / E), tipo: 'entrada' });
  const saldo = Math.max(0, round2(total - desconto.total - entrada));
  const saldoPrev = Math.max(0, round2(totPrev - dscPrev - entrada * (total ? totPrev / total : 0)));
  const saldoOutros = Math.max(0, round2(saldo - saldoPrev));
  const nPrev = Math.min(n, cat.previdenciarioMaxParcelas);
  const ajustes = [];
  if (prev.length && n > cat.previdenciarioMaxParcelas) ajustes.push('Parte previdenciária limitada a ' + cat.previdenciarioMaxParcelas + ' prestações.');
  for (let k = 1; k <= n; k++) {
    let v = 0;
    if (k <= nPrev && saldoPrev) v += saldoPrev / nPrev;
    if (saldoOutros) v += saldoOutros / n;
    if (v > 0) flux.push({ t: E + k, valor: round2(v * fator(E + k)), tipo: 'saldo' });
  }
  return { flux, entrada, saldo, total: round2(total), parcelasSaldo: n, nSaldoPrev: nPrev, ajustes, E };
}

function valorPresente(flux, descontoAnual) {
  const m = mensal(descontoAnual);
  if (m === null) return null;
  return round2(flux.reduce((s, f) => s + f.valor / Math.pow(1 + m, f.t), 0));
}

function descontoGrupo({ dentro, group, perfil, cat }) {
  // Só C/D têm desconto. Principal nunca é reduzido; teto = % do total de cada inscrição.
  const cap = cat.descontoMaxSobreTotal[perfil === 'geral' || !perfil ? 'geral' : 'diferenciado'];
  const porDivida = [], incompletas = [];
  let total = 0;
  for (const d of dentro) {
    let valor = 0;
    if (group === 'CD') {
      if (d.acrescimos === null || d.total === null) incompletas.push(d.ref);
      else valor = round2(Math.min(d.acrescimos, cap * d.total));
    }
    total += valor;
    porDivida.push({ ref: d.ref, valor, prev: d.previdenciario });
  }
  return { total: round2(total), cap, porDivida, incompletas };
}

// ---- cenários --------------------------------------------------------------------------------------------------------------
function grupoDoRating(f, passivo) {
  if (f.rating) return { grupo: f.rating === 'A' || f.rating === 'B' ? 'AB' : 'CD', origem: 'informado' };
  if (f.capag !== null && passivo !== null) return { grupo: f.capag >= passivo ? 'AB' : 'CD', origem: 'derivado' };
  return { grupo: null, origem: null };
}

function avaliarRegras(ctx, sc) {
  const { cat, f, debts, dentro, fora, consolidado, perfil } = ctx;
  const out = [];
  const add = (code, status, reasonCode, explanation, extra = {}) => out.push({ ruleCode: code, evaluationStatus: status,
    severity: REGRAS.find((r) => r.code === code).severity, reasonCode, explanation, sourceRefs: cat.fontes, ...extra });
  add('P01', consolidado === null ? 'unknown' : consolidado <= cat.limiteConsolidado ? 'satisfied' : 'violated', consolidado === null ? 'TOTAL_DESCONHECIDO' : consolidado <= cat.limiteConsolidado ? 'DENTRO_DO_LIMITE' : 'ACIMA_DO_LIMITE',
    'Consolidado das inscrições elegíveis: ' + (consolidado === null ? 'não calculável' : '' + brlT(consolidado)) + ' (limite R$ 45.000.000,00).', { evaluatedValues: { consolidado } });
  const apos = debts.filter((d) => d.inscricao && d.inscricao > cat.inscricoesAte);
  add('P02', apos.length ? 'violated' : (debts.some((d) => !d.inscricao) ? 'unknown' : 'satisfied'), apos.length ? 'INSCRICAO_APOS_CORTE' : (debts.some((d) => !d.inscricao) ? 'DATA_INSCRICAO_AUSENTE' : 'ATE_O_CORTE'),
    apos.length ? apos.length + ' inscrição(ões) posterior(es) a ' + cat.inscricoesAte + ' ficam fora do edital.' : 'Data de corte: ' + cat.inscricoesAte + '.');
  const excl = fora.filter((x) => x.motivo !== 'quitada' && !/inscrita após/.test(x.motivo));
  add('P03', debts.some((d) => d.status === 'desconhecida') ? 'unknown' : 'satisfied', excl.length ? 'INSCRICAO_EXCLUIDA_DO_CALCULO' : (debts.some((d) => d.status === 'desconhecida') ? 'SITUACAO_DESCONHECIDA' : 'SEM_EXCLUIDAS'),
    excl.length ? excl.length + ' inscrição(ões) garantida(s), parcelada(s) ou suspensa(s) saem do cálculo; a adesão deve abranger todas as demais elegíveis.' : 'Nenhuma inscrição excluída por garantia, parcelamento ou suspensão.', { evaluatedValues: { excluidas: excl } });
  add('P04', f.contumaz === null ? 'unknown' : f.contumaz ? 'violated' : 'satisfied', f.contumaz === null ? 'CONTUMACIA_NAO_INFORMADA' : f.contumaz ? 'DEVEDOR_CONTUMAZ' : 'NAO_CONTUMAZ', 'Informação do dossiê.');
  add('P05', f.rescindida2anos === null ? 'unknown' : f.rescindida2anos ? 'violated' : 'satisfied', f.rescindida2anos === null ? 'RESCISAO_NAO_INFORMADA' : f.rescindida2anos ? 'RESCISAO_RECENTE' : 'SEM_RESCISAO', 'Rescisão impede nova transação por 2 anos.');
  add('P06', sc.grupo ? 'satisfied' : 'unknown', sc.grupo ? 'CLASSIFICACAO_CONHECIDA' : 'CLASSIFICACAO_AUSENTE', sc.grupo ? 'Grupo ' + (sc.grupo === 'AB' ? 'A/B: sem desconto' : 'C/D: com desconto e prazo alongado') + ' (' + sc.origemGrupo + ').' : 'Informe a CAPAG do Regularize.');
  const pico = sc.picoCaixa;
  add('P07', f.caixaMensal === null ? 'unknown' : pico <= f.caixaMensal ? 'satisfied' : 'violated', f.caixaMensal === null ? 'CAIXA_NAO_INFORMADO' : pico <= f.caixaMensal ? 'CABE_NO_CAIXA' : 'EXCEDE_CAIXA',
    'Maior desembolso mensal no 1º ano: ' + brlT(pico) + (f.caixaMensal === null ? '.' : ' contra capacidade de ' + brlT(f.caixaMensal) + '.'), { evaluatedValues: { picoCaixa: pico, caixaMensal: f.caixaMensal } });
  add('P08', sc.desconto.incompletas.length ? 'unknown' : 'satisfied', sc.desconto.incompletas.length ? 'ACRESCIMOS_DESCONHECIDOS' : 'DESCONTO_NO_LIMITE',
    sc.desconto.incompletas.length ? 'Sem principal e saldo atualizado em ' + sc.desconto.incompletas.length + ' inscrição(ões): desconto tratado como zero até completar.' : 'Desconto limitado aos acréscimos e a ' + Math.round(sc.desconto.cap * 100) + '% do total de cada inscrição.', { evaluatedValues: { desconto: sc.desconto.total } });
  const temPrev = dentro.some((d) => d.previdenciario);
  add('P09', temPrev ? 'satisfied' : 'not_applicable', temPrev ? 'PREV_LIMITADO' : 'SEM_PREVIDENCIARIO', temPrev ? 'Parte previdenciária paga em no máximo 60 prestações; o cálculo já aplica o limite.' : 'Sem dívida previdenciária.');
  const minima = perfil === 'mei' ? cat.parcelaMinima.mei : cat.parcelaMinima.demais;
  const parcelaMin = sc.menorParcela;
  add('P10', sc.n === 0 ? 'not_applicable' : parcelaMin >= minima ? 'satisfied' : 'violated', sc.n === 0 ? 'A_VISTA' : parcelaMin >= minima ? 'ACIMA_DO_MINIMO' : 'ABAIXO_DO_MINIMO', 'Prestação mínima ' + brlT(minima) + '.');
  add('P11', 'unknown', 'ART_25_A_VERIFICAR', 'Créditos inscritos há mais de 15 anos sem garantia, suspensos há mais de 10 anos ou de devedor falido/em recuperação podem ser considerados irrecuperáveis: verificar no Regularize.');
  add('P12', 'satisfied', 'NAO_USA_PREJUIZO', 'Este cálculo não usa prejuízo fiscal nem base negativa da CSLL (vedado na adesão).');
  return out;
}

function pareto(cens) {
  const c = (x) => (x.pv !== null && x.pv !== undefined ? x.pv : x.nominalCost);
  return cens.map((a) => !cens.some((b) => b !== a && c(b) <= c(a) && b.pico <= a.pico && (c(b) < c(a) || b.pico < a.pico)));
}

function rotuloSensibilidade(kind) {
  return { irpj_csll_tax_rate: 'Alíquota de IRPJ/CSLL', cashflow_discount_rate: 'Taxa de desconto do fluxo de caixa', pgfn_discount_rate: 'Teto de desconto da PGFN' }[kind];
}

// Núcleo: calcula todos os cenários de um dossiê.
function calcular({ debts: rawDebts, facts: rawFacts }, opts = {}) {
  const cat = CATALOG;
  const f = normFacts(rawFacts);
  const debts = (rawDebts || []).map(normDebt);
  const perfil = f.perfil || 'geral';
  const { dentro, fora } = elegibilidade(debts, cat);
  const consolidado = dentro.some((d) => d.total === null) ? null : round2(dentro.reduce((s, d) => s + d.total, 0));
  const totalGeral = debts.filter((d) => d.status !== 'quitada').reduce((s, d) => s + (d.total || 0), 0);
  const passivo = debts.length ? round2(totalGeral + (f.passivoOutros || 0)) : null;
  const g = grupoDoRating(f, passivo);
  const faltando = [];
  if (!debts.length) faltando.push('Cadastrar ao menos uma inscrição em dívida ativa.');
  if (!f.perfil) faltando.push('Perfil do contribuinte (geral, ME/EPP e equiparados ou MEI): assumido "geral" (65% / 114 prestações).');
  if (f.capag === null && !f.rating) faltando.push('CAPAG e classificação (A–D) do Regularize.');
  if (f.passivoOutros === null) faltando.push('Passivo na Receita Federal (a CAPAG compara com PGFN + RFB): considerado zero.');
  if (f.caixaMensal === null) faltando.push('Capacidade de caixa mensal.');
  if (f.selicAnual === null) faltando.push('Selic anual assumida: prestações mostradas sem reajuste.');
  if (f.descontoAnual === null) faltando.push('Taxa de desconto anual: valor presente não calculado.');
  if (debts.some((d) => d.totalEstimado)) faltando.push('Saldo atualizado ausente em alguma inscrição: usado o valor original como estimativa.');
  if (dentro.some((d) => d.acrescimos === null)) faltando.push('Principal ou saldo ausente em alguma inscrição: desconto não calculado para ela.');

  const grupos = g.grupo ? [g.grupo] : ['AB', 'CD'];
  const lista = [];
  for (const grupo of grupos) {
    const desconto = descontoGrupo({ dentro, group: grupo, perfil, cat });
    const maxN = perfil === 'geral' ? cat.saldoParcelas.geral : cat.saldoParcelas.diferenciado;
    // Sem desconto/prazo alongado nos grupos A/B (só entrada facilitada): o prazo do saldo é o ordinário, tratado como "a confirmar".
    const prazos = grupo === 'CD' ? [...new Set([0, 36, 60, maxN])] : [0, 60]; // A/B: prazo de 60 meses assumido (a confirmar)
    for (const n of prazos) {
      const cr = cronograma({ dentro, group: grupo, perfil, n, desconto, cat, selicAnual: f.selicAnual });
      const minima = perfil === 'mei' ? cat.parcelaMinima.mei : cat.parcelaMinima.demais;
      const saldoParcelas = cr.flux.filter((x) => x.tipo === 'saldo');
      const menorParcela = saldoParcelas.length ? Math.min(...saldoParcelas.map((x) => x.valor)) : Infinity;
      const nominal = round2(cr.flux.reduce((s, x) => s + x.valor, 0));
      const pv = valorPresente(cr.flux, f.descontoAnual);
      const primeiroAno = cr.flux.filter((x) => x.t <= 12);
      const porMes = {}; primeiroAno.forEach((x) => { porMes[x.t] = (porMes[x.t] || 0) + x.valor; });
      const pico = round2(Math.max(0, ...Object.values(porMes)));
      const sc = { grupo, origemGrupo: g.origem || 'hipótese', n, desconto, picoCaixa: pico, menorParcela: menorParcela === Infinity ? minima : menorParcela };
      const regras = avaliarRegras({ cat, f, debts, dentro, fora, consolidado, perfil }, sc);
      const hard = regras.filter((r) => r.severity === 'hard');
      const violada = hard.some((r) => r.evaluationStatus === 'violated');
      const incerta = hard.some((r) => r.evaluationStatus === 'unknown') || !g.grupo;
      lista.push({
        scenarioKey: grupo.toLowerCase() + '_' + (n === 0 ? 'avista' : n + 'x'), group: grupo, n,
        label: (grupo === 'CD' ? 'C/D' : 'A/B') + (n === 0 ? ' · à vista' : ' · ' + n + ' prestações'),
        nominalCost: nominal, pv, picoCaixa: pico, pico, desconto: desconto.total, entrada: cr.entrada, total: cr.total, saldo: cr.saldo,
        economiaNominal: round2(cr.total - nominal), longTermEconomicImpact: pv === null ? null : round2(cr.total - pv),
        viability: violada ? 'inviavel' : incerta ? 'viavel_com_pendencia' : 'viavel',
        constraintResults: regras, assumptions: cr.ajustes.concat(grupo === 'AB' && n === 60 ? ['Prazo de 60 meses assumido para A/B (sem prazo alongado): confirmar no edital.'] : [], f.selicAnual === null ? [] : ['Reajuste das prestações: Selic anual assumida + 1% no mês do pagamento (entrada sem reajuste: a confirmar).']),
        fluxo: cr.flux
      });
    }
  }
  const par = pareto(lista.filter((s) => s.viability !== 'inviavel'));
  const viaveis = lista.filter((s) => s.viability !== 'inviavel');
  viaveis.forEach((s, i) => { s.paretoOptimal = par[i]; });
  lista.filter((s) => s.viability === 'inviavel').forEach((s) => { s.paretoOptimal = false; });
  for (const s of lista) {
    s.recommendation = s.viability === 'inviavel' ? 'do_not_recommend' : (s.viability === 'viavel' && s.paretoOptimal) ? 'recommend' : s.viability === 'viavel_com_pendencia' ? 'conditional' : 'conditional';
    s.solverStatus = s.viability === 'inviavel' ? 'proven_infeasible' : 'feasible';
    s.missingInputs = faltando.slice();
    s.rateSensitivities = sensibilidades(s, { f, dentro, cat, perfil, debts });
  }
  // melhor cenário: viável, recomendado e de menor custo (PV; sem PV, nominal)
  const rec = lista.filter((s) => s.recommendation === 'recommend').sort((a, b) => (a.pv ?? a.nominalCost) - (b.pv ?? b.nominalCost) || a.pico - b.pico)[0] || null;
  return {
    engineVersion: ENGINE_VERSION, catalogVersion: cat.version, catalogStatus: cat.status, inputHash: inputHash(rawDebts || [], rawFacts || {}),
    perfil, grupoCapag: g.grupo, origemGrupo: g.origem, passivo, consolidadoElegivel: consolidado, foraDoCalculo: fora,
    resumo: { dividas: debts.length, elegiveis: dentro.length, total: round2(totalGeral) },
    capag: { valor: f.capag, rating: f.rating, folga: f.capag !== null && passivo !== null ? round2(f.capag - passivo) : null },
    scenarios: lista, melhor: rec ? rec.scenarioKey : null, missingInputs: faltando,
    ratingWhatIf: opts.semSimulador ? null : ratingWhatIf({ debts: rawDebts, facts: rawFacts }, { f, dentro, cat, perfil, passivo }),
    regrasPendentes: 'Catálogo R01–R18 ainda não informado: as verificações P01–P12 usam só norma conferida.'
  };
}

// Sensibilidades. O tratamento de IRPJ/CSLL fica "not_evaluated" (a confirmar) e o teto de desconto varia só o que a lei fixa.
function sensibilidades(s, { f, cat, perfil }) {
  const out = [];
  const cur = s.pv;
  const base = f.descontoAnual;
  if (base !== null) {
    const alt = round2((base + 0.02) * 1e4) / 1e4; // alternativa ilustrativa: +2 p.p.
    const pvAlt = valorPresente(s.fluxo, alt);
    const delta = round2(pvAlt - cur);
    out.push({ rateKind: 'cashflow_discount_rate', unit: 'fraction', baselineRate: base, alternativeRate: alt, shortTermHorizonMonths: 12, longTermHorizonMonths: Math.max(...s.fluxo.map((x) => x.t)),
      presentValueCostDeltaBRL: delta, nominalCostDeltaBRL: 0, shortTermCostDeltaBRL: 0, longTermCostDeltaBRL: delta, breakevenMonth: null,
      recommendation: 'conditional', reasonCodes: ['VARIACAO_ILUSTRATIVA_2PP'],
      tradeOff: 'Taxa de desconto +2 p.p. (variação ilustrativa): o custo em valor presente muda ' + (delta < 0 ? 'para menos' : 'para mais') + ' em ' + brlT(Math.abs(delta)) + '. Prazos longos pesam menos quanto maior a taxa.' });
  } else {
    out.push({ rateKind: 'cashflow_discount_rate', unit: 'fraction', baselineRate: null, alternativeRate: null, shortTermHorizonMonths: 12, longTermHorizonMonths: 12, recommendation: 'not_evaluated', reasonCodes: ['TAXA_NAO_INFORMADA'], tradeOff: 'Informe a taxa anual de desconto do caixa do cliente.' });
  }
  const capBase = cat.descontoMaxSobreTotal[perfil === 'geral' ? 'geral' : 'diferenciado'];
  out.push({ rateKind: 'pgfn_discount_rate', unit: 'fraction', baselineRate: capBase, alternativeRate: capBase, shortTermHorizonMonths: 12, longTermHorizonMonths: 12, recommendation: 'not_evaluated', reasonCodes: ['TETO_FIXADO_EM_LEI'],
    tradeOff: 'O teto de ' + Math.round(capBase * 100) + '% é fixado por lei/edital; não varia por cenário.' });
  out.push({ rateKind: 'irpj_csll_tax_rate', unit: 'fraction', baselineRate: null, alternativeRate: null, shortTermHorizonMonths: 12, longTermHorizonMonths: 12, recommendation: 'not_evaluated', reasonCodes: ['TRATAMENTO_TRIBUTARIO_A_CONFIRMAR'],
    tradeOff: 'Efeito de IRPJ/CSLL sobre o desconto e sobre juros/multas pagos não foi avaliado: tratamento a confirmar antes de entrar no cálculo.' });
  return out;
}

// ---- Simulador de rating: o que muda, e se muda para melhor ou pior -------------------------------------------------------
// Direção "boa" = menor custo em valor presente (sem taxa informada, menor custo nominal). Só descreve o que a norma permite.
function ratingWhatIf({ debts: rawDebts, facts: rawFacts }, pre) {
  const f = pre ? pre.f : normFacts(rawFacts);
  const cat = pre ? pre.cat : CATALOG;
  const perfil = pre ? pre.perfil : (f.perfil || 'geral');
  const debts = (rawDebts || []).map(normDebt);
  const { dentro } = elegibilidade(debts, cat);
  const passivo = pre ? pre.passivo : (debts.length ? round2(debts.filter((d) => d.status !== 'quitada').reduce((s, d) => s + (d.total || 0), 0) + (f.passivoOutros || 0)) : null);
  if (passivo === null || (f.capag === null && !f.rating)) return { disponivel: false, motivo: 'Informe as dívidas e a CAPAG do Regularize para simular.' };
  const atual = grupoDoRating(f, passivo);
  const custo = (grupo) => {
    const desc = descontoGrupo({ dentro, group: grupo, perfil, cat });
    const n = 60; // mesmo prazo nos dois grupos: isola o efeito do desconto
    const cr = cronograma({ dentro, group: grupo, perfil, n, desconto: desc, cat, selicAnual: f.selicAnual });
    const nominal = round2(cr.flux.reduce((s, x) => s + x.valor, 0));
    const pv = valorPresente(cr.flux, f.descontoAnual);
    const primeiroAno = {}; cr.flux.filter((x) => x.t <= 12).forEach((x) => { primeiroAno[x.t] = (primeiroAno[x.t] || 0) + x.valor; });
    return { grupo, desconto: desc.total, nominal, pv, picoCaixa: round2(Math.max(0, ...Object.values(primeiroAno))), prazo: n };
  };
  const ab = custo('AB'), cd = custo('CD');
  const usaPv = ab.pv !== null && cd.pv !== null;
  const ganhoCD = round2(usaPv ? ab.pv - cd.pv : ab.nominal - cd.nominal);
  const margem = f.capag === null ? null : round2(f.capag - passivo);
  const limiar = {
    passivo, capag: f.capag,
    regra: 'Grupo A/B quando a CAPAG for suficiente para quitar o passivo; C/D quando insuficiente.',
    paraCairEmCD: f.capag === null ? null : (f.capag < passivo ? 'já está em C/D' : 'CAPAG revisada abaixo de ' + brlT(passivo)),
    paraSubirParaAB: f.capag === null ? null : (f.capag >= passivo ? 'já está em A/B' : 'CAPAG acima de ' + brlT(passivo) + ' ou passivo abaixo de ' + brlT(f.capag))
  };
  const cdMelhor = ganhoCD > 0;
  return {
    disponivel: true, atual: { grupo: atual.grupo, origem: atual.origem, rating: f.rating }, margem, limiar, comparativo: { ab, cd }, baseComparacao: usaPv ? 'valor presente' : 'valor nominal',
    ganhoDoGrupoCD: ganhoCD,
    veredito: atual.grupo === 'CD'
      ? 'Está em C/D: o desconto e o prazo alongado estão disponíveis. Subir para A/B custaria cerca de ' + brlT(Math.abs(ganhoCD)) + ' a mais (' + (usaPv ? 'valor presente' : 'nominal') + ') e tiraria o desconto: não é vantajoso para quem busca transacionar.'
      : 'Está em A/B: sem desconto, só entrada facilitada. Estar em C/D reduziria o custo em cerca de ' + brlT(Math.abs(ganhoCD)) + ' (' + (usaPv ? 'valor presente' : 'nominal') + '), mas só é possível se a CAPAG realmente for menor: a revisão exige documentação verdadeira e pode ser negada.',
    direcao: { paraCD: cdMelhor ? 'bom' : 'neutro_ou_ruim', paraAB: cdMelhor ? 'ruim' : 'neutro_ou_bom' },
    caminhosLegitimos: [
      { via: 'Pedir revisão da CAPAG', descricao: 'Quando a capacidade presumida pela PGFN não reflete a realidade do contribuinte. ' + cat.revisaoCapag.onde + '. Prazo de ' + cat.revisaoCapag.prazoDias + ' dias da ciência; recurso em ' + cat.revisaoCapag.recursoDias + ' dias.', documentos: cat.revisaoCapag.documentosPJ, observacao: cat.revisaoCapag.novoPedido },
      { via: 'Mudar o passivo comparado', descricao: 'Pagamentos, exclusão de inscrições indevidas (contestação pelo PRDI), garantias ou parcelamentos alteram o passivo; baixar o passivo pode levar ao grupo A/B e eliminar o desconto.' }
    ],
    limites: [
      'O rating é calculado pela PGFN a partir de dados cadastrais, patrimoniais e econômico-fiscais; o contribuinte só o altera pela revisão fundamentada.',
      'A fronteira entre A×B e entre C×D segue a metodologia do Regularize, que este motor não reproduz: o simulador trabalha com os grupos A/B e C/D.',
      'Os valores acima são estimativas com os parâmetros do catálogo ' + cat.version + ' (' + cat.status + ').'
    ]
  };
}

// Simula valores alternativos de CAPAG/passivo sem gravar nada (what-if do usuário).
function simularRating({ debts, facts }, { capagRevisada, passivoAjuste }) {
  const f2 = { ...(facts || {}) };
  if (capagRevisada !== undefined && capagRevisada !== null && capagRevisada !== '') f2.capagValue = { value: Number(capagRevisada), status: 'informado_nao_validado' };
  if (passivoAjuste !== undefined && passivoAjuste !== null && passivoAjuste !== '') f2.passivoRfb = { value: Math.max(0, fact(facts && facts.passivoRfb) + Number(passivoAjuste) || 0), status: 'informado_nao_validado' };
  delete f2.capagRating; // com valores novos o grupo é derivado
  return ratingWhatIf({ debts, facts: f2 });
}

// ---- Resumos para decisão (rascunhos; revisão humana antes de qualquer uso) -----------------------------------------------
function resumos(res) {
  const s = res.scenarios.find((x) => x.scenarioKey === res.melhor) || res.scenarios.filter((x) => x.viability !== 'inviavel')[0] || res.scenarios[0];
  if (!s) return [];
  const brl = (n) => n === null || n === undefined ? 'n/d' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pend = res.missingInputs.length ? ' Pendências: ' + res.missingInputs.length + '.' : '';
  const curto = 'Maior desembolso mensal no 1º ano: ' + brl(s.picoCaixa) + '.';
  const longo = s.longTermEconomicImpact !== null ? 'Economia em valor presente: ' + brl(s.longTermEconomicImpact) + '.' : 'Valor presente não calculado (taxa de desconto ausente).';
  const base = { scenarioKey: s.scenarioKey, recommendation: s.recommendation, reasonCodes: s.constraintResults.filter((r) => r.evaluationStatus !== 'satisfied' && r.evaluationStatus !== 'not_applicable').map((r) => r.reasonCode).slice(0, 12), templateVersion: 'brief-0.1' };
  if (!base.reasonCodes.length) base.reasonCodes = ['SEM_RESTRICOES'];
  return [
    { ...base, audience: 'tecnico', status: 'draft', message: 'Cenário ' + s.label + ': custo nominal ' + brl(s.nominalCost) + ', desconto ' + brl(s.desconto) + ', entrada ' + brl(s.entrada) + '.' + pend, shortTermReason: curto, longTermRisk: longo + ' Atenção: a CAPAG é estimativa da PGFN; cancelamento por atraso (3 prestações) encerra os benefícios.' },
    { ...base, audience: 'parceiro', status: 'draft', message: 'Há caminho de transação para este cliente: ' + s.label + ', com desconto estimado de ' + brl(s.desconto) + ' sobre juros, multas e encargos.' + pend, shortTermReason: curto, longTermRisk: 'Depende da classificação oficial da PGFN e de documentos do cliente; a equipe técnica confirma antes de qualquer promessa.' }
  ];
}

module.exports = { ENGINE_VERSION, CATALOG, REGRAS, calcular, simularRating, ratingWhatIf, resumos, normDebt, normFacts, inputHash, canonical, rotuloSensibilidade, round2 };
