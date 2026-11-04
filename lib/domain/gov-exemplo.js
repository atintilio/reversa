// Reversa Gov — caso de exemplo (Tupaciguara/MG) usado para ilustrar a entrega.
// Valores agregados do memorial de cálculo; nenhum dado individual de servidor.
// Fluxo: a guia mensal de INSS patronal é paga com compensação do crédito (sem precatório).

const MESES_PRAZO = 36;         // horizonte de caixa apresentado
const MES_INICIO = 4;           // compensação começa no 4º mês (3 meses de preparação)
const PARCELAS = 18;            // compensação do crédito retroativo em 18 parcelas mensais

const CASO = {
  exemplo: true,
  municipio: { nome: 'Tupaciguara', uf: 'MG', ibge: '3169604', regiao: 'Sudeste', latitude: -18.5866, longitude: -48.6985 },
  ente: 'Prefeitura Municipal de Tupaciguara',
  cnpj: '18.260.489/0001-04',
  regime: 'Regime Geral de Previdência Social (RGPS)',
  grupo: ['Prefeitura Municipal', 'Fundo Municipal de Saúde (FMS)', 'Fundo Municipal de Assistência Social (FMAS)'],
  periodo: 'Folha de pagamento de 2021 a 2025 (5 anos, prazo prescricional)',
  guiaMensal: 480000,           // guia mensal estimada de INSS patronal (aprox.)
  irrf: { cincoAnos: 623532.29, porAno: 623532.29 / 5 },
  cenarios: [
    { id: 'conservador', nome: 'Conservador', retro: 1149089.72, recAno: 296000 },
    { id: 'referencia', nome: 'Referência', retro: 1830000, recAno: 353000, destaque: true },
    { id: 'potencial', nome: 'Potencial', retro: 2504402.08, recAno: 410000 }
  ],
  // Itens exclusivos do relatório técnico (uso interno).
  tecnico: {
    passivoPatronal: 11760000,
    passivoNota: 'Valor total de INSS patronal no período; pode refletir reclassificação de verbas e não equivale a crédito.',
    pontosAtencao: [
      'Tese de RAT/GILRAT: precedente favorável no TRF-4; aplicação a ente público ainda depende de confirmação do enquadramento.',
      'FAP e CNAE do ente não confirmados em documento oficial; o cálculo usa a alíquota total de 22% (20% patronal + 2% RAT).',
      'Passivo patronal de R$ 11,76 mi pode ser reclassificação de rubricas; não entra no caixa apresentado ao município.',
      'Valores são estimativas de diagnóstico: não constituem crédito até a revisão jurídica e a validação das evidências.'
    ],
    referencias: [
      ['Lei 8.212/1991, art. 22, I e II', 'Contribuição patronal (20%) e RAT sobre a remuneração.'],
      ['Decreto 3.048/1999, Anexo V', 'Classificação de atividade e grau de risco (RAT/FAP).'],
      ['Súmula 351 do STJ', 'RAT aferido por atividade preponderante, por CNPJ.'],
      ['STF Tema 1.130', 'Titularidade municipal do IRRF retido pelo município.'],
      ['STF Tema 72 · STJ Tema 738', 'Referências do memorial anterior: conferir enunciado e tese fixada antes de usar fora do time.']
    ]
  }
};

const arred = (v) => Math.round(v * 100) / 100;

// Fluxo mensal de caixa de um cenário: parcela do crédito retroativo + economia recorrente.
function fluxo(c) {
  const parcela = c.retro / PARCELAS;
  const rec = c.recAno / 12;
  const meses = [];
  let acum = 0;
  for (let m = 1; m <= MESES_PRAZO; m += 1) {
    const ativo = m >= MES_INICIO;
    const retro = ativo && m < MES_INICIO + PARCELAS ? parcela : 0;
    const recorrente = ativo ? rec : 0;
    acum += retro + recorrente;
    meses.push({ mes: m, retro: arred(retro), recorrente: arred(recorrente), acumulado: arred(acum) });
  }
  return { parcela: arred(parcela), recMes: arred(rec), meses, total36: arred(acum) };
}

function resumo() {
  const cenarios = CASO.cenarios.map((c) => ({ ...c, ...fluxo(c) }));
  return { ...CASO, cenarios, mesesPrazo: MESES_PRAZO, mesInicio: MES_INICIO, parcelas: PARCELAS };
}

module.exports = { CASO, resumo, fluxo, MESES_PRAZO, MES_INICIO, PARCELAS };
