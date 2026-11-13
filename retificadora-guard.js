/*
 * Reversa Tax — regra única de liberação de uma retificadora (EFD-Contribuições e eSocial).
 *
 * Por que existe: uma retificadora com erro de pré-validação, sem alteração efetiva ou
 * idêntica ao arquivo original não pode ser baixada, compactada, registrada no caso nem
 * aprovada. Sem esta regra, um arquivo quebrado chegava ao cliente e à transmissão.
 *
 * A mesma regra roda no navegador (window.RetificadoraGuard) e no Node (module.exports),
 * para que a tela e o servidor não discordem do que é liberável.
 *
 *   avaliar(a)             -> { liberado, codigo, mensagem }
 *   a.erros                -> número de erros da pré-validação (geração + validação)
 *   a.avisos              -> número de avisos (não bloqueiam)
 *   a.itensAlterados      -> quantidade de itens efetivamente alterados
 *   a.shaOriginal          -> SHA-256 do arquivo original
 *   a.shaRetificada        -> SHA-256 do arquivo retificado
 */
(function (root) {
  'use strict';
  var VERSAO = '1.0.0';

  var CODIGOS = {
    ERRO_VALIDACAO: 'ERRO_VALIDACAO',
    SEM_ALTERACAO: 'SEM_ALTERACAO',
    ARQUIVO_IGUAL: 'ARQUIVO_IGUAL',
    LIBERADO: 'LIBERADO'
  };

  var MENSAGENS = {
    ERRO_VALIDACAO: 'A pré-validação acusou erro neste arquivo. Corrija e gere de novo antes de baixar, registrar ou transmitir.',
    SEM_ALTERACAO: 'A retificadora não altera nenhum item: não há o que retificar.',
    ARQUIVO_IGUAL: 'O arquivo retificado ficou idêntico ao original: não há alteração a transmitir.'
  };

  function num(v) { var n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; }

  /**
   * Decide se um artefato de retificação pode ser liberado.
   * @param {{erros?:number, avisos?:number, itensAlterados?:number, shaOriginal?:string, shaRetificada?:string}} a
   * @returns {{liberado:boolean, codigo:string, mensagem:string, erros:number, avisos:number, itensAlterados:number}}
   */
  function avaliar(a) {
    a = a || {};
    var erros = num(a.erros), avisos = num(a.avisos), itens = num(a.itensAlterados);
    var shaO = String(a.shaOriginal || ''), shaR = String(a.shaRetificada || '');
    var res = { liberado: true, codigo: CODIGOS.LIBERADO, mensagem: '', erros: erros, avisos: avisos, itensAlterados: itens };
    if (erros > 0) return Object.assign(res, { liberado: false, codigo: CODIGOS.ERRO_VALIDACAO, mensagem: MENSAGENS.ERRO_VALIDACAO });
    if (itens <= 0) return Object.assign(res, { liberado: false, codigo: CODIGOS.SEM_ALTERACAO, mensagem: MENSAGENS.SEM_ALTERACAO });
    if (shaO && shaR && shaO === shaR) return Object.assign(res, { liberado: false, codigo: CODIGOS.ARQUIVO_IGUAL, mensagem: MENSAGENS.ARQUIVO_IGUAL });
    return res;
  }

  /** Só os artefatos liberados seguem para download, compactação ou registro. */
  function liberados(lista) {
    return (Array.isArray(lista) ? lista : []).filter(function (a) { return avaliar(a).liberado; });
  }

  /** Os bloqueados, com o motivo — para a tela mostrar o que precisa ser corrigido. */
  function bloqueados(lista) {
    return (Array.isArray(lista) ? lista : []).map(function (a) { return { artefato: a, veredito: avaliar(a) }; })
      .filter(function (x) { return !x.veredito.liberado; });
  }

  var api = { VERSAO: VERSAO, CODIGOS: CODIGOS, MENSAGENS: MENSAGENS, avaliar: avaliar, liberados: liberados, bloqueados: bloqueados };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RetificadoraGuard = api;
})(typeof self !== 'undefined' ? self : this);
