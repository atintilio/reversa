/*
 * Reversa Tax — pacote operacional de PIS/COFINS: a posição de créditos por origem e o
 * material que o contador precisa para o Pedido de Ressarcimento (PER) e a Declaração de
 * Compensação (DCOMP).
 *
 * Fonte dos campos: Guia Prático da EFD Contribuições v1.35, Bloco 1 — registros 1100 (PIS) e
 * 1500 (Cofins). A chave do registro é PER_APU_CRED + ORIG_CRED + CNPJ_SUC + COD_CRED.
 * Os rótulos dos códigos vêm das tabelas do mesmo Guia (4.3.6 tipo de crédito, 4.3.7 base de
 * cálculo, 4.3.8 ajustes), extraídas para lib/sped/tabelas/codigos-credito.json.
 *
 * O que este módulo NÃO faz: não calcula tributo, não escolhe o tipo de pedido (PER ou DCOMP),
 * não define o valor a pedir e não transmite nada. Ele monta o material de apoio — a posição
 * declarada pela empresa — para o contador revisar e decidir. Todo valor que aparece aqui foi
 * lido do arquivo da EFD; nada é estimado.
 *
 * Funciona no navegador (window.PacotePis) e no Node (module.exports).
 */
(function (root) {
  'use strict';

  var TABELAS = (typeof module !== 'undefined' && module.exports)
    ? require('./lib/sped/tabelas/codigos-credito.js')
    : (root.SPED_CODIGOS_CREDITO || { tabelas: {} });

  var COD_TIPO_CREDITO = (TABELAS.tabelas && TABELAS.tabelas.codigo_tipo_credito && TABELAS.tabelas.codigo_tipo_credito.codigos) || {};
  var COD_BASE_CALCULO = (TABELAS.tabelas && TABELAS.tabelas.codigo_base_calculo && TABELAS.tabelas.codigo_base_calculo.codigos) || {};

  var ORIGEM = {
    '01': 'Crédito decorrente de operações próprias',
    '02': 'Crédito transferido por pessoa jurídica sucedida'
  };

  /** Centavos -> reais com 2 casas. */
  function reais(c) {
    var v = Math.round(Number(c || 0)) / 100;
    return Math.round(v * 100) / 100;
  }
  function reaisTexto(v) {
    var n = Number(v || 0);
    return n.toFixed(2).replace('.', ',');
  }
  function rotuloTipoCredito(cod) { return COD_TIPO_CREDITO[cod] || ('Código ' + (cod || '?')); }
  function rotuloBaseCalculo(cod) { return COD_BASE_CALCULO[cod] || ('Código ' + (cod || '?')); }

  /**
   * Monta o pacote operacional a partir das leituras da EFD-Contribuições.
   *
   * @param {Array} leituras  resultado de lerEfdContribuicoes() (uma entrada por arquivo)
   * @param {Object} [opts]  { competencia: 'AAAA-MM' }
   * @returns {Object} pacote { competencia, creditos, pedidos, resumo, avisos }
   */
  function monta(leituras, opts) {
    opts = opts || {};
    var creditos = [], avisos = [], vistos = {};

    (leituras || []).forEach(function (l) {
      if (!l || l.erros && l.erros.length) return;
      var posicao = l.creditosPosicao || [];
      if (!posicao.length) return;
      (l.avisos || []).forEach(function (a) { avisos.push(l.arquivo + ': ' + a); });
      posicao.forEach(function (p) {
        var chave = [p.tributo, p.competenciaCredito, p.origem, p.cnpjSuc, p.codCredito].join('|');
        if (vistos[chave]) {
          avisos.push(l.arquivo + ': o crédito ' + p.competenciaCredito + ' / ' + (p.codCredito || '?') +
            ' aparece repetido (PER_APU_CRED + ORIG_CRED + CNPJ_SUC + COD_CRED). Mantive o primeiro.');
          return;
        }
        vistos[chave] = true;
        creditos.push({
          arquivo: l.arquivo,
          cnpj: l.meta && l.meta.cnpj || '',
          competenciaEscrituracao: l.meta && l.meta.competencia || '',
          tributo: p.tributo,                       // 'pis' | 'cofins'
          competenciaCredito: p.competenciaCredito, // MM/AAAA
          origem: p.origem,
          origemRotulo: ORIGEM[p.origem] || ('Origem ' + (p.origem || '?')),
          cnpjSuc: p.cnpjSuc,
          codCredito: p.codCredito,
          codCreditoRotulo: rotuloTipoCredito(p.codCredito),
          apurado: reais(p.creditoApurado),
          extemporaneo: reais(p.creditoExtemporaneo),
          total: reais(p.creditoTotal),
          usadoDescontoAnterior: reais(p.usadoDescontoAnterior),
          usadoPerAnterior: reais(p.usadoPerAnterior),
          usadoDcompAnterior: reais(p.usadoDcompAnterior),
          disponivel: reais(p.saldoDisponivel),
          usadoDesconto: reais(p.usadoDesconto),
          pedidoPer: reais(p.pedidoPer),
          pedidoDcomp: reais(p.pedidoDcomp),
          transferido: reais(p.transferido),
          usadoOutros: reais(p.usadoOutros),
          saldoFinal: reais(p.saldoFinal)
        });
      });
    });

    // O que o contador pode pedir: crédito com saldo disponível e que não foi objeto de
    // pedido no período. O tipo (PER ou DCOMP) é decisão do contador — o pacote só
    // mostra o que está disponível e o que já foi usado por cada via.
    var pedidos = [];
    creditos.forEach(function (c) {
      if (c.disponivel > 0) {
        pedidos.push({
          tributo: c.tributo, competenciaCredito: c.competenciaCredito, origem: c.origem,
          cnpjSuc: c.cnpjSuc, codCredito: c.codCredito, codCreditoRotulo: c.codCreditoRotulo,
          valorDisponivel: c.disponivel,
          jaPedidoPer: c.pedidoPer, jaPedidoDcomp: c.pedidoDcomp,
          vias: ['PER (Pedido de Ressarcimento)', 'DCOMP (Declaração de Compensação)'],
          nota: 'Valor disponível declarado pela empresa no registro ' + (c.tributo === 'pis' ? '1100' : '1500') +
            '. O tipo de pedido e o valor pedido são escolha do contador.'
        });
      }
    });

    var resumo = { pis: { disponivel: 0, total: 0, pedidoPer: 0, pedidoDcomp: 0, creditos: 0 },
                   cofins: { disponivel: 0, total: 0, pedidoPer: 0, pedidoDcomp: 0, creditos: 0 } };
    creditos.forEach(function (c) {
      var r = resumo[c.tributo];
      if (!r) return;
      r.creditos++;
      r.disponivel += c.disponivel;
      r.total += c.total;
      r.pedidoPer += c.pedidoPer;
      r.pedidoDcomp += c.pedidoDcomp;
    });
    // os valores ja estao em reais (vindos de reais())
    ['pis', 'cofins'].forEach(function (k) {
      resumo[k].disponivel = Math.round(resumo[k].disponivel * 100) / 100;
      resumo[k].total = Math.round(resumo[k].total * 100) / 100;
      resumo[k].pedidoPer = Math.round(resumo[k].pedidoPer * 100) / 100;
      resumo[k].pedidoDcomp = Math.round(resumo[k].pedidoDcomp * 100) / 100;
    });

    if (!creditos.length) avisos.push('Nenhum registro do Bloco 1 (1100/1500) nos arquivos lidos: a posição de créditos por origem não pôde ser montada.');

    return {
      competencia: opts.competencia || (leituras && leituras[0] && leituras[0].meta && leituras[0].meta.competencia) || '',
      creditos: creditos, pedidos: pedidos, resumo: resumo, avisos: avisos,
      geradoPor: 'pacote-pis.js'
    };
  }

  function celula(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * Exporta o pacote em CSV (separador ';', decimal com vírgula) para o contador.
   * @param {Object} pacote
   * @returns {string}
   */
  function csv(pacote) {
    if (!pacote || !pacote.creditos) return '';
    var linhas = [];
    linhas.push(['Tributo', 'Competência do crédito', 'Origem', 'CNPJ cedente', 'Código do crédito', 'Descrição do crédito',
      'Crédito apurado', 'Crédito extemporâneo', 'Crédito total', 'Desconto em período anterior', 'PER em período anterior',
      'DCOMP em período anterior', 'Saldo disponível', 'Desconto no período', 'PER no período', 'DCOMP no período',
      'Transferido', 'Outros', 'Saldo final'].join(';'));
    pacote.creditos.forEach(function (c) {
      linhas.push([c.tributo.toUpperCase(), c.competenciaCredito, c.origem, c.cnpjSuc, c.codCredito, c.codCreditoRotulo,
        reaisTexto(c.apurado), reaisTexto(c.extemporaneo), reaisTexto(c.total), reaisTexto(c.usadoDescontoAnterior),
        reaisTexto(c.usadoPerAnterior), reaisTexto(c.usadoDcompAnterior), reaisTexto(c.disponivel), reaisTexto(c.usadoDesconto),
        reaisTexto(c.pedidoPer), reaisTexto(c.pedidoDcomp), reaisTexto(c.transferido), reaisTexto(c.usadoOutros),
        reaisTexto(c.saldoFinal)].map(celula).join(';'));
    });
    return linhas.join('\r\n') + '\r\n';
  }

  var api = {
    monta: monta, csv: csv, reais: reais,
    ORIGEM: ORIGEM, rotuloTipoCredito: rotuloTipoCredito, rotuloBaseCalculo: rotuloBaseCalculo,
    COD_TIPO_CREDITO: COD_TIPO_CREDITO, COD_BASE_CALCULO: COD_BASE_CALCULO
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PacotePis = api;
})(typeof window !== 'undefined' ? window : this);
