// Parâmetros padrão do motor (vigência 2026). Em produção, a tabela gov_parametros (atualizável sem deploy)
// sobrepõe estes valores; ver carregarParametros em ../gov-motor.js.
// Fontes: tabela IRRF mensal 2026 e redutor da Lei 15.270/2025; tabela INSS 2026 (teto R$ 8.475,55; mínimo R$ 1.621,00).
// Valores conferidos em fonte secundária: confirmar com a Receita Federal / Portal Gov.br antes de uso em peça formal.
const IRRF_2026 = {
  vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31',
  faixas: [
    { ate: 2428.80, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
    { ate: null, aliquota: 0.275, deduzir: 908.73 }
  ],
  deducaoDependente: 189.59,
  descontoSimplificado: 607.20,
  // Lei 15.270/2025: até 5.000 o imposto é zerado; de 5.000,01 a 7.350 redutor = a − b × rendimento tributável.
  redutor: { isencaoAte: 5000, reducaoAte: 7350, a: 978.62, b: 0.133145 }
};
const INSS_2026 = {
  vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31',
  faixas: [
    { ate: 1621.00, aliquota: 0.075 }, { ate: 2902.84, aliquota: 0.09 },
    { ate: 4354.27, aliquota: 0.12 }, { ate: 8475.55, aliquota: 0.14 }
  ],
  tetoRGPS: 8475.55, salarioMinimo: 1621.00
};
const PREVIDENCIARIO_2026 = {
  vigenciaInicio: '2026-01-01', vigenciaFim: null,
  aliquotaServidor: 0.14,       // mínima de referência (EC 103/2019); o ente pode adotar progressiva
  aliquotaPatronal: 0.22,       // RGPS: 20% + 2% de RAT de referência; RPPS: definida em lei municipal
  metaAtuarial: 0.0545,         // referência; usar a meta do próprio RPPS
  crescimentoSalarial: 0.01,
  crpValidadeDias: 180,
  limiteAlertaCrpDias: 30
};
// Retenção de IRRF pelo município sobre pagamentos a fornecedores (IN RFB 1.234/2012, Anexo I).
// Apenas as naturezas confirmadas estão ativas; as demais devem ser cadastradas em gov_parametros após conferência.
const RETENCAO_FORNECEDOR = {
  bens: 0.012,
  servicos: 0.048
};
module.exports = { IRRF_2026, INSS_2026, PREVIDENCIARIO_2026, RETENCAO_FORNECEDOR };
