/*
 * motor-cbs-ibs.js — Reversa Tax
 * Projeção CBS/IBS 2027 (Reforma Tributária — LC 214/2025)
 *
 * Contexto legal:
 *   - Lei Complementar 214/2025 (sancionada em 16/01/2025, vigência 01/01/2026)
 *     institui o IBS (Imposto sobre Bens e Serviços) e a CBS (Contribuição sobre
 *     Bens e Serviços), substituindo progressivamente PIS, COFINS, IPI, ICMS e ISS.
 *   - Regime de transição: 2026-2032 (arts. 348–421 da LC 214/2025).
 *   - PIS e COFINS extintos a partir de 01/01/2027 (art. 353, LC 214/2025).
 *   - Alíquota de referência CBS: 9,21% (projeção CGIBS 2026/08; [VALIDAR] quando RFB
 *     publicar resolução definitiva conforme art. 9º da LC 214/2025).
 *   - Alíquota IBS: em definição pelo Senado; estimativa combinada (estados+municípios)
 *     de 18,7% na alíquota de referência plena (arts. 12–17 da LC 214/2025). [VALIDAR]
 *   - Teto constitucional combinado: 26,5% (EC 132/2023 + LC 214/2025).
 *   - Cashback CBS começa em 2027; cashback IBS começa em 2029 (art. 391, LC 214/2025).
 *   - Regime não-cumulativo: créditos sobre entradas tributadas (físicos e financeiros),
 *     semelhante ao PIS/COFINS não-cumulativo atual (art. 28 e ss. da LC 214/2025).
 *
 * Todos os valores monetários em CENTAVOS (inteiros), igual ao motor-creditos.js.
 * Funciona no navegador (window.MotorCbsIbs) e no Node (module.exports).
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MotorCbsIbs = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSAO_MOTOR = '0.1.0';

  // ------------------------------------------------------------------ constantes

  /**
   * Tabela de transição CBS por ano de competência.
   * Fonte: art. 353–354 da LC 214/2025 + tabela divulgada pelo CGIBS (ago/2026).
   *
   * Coluna `cbsPct`: alíquota CBS (%) aplicável naquele ano.
   * Em 2026, a alíquota é de 0,9% (fase-teste, com compensação PIS/COFINS mantida).
   * Em 2027-2028: alíquota de referência menos 0,1 p.p. (~9,11%).   [VALIDAR quando RFB publicar]
   * Em 2029 em diante: alíquota de referência plena (~9,21%).        [VALIDAR]
   *
   * Coluna `ibsPct`: alíquota IBS (%) vigente naquele ano (crescimento gradual).
   * Fase-teste (2026-2028): 0,1% fixo (compensação ICMS/ISS integrais).
   * A partir de 2029: IBS cresce 10% da referência plena ao ano.     [VALIDAR resolução Senado]
   *
   * Coluna `pisCofinsPct`: PIS+COFINS ainda em vigor naquele ano (regime não-cumulativo padrão).
   * Em 2027, PIS e COFINS são extintos (art. 353 da LC 214/2025).
   */
  var TABELA_TRANSICAO = {
    2026: { cbsPct: 0.90,  ibsPct: 0.10,  pisCofinsPct: 9.25, descricao: 'Fase-teste CBS/IBS; PIS+COFINS mantidos com compensação' },
    2027: { cbsPct: 9.11,  ibsPct: 0.10,  pisCofinsPct: 0.00, descricao: 'CBS definitiva; PIS/COFINS extintos; IBC ainda mínimo' },   // [VALIDAR] -0,1 p.p. da referência
    2028: { cbsPct: 9.11,  ibsPct: 0.10,  pisCofinsPct: 0.00, descricao: 'Mantém patamares de 2027' },
    2029: { cbsPct: 9.21,  ibsPct: 1.87,  pisCofinsPct: 0.00, descricao: 'CBS ref. plena; IBS 10% da ref.; ICMS/ISS a 90%' },         // 10% × 18,7 = 1,87
    2030: { cbsPct: 9.21,  ibsPct: 3.74,  pisCofinsPct: 0.00, descricao: 'IBS 20% da ref.; ICMS/ISS a 80%' },
    2031: { cbsPct: 9.21,  ibsPct: 5.61,  pisCofinsPct: 0.00, descricao: 'IBS 30% da ref.; ICMS/ISS a 70%' },
    2032: { cbsPct: 9.21,  ibsPct: 7.48,  pisCofinsPct: 0.00, descricao: 'IBS 40% da ref.; ICMS/ISS a 60%' },
    2033: { cbsPct: 9.21,  ibsPct: 18.70, pisCofinsPct: 0.00, descricao: 'Sistema pleno; ICMS e ISS extintos' },                       // [VALIDAR] alíquota IBS plena definida pelo Senado
  };

  /**
   * Alíquotas PIS/COFINS atuais (Lucro Real, não-cumulativo) — referência para comparação.
   * PIS: 1,65% | COFINS: 7,60% | soma: 9,25%
   * Fonte: Lei 10.637/2002 e Lei 10.833/2003.
   */
  var ALIQUOTAS_PIS_COFINS = { pis: 1.65, cofins: 7.60, total: 9.25 };

  /**
   * Alíquota de referência CBS plena (estimativa CGIBS ago/2026). [VALIDAR]
   */
  var CBS_REFERENCIA_PCT = 9.21;

  /**
   * Alíquota de referência IBS plena estimada (soma estados+municípios). [VALIDAR resolução Senado]
   */
  var IBS_REFERENCIA_PCT = 18.70;

  // ------------------------------------------------------------------ utilitários internos

  /** Arredonda centavos: multiplica pct/100 e garante inteiro. */
  function aplicarAliquota(centavosBase, pct) {
    return Math.round(centavosBase * pct / 100);
  }

  /** Retorna o ano numérico de uma competência "YYYY-MM" ou YYYY. */
  function anoDeCompetencia(competencia) {
    var s = String(competencia || '').trim();
    var m = s.match(/^(\d{4})/);
    if (!m) throw new Error('Competência inválida: "' + competencia + '"');
    return parseInt(m[1], 10);
  }

  /** Devolve o registro da tabela de transição para o ano, ou null se fora do intervalo. */
  function regimeDoAno(ano) {
    return TABELA_TRANSICAO[ano] || null;
  }

  // ------------------------------------------------------------------ funções públicas

  /**
   * Projeta o impacto CBS/IBS sobre os dados apurados pelo motor-creditos.js.
   *
   * @param {Object} dadosEfd   Resultado de `MotorCreditos.apurar(...)`.
   *                            Espera: dadosEfd.total.receitaBruta (centavos),
   *                                    dadosEfd.total.entradas (centavos) — base de crédito.
   *                            Se ausentes, usa dadosEfd.resumo como fallback.
   * @param {string|number} competencia  "2027-01", "2027" ou 2027.
   *                                     Determina o regime de transição aplicável.
   * @returns {Object} Resultado da projeção (ver JSDoc abaixo).
   */
  function projetarCbsIbs(dadosEfd, competencia) {
    if (!dadosEfd || typeof dadosEfd !== 'object') {
      throw new Error('dadosEfd inválido: esperado objeto resultado do motor-creditos.js');
    }

    var ano = anoDeCompetencia(competencia);
    var regime = regimeDoAno(ano);

    if (!regime) {
      return {
        competencia: String(competencia),
        ano: ano,
        erro: 'Ano ' + ano + ' fora do período de transição mapeado (2026-2033). Nenhuma projeção disponível.',
        regime: null,
        projecao: null,
      };
    }

    // Extrai base de receita bruta — tenta vários caminhos do objeto dadosEfd
    var receitaBruta = 0;
    if (dadosEfd.total && dadosEfd.total.receitaBruta != null) {
      receitaBruta = dadosEfd.total.receitaBruta;
    } else if (dadosEfd.resumo && dadosEfd.resumo.receitaBruta != null) {
      receitaBruta = dadosEfd.resumo.receitaBruta;
    } else if (typeof dadosEfd.receitaBruta === 'number') {
      receitaBruta = dadosEfd.receitaBruta;
    }

    // Base de crédito sobre entradas tributadas (regime não-cumulativo LC 214/2025 art. 28)
    // Usa entradas do motor-creditos; se ausente, estima 60% da receita bruta [VALIDAR]
    var entradasTributadas = 0;
    if (dadosEfd.total && dadosEfd.total.entradas != null) {
      entradasTributadas = dadosEfd.total.entradas;
    } else if (dadosEfd.resumo && dadosEfd.resumo.entradas != null) {
      entradasTributadas = dadosEfd.resumo.entradas;
    } else if (typeof dadosEfd.entradas === 'number') {
      entradasTributadas = dadosEfd.entradas;
    } else {
      // Estimativa conservadora [VALIDAR]: sem dados de entradas, não projeta crédito
      entradasTributadas = 0;
    }

    // ---- CBS ----
    // Débito CBS: alíquota sobre receita bruta
    var debitoCbs = aplicarAliquota(receitaBruta, regime.cbsPct);

    // Crédito CBS: alíquota sobre entradas tributadas (regime não-cumulativo — LC 214/2025 art. 28)
    var creditoCbs = aplicarAliquota(entradasTributadas, regime.cbsPct);

    // CBS apurada (débito - crédito)
    var cbsApurada = Math.max(0, debitoCbs - creditoCbs);

    // ---- IBS ----
    // Débito IBS sobre receita bruta
    var debitoIbs = aplicarAliquota(receitaBruta, regime.ibsPct);

    // Crédito IBS sobre entradas tributadas (mesma alíquota — regime não-cumulativo)
    var creditoIbs = aplicarAliquota(entradasTributadas, regime.ibsPct);

    // IBS apurado (débito - crédito)
    var ibsApurado = Math.max(0, debitoIbs - creditoIbs);

    // ---- PIS + COFINS (referência atual para comparação) ----
    // Calcula o que seria a carga atual de PIS+COFINS sobre a mesma receita bruta
    // (Lucro Real, não-cumulativo; alíquotas fixas: PIS 1,65% + COFINS 7,60%)
    var debitoPis    = aplicarAliquota(receitaBruta, ALIQUOTAS_PIS_COFINS.pis);
    var debitoCofins = aplicarAliquota(receitaBruta, ALIQUOTAS_PIS_COFINS.cofins);
    var creditoPis    = aplicarAliquota(entradasTributadas, ALIQUOTAS_PIS_COFINS.pis);
    var creditoCofins = aplicarAliquota(entradasTributadas, ALIQUOTAS_PIS_COFINS.cofins);
    var pisApurado    = Math.max(0, debitoPis - creditoPis);
    var cofinsApurado = Math.max(0, debitoCofins - creditoCofins);
    var pisCofinsTotalApurado = pisApurado + cofinsApurado;

    // ---- CBS fase-teste 2026: retém PIS/COFINS com compensação ----
    // Em 2026, o contribuinte ainda recolhe PIS/COFINS normalmente; a CBS e IBS de 1%
    // são compensadas para manter carga neutra (art. 350 da LC 214/2025).
    var cbsIbsCompensados = 0;
    if (ano === 2026) {
      cbsIbsCompensados = cbsApurada + ibsApurado;
    }

    // ---- Carga total projetada no ano ----
    // = CBS apurada + IBS apurado + PIS/COFINS (se ainda vigentes)
    var pisCofinsPeriodo = 0;
    if (regime.pisCofinsPct > 0) {
      // 2026: PIS/COFINS ainda integral; CBS/IBS compensados (carga líquida ≈ 9,25%)
      pisCofinsPeriodo = pisCofinsTotalApurado;
    }
    var cargaTotalCbsIbs = cbsApurada + ibsApurado + pisCofinsPeriodo - cbsIbsCompensados;

    // ---- Diferença vs. PIS/COFINS atual ----
    var diferencaCarga = cargaTotalCbsIbs - pisCofinsTotalApurado;

    var avisos = [];
    if (entradasTributadas === 0 && receitaBruta > 0) {
      avisos.push('[VALIDAR] Entradas tributadas não informadas: crédito CBS/IBS zerado. ' +
        'Informe dadosEfd.total.entradas para projeção completa.');
    }
    if (ano >= 2027 && ano <= 2033) {
      avisos.push('[VALIDAR] Alíquotas CBS/IBS sujeitas a publicação de resolução definitiva ' +
        'pelo CGIBS e Senado Federal (arts. 9 e 12–17 da LC 214/2025).');
    }

    return {
      competencia: String(competencia),
      ano: ano,
      regime: {
        descricao: regime.descricao,
        cbsPct: regime.cbsPct,
        ibsPct: regime.ibsPct,
        pisCofinsPct: regime.pisCofinsPct,
      },
      basesCalculo: {
        receitaBruta: receitaBruta,
        entradasTributadas: entradasTributadas,
      },
      cbs: {
        debito: debitoCbs,
        credito: creditoCbs,
        apurado: cbsApurada,
      },
      ibs: {
        debito: debitoIbs,
        credito: creditoIbs,
        apurado: ibsApurado,
      },
      pisCofinsCurrent: {
        debitoPis: debitoPis,
        debitoCofins: debitoCofins,
        creditoPis: creditoPis,
        creditoCofins: creditoCofins,
        pisApurado: pisApurado,
        cofinsApurado: cofinsApurado,
        totalApurado: pisCofinsTotalApurado,
      },
      comparacao: {
        cargaAtualPisCofins: pisCofinsTotalApurado,
        cargaProjetadaCbsIbs: cargaTotalCbsIbs,
        diferencaCentavos: diferencaCarga,
        aumentoPercentual: pisCofinsTotalApurado > 0
          ? Math.round((diferencaCarga / pisCofinsTotalApurado) * 10000) / 100
          : null,
        maiorCarga: diferencaCarga > 0,
      },
      avisos: avisos,
    };
  }

  /**
   * Projeta a carga CBS/IBS para um intervalo de anos, útil para planejamento tributário.
   *
   * @param {Object} dadosEfd   Resultado do motor-creditos.js (mesma estrutura de projetarCbsIbs).
   * @param {number} anoInicio  Ex.: 2026
   * @param {number} anoFim     Ex.: 2033
   * @returns {Array<Object>}   Array com um resultado por ano.
   */
  function projetarCbsIbsMultiAnos(dadosEfd, anoInicio, anoFim) {
    if (anoInicio > anoFim) throw new Error('anoInicio deve ser <= anoFim');
    var resultados = [];
    for (var ano = anoInicio; ano <= anoFim; ano++) {
      resultados.push(projetarCbsIbs(dadosEfd, ano));
    }
    return resultados;
  }

  /**
   * Retorna a tabela de regimes de transição CBS/IBS para consulta.
   * @returns {Object} Cópia da TABELA_TRANSICAO.
   */
  function obterTabelaTransicao() {
    var copia = {};
    Object.keys(TABELA_TRANSICAO).forEach(function (ano) {
      copia[ano] = Object.assign({}, TABELA_TRANSICAO[ano]);
    });
    return copia;
  }

  // ------------------------------------------------------------------ exports

  return {
    versao: VERSAO_MOTOR,
    projetarCbsIbs: projetarCbsIbs,
    projetarCbsIbsMultiAnos: projetarCbsIbsMultiAnos,
    obterTabelaTransicao: obterTabelaTransicao,
    // constantes expostas para auditoria e testes
    _ALIQUOTAS_PIS_COFINS: ALIQUOTAS_PIS_COFINS,
    _CBS_REFERENCIA_PCT: CBS_REFERENCIA_PCT,
    _IBS_REFERENCIA_PCT: IBS_REFERENCIA_PCT,
  };
});
