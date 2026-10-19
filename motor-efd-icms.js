/*
 * Reversa Tax — leitor da EFD ICMS/IPI (SPED Fiscal).
 *
 * Este módulo só LÊ o arquivo e organiza os dados. Não aplica nenhuma tese tributária e não calcula
 * oportunidade: as regras dependem de aprovação do André.
 *
 * Registros lidos (posição do campo = ordem no Guia Prático da EFD ICMS/IPI, contando REG como campo 1):
 *   0000  abertura e identificação (COD_VER, DT_INI, DT_FIN, NOME, CNPJ, UF, IE ...)
 *   0150  participantes
 *   0200  itens (COD_NCM)
 *   C100  documento (NF, NF-e etc.), com os filhos C170 (itens), C190 (resumo por CST/CFOP/alíquota) e C197 (ajustes)
 *   E100  período da apuração
 *   E110  apuração do ICMS, E111 ajustes da apuração, E116 obrigações a recolher
 *   H010  inventário (leitura simples; H005 e H020 não são lidos)
 * Os demais registros são apenas contados em `contagem`.
 *
 * Entrada: texto já decodificado de Latin-1 (ISO-8859-1). Valores no padrão do SPED: vírgula decimal.
 * Nada é descartado em silêncio: COD_SIT fora do padrão, ponto decimal, registro curto etc. geram `avisos`.
 * Funciona no navegador (window.MotorEfdIcms) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';

  // Leiaute por registro (índice 0 = campo 1 = REG). Fonte e dúvidas: ver DUVIDAS abaixo.
  var LEIAUTE = {
    '0000': ['REG', 'COD_VER', 'COD_FIN', 'DT_INI', 'DT_FIN', 'NOME', 'CNPJ', 'CPF', 'UF', 'IE', 'COD_MUN', 'IM', 'SUFRAMA', 'IND_PERFIL', 'IND_ATIV'],
    '0150': ['REG', 'COD_PART', 'NOME', 'COD_PAIS', 'CNPJ', 'CPF', 'IE', 'COD_MUN', 'SUFRAMA', 'END', 'NUM', 'COMPL', 'BAIRRO'],
    '0200': ['REG', 'COD_ITEM', 'DESCR_ITEM', 'COD_BARRA', 'COD_ANT_ITEM', 'UNID_INV', 'TIPO_ITEM', 'COD_NCM', 'EX_IPI', 'COD_GEN', 'COD_LST', 'ALIQ_ICMS', 'CEST'],
    'C100': ['REG', 'IND_OPER', 'IND_EMIT', 'COD_PART', 'COD_MOD', 'COD_SIT', 'SER', 'NUM_DOC', 'CHV_NFE', 'DT_DOC', 'DT_E_S', 'VL_DOC', 'IND_PGTO', 'VL_DESC', 'VL_ABAT_NT', 'VL_MERC', 'IND_FRT', 'VL_FRT', 'VL_SEG', 'VL_OUT_DA', 'VL_BC_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'VL_ICMS_ST', 'VL_IPI', 'VL_PIS', 'VL_COFINS', 'VL_PIS_ST', 'VL_COFINS_ST'],
    'C170': ['REG', 'NUM_ITEM', 'COD_ITEM', 'DESCR_COMPL', 'QTD', 'UNID', 'VL_ITEM', 'VL_DESC', 'IND_MOV', 'CST_ICMS', 'CFOP', 'COD_NAT', 'VL_BC_ICMS', 'ALIQ_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'ALIQ_ST', 'VL_ICMS_ST', 'IND_APUR', 'CST_IPI', 'COD_ENQ', 'VL_BC_IPI', 'ALIQ_IPI', 'VL_IPI', 'CST_PIS', 'VL_BC_PIS', 'ALIQ_PIS_PERC', 'QUANT_BC_PIS', 'ALIQ_PIS_REAIS', 'VL_PIS', 'CST_COFINS', 'VL_BC_COFINS', 'ALIQ_COFINS_PERC', 'QUANT_BC_COFINS', 'ALIQ_COFINS_REAIS', 'VL_COFINS', 'COD_CTA', 'VL_ABAT_NT'],
    'C190': ['REG', 'CST_ICMS', 'CFOP', 'ALIQ_ICMS', 'VL_OPR', 'VL_BC_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'VL_ICMS_ST', 'VL_RED_BC', 'VL_IPI', 'COD_OBS'],
    'C197': ['REG', 'COD_AJ', 'DESCR_COMPL_AJ', 'COD_ITEM', 'VL_BC_ICMS', 'ALIQ_ICMS', 'VL_ICMS', 'VL_OUTROS'],
    'E100': ['REG', 'DT_INI', 'DT_FIN'],
    'E110': ['REG', 'VL_TOT_DEBITOS', 'VL_AJ_DEBITOS', 'VL_TOT_AJ_DEBITOS', 'VL_ESTORNOS_CRED', 'VL_TOT_CREDITOS', 'VL_AJ_CREDITOS', 'VL_TOT_AJ_CREDITOS', 'VL_ESTORNOS_DEB', 'VL_SLD_CREDOR_ANT', 'VL_SLD_APURADO', 'VL_TOT_DED', 'VL_ICMS_RECOLHER', 'VL_SLD_CREDOR_TRANSPORTAR', 'DEB_ESP'],
    'E111': ['REG', 'COD_AJ_APUR', 'DESCR_COMPL_AJ', 'VL_AJ_APUR'],
    'E116': ['REG', 'COD_OR', 'VL_OR', 'DT_VCTO', 'COD_REC', 'NUM_PROC', 'IND_PROC', 'PROC', 'TXT_COMPL', 'MES_REF'],
    'H010': ['REG', 'COD_ITEM', 'UNID', 'QTD', 'VL_UNIT', 'VL_ITEM', 'IND_PROP', 'COD_PART', 'TXT_COMPL', 'COD_CTA', 'VL_ITEM_IR']
  };

  // COD_SIT do documento (C100): 00 regular, 01 extemporâneo, 02 cancelado, 03 cancelado extemporâneo,
  // 04 denegado, 05 numeração inutilizada, 06 complementar, 07 complementar extemporâneo, 08 regime especial/norma específica.
  var COD_SIT = {
    '00': 'documento regular', '01': 'escrituração extemporânea de documento regular', '02': 'documento cancelado',
    '03': 'escrituração extemporânea de documento cancelado', '04': 'NF-e, NFC-e ou CT-e denegado', '05': 'numeração inutilizada',
    '06': 'documento fiscal complementar', '07': 'escrituração extemporânea de documento complementar', '08': 'documento fiscal emitido com base em regime especial ou norma específica'
  };
  var SIT_SEM_VALORES = { '02': 1, '03': 1, '04': 1, '05': 1 }; // não deveriam trazer C170/C190

  var DUVIDAS = [
    'Posições dos campos conferidas contra a implementação aberta python-sped (sped-br, registros.py do EFD ICMS/IPI) e contra a numeração de C170 (campos 13, 14, 16, 17) e C190 (campos 4, 6, 7, 8, 9) da Nota Orientativa EFD ICMS/IPI 2023.001. As tabelas de campos do Guia Prático oficial (v3.2.3, Ato COTEPE/ICMS 44/2018 e alterações) não puderam ser lidas diretamente (PDF espelhado só traz o índice e o histórico; sped.rfb.gov.br inacessível no ambiente). Confirmar no Guia vigente.',
    'Campos acrescentados em leiautes recentes (COD_VER 019, 020, 021) não foram verificados. Registro com mais campos que o leiaute usado aqui gera aviso, não erro.',
    'Tabela de COD_VER x vigência não foi confirmada; o código é apenas exibido (aviso se não tiver 3 dígitos).',
    'Tabela de COD_SIT (00 a 08) usada de memória do Guia; confirmar na tabela 4.1.2 da versão vigente.',
    'C197 foi lido como filho do C100 (na hierarquia oficial vem abaixo do C195, que não é lido); o vínculo com o documento é o C100 anterior.',
    'Não implementado: conferência aritmética do E110 (VL_SLD_APURADO etc.), por falta da fórmula oficial confirmada. Também não são lidos C300, C390, C490, C590, C690, C790, C850, D190 etc.; o comparativo C190 x E110 é parcial.',
    'COD_AJ (C197) e COD_AJ_APUR (E111) são exibidos como vêm no arquivo (sem decodificar UF/tipo de utilização); a interpretação depende das tabelas estaduais 5.1.1 e 5.3.'
  ];

  // ------------------------------------------------------------------ utilitários
  function r2(x) { return Math.round((x + 1e-9) * 100) / 100; }
  function soma(lista, f) { return r2(lista.reduce(function (s, x) { return s + f(x); }, 0)); }
  function digitos(s) { return String(s || '').replace(/\D+/g, ''); }

  /** ddmmaaaa -> aaaa-mm-dd ('' se vazio, null se inválida). */
  function data(s) {
    s = String(s || '').trim();
    if (!s) return '';
    var m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
    if (!m) return null;
    var d = +m[1], mo = +m[2], a = +m[3], t = new Date(Date.UTC(a, mo - 1, d));
    if (t.getUTCFullYear() !== a || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function novoContexto() {
    var mapa = {}, ordem = [];
    return {
      avisar: function (chave, msg, linha) {
        if (!mapa[chave]) { mapa[chave] = { msg: msg, n: 0, linha: linha }; ordem.push(chave); }
        mapa[chave].n++;
      },
      lista: function () {
        return ordem.map(function (k) {
          var a = mapa[k];
          return a.msg + (a.n > 1 ? ' [' + a.n + ' ocorrências; a primeira na linha ' + a.linha + ']' : ' [linha ' + a.linha + ']');
        });
      }
    };
  }

  /** Número do SPED (vírgula decimal). Ponto decimal é aceito, mas avisado. Vazio = 0. */
  function numero(v, reg, campo, ctx, linha) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    var t = s;
    if (s.indexOf('.') >= 0) {
      ctx.avisar('ponto|' + reg + '|' + campo, 'Valor com ponto decimal/milhar no ' + reg + '.' + campo + ' (o padrão do SPED é vírgula); interpretado assim mesmo.', linha);
      t = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s;
    } else if (s.indexOf(',') >= 0) t = s.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) {
      ctx.avisar('naonum|' + reg + '|' + campo, 'Valor não numérico no ' + reg + '.' + campo + ' ("' + s + '"); considerado 0.', linha);
      return 0;
    }
    return Number(t);
  }

  function dataCampo(v, reg, campo, ctx, linha) {
    var d = data(v);
    if (d === null) { ctx.avisar('data|' + reg + '|' + campo, 'Data inválida no ' + reg + '.' + campo + ' ("' + v + '"); esperado ddmmaaaa.', linha); return ''; }
    return d;
  }

  // ------------------------------------------------------------------ leitor
  /** Lê um arquivo da EFD ICMS/IPI (texto já decodificado) e devolve os dados organizados. */
  function lerEfdIcms(texto, nome) {
    var ctx = novoContexto();
    var r = {
      arquivo: nome || 'efd-icms-ipi.txt', versaoLeitor: VERSAO,
      cnpj: null, cpf: null, empresa: null, uf: null, ie: null, codVer: null, codFin: null, indPerfil: null, ini: null, fin: null,
      participantes: [], itens: [], notas: [], resumoC190: [], apuracaoE110: [], ajustesE111: [], ajustesC197: [],
      obrigacoesE116: [], inventarioH010: [], contagem: {}, avisos: [], duvidas: DUVIDAS.slice()
    };
    var s = String(texto == null ? '' : texto).replace(/^﻿/, '');
    if (s.indexOf('�') >= 0) ctx.avisar('enc', 'O texto tem caracteres de substituição (�): a decodificação Latin-1 pode ter falhado.', 1);
    var linhas = s.split(/\r\n|\n|\r/);
    var tem0000 = false, nota = null, per = null, e110 = null;
    var itensPorCod = {}, partPorCod = {}, resumoMapa = {}, usados = {}, partUsados = {};

    function partes(l) {
      var p = l.split('|');
      if (p.length && p[0].trim() === '') p.shift();
      if (p.length && p[p.length - 1].trim() === '') p.pop();
      return p;
    }
    function campos(reg, p, n) {
      var nomes = LEIAUTE[reg], o = {};
      if (p.length < nomes.length) ctx.avisar('curto|' + reg, 'Registro ' + reg + ' com menos campos que o mínimo do leiaute (' + p.length + ' de ' + nomes.length + '); campos ausentes lidos como vazios.', n);
      else if (p.length > nomes.length) ctx.avisar('longo|' + reg, 'Registro ' + reg + ' com mais campos que o leiaute usado (' + p.length + ' de ' + nomes.length + '); possível leiaute mais novo, campos extras ignorados.', n);
      nomes.forEach(function (c, i) { o[c] = p[i] === undefined ? '' : String(p[i]).trim(); });
      return o;
    }
    function num(c, reg, campo, n) { return numero(c[campo], reg, campo, ctx, n); }
    function notaVazia(n) { return { semC100: true, linha: n, itens: [], analitico: [], ajustes: [] }; }

    linhas.forEach(function (bruta, idx) {
      var n = idx + 1, l = bruta.trim();
      if (!l) return;
      if (l.charAt(0) !== '|') { ctx.avisar('semdelim', 'Linha que não começa com "|" (fora do formato SPED), ignorada.', n); return; }
      var p = partes(l), reg = (p[0] || '').trim();
      r.contagem[reg] = (r.contagem[reg] || 0) + 1;
      if (!LEIAUTE[reg]) return;
      var c = campos(reg, p, n);

      if (reg === '0000') {
        if (tem0000) { ctx.avisar('dup0000', 'Mais de um registro 0000 (arquivos concatenados?); só o primeiro foi usado como identificação.', n); return; }
        tem0000 = true;
        r.codVer = c.COD_VER; r.codFin = c.COD_FIN; r.empresa = c.NOME; r.uf = c.UF; r.ie = c.IE; r.indPerfil = c.IND_PERFIL;
        r.cnpj = digitos(c.CNPJ) || null; r.cpf = digitos(c.CPF) || null;
        r.ini = dataCampo(c.DT_INI, '0000', 'DT_INI', ctx, n) || null; r.fin = dataCampo(c.DT_FIN, '0000', 'DT_FIN', ctx, n) || null;
        if (!/^\d{3}$/.test(c.COD_VER)) ctx.avisar('codver', 'COD_VER do 0000 fora do padrão (3 dígitos): "' + c.COD_VER + '".', n);
        if (!r.cnpj && !r.cpf) ctx.avisar('semcnpj', 'Registro 0000 sem CNPJ nem CPF.', n);
        else if (r.cnpj && r.cnpj.length !== 14) ctx.avisar('cnpj14', 'CNPJ do 0000 sem 14 dígitos: "' + c.CNPJ + '".', n);
      } else if (reg === '0150') {
        var pt = { codPart: c.COD_PART, nome: c.NOME, codPais: c.COD_PAIS, cnpj: digitos(c.CNPJ) || null, cpf: digitos(c.CPF) || null, ie: c.IE, codMun: c.COD_MUN };
        r.participantes.push(pt); partPorCod[pt.codPart] = pt;
      } else if (reg === '0200') {
        var it = { codItem: c.COD_ITEM, descricao: c.DESCR_ITEM, codBarra: c.COD_BARRA, unidInv: c.UNID_INV, tipoItem: c.TIPO_ITEM, ncm: c.COD_NCM, exIpi: c.EX_IPI, codGen: c.COD_GEN, aliqIcms: num(c, reg, 'ALIQ_ICMS', n), cest: c.CEST };
        if (it.ncm && !/^\d{8}$/.test(it.ncm)) ctx.avisar('ncm', 'COD_NCM do 0200 que não tem 8 dígitos (ex.: "' + it.ncm + '").', n);
        r.itens.push(it); itensPorCod[it.codItem] = it;
      } else if (reg === 'C100') {
        var sit = c.COD_SIT;
        if (!COD_SIT[sit]) ctx.avisar('sit|' + sit, 'COD_SIT "' + sit + '" fora do padrão (00 a 08) no C100 (ex.: documento ' + (c.NUM_DOC || '?') + '); documento mantido e sinalizado.', n);
        if (c.IND_OPER !== '0' && c.IND_OPER !== '1') ctx.avisar('oper|' + c.IND_OPER, 'IND_OPER "' + c.IND_OPER + '" fora do padrão (0 entrada, 1 saída) no C100.', n);
        if (c.IND_EMIT !== '0' && c.IND_EMIT !== '1') ctx.avisar('emit|' + c.IND_EMIT, 'IND_EMIT "' + c.IND_EMIT + '" fora do padrão (0 própria, 1 terceiros) no C100.', n);
        if (c.COD_PART) partUsados[c.COD_PART] = n;
        nota = {
          linha: n, indOper: c.IND_OPER, indEmit: c.IND_EMIT, codPart: c.COD_PART, codMod: c.COD_MOD, codSit: sit, situacao: COD_SIT[sit] || null, codSitPadrao: !!COD_SIT[sit],
          ser: c.SER, numDoc: c.NUM_DOC, chave: c.CHV_NFE,
          dtDoc: dataCampo(c.DT_DOC, reg, 'DT_DOC', ctx, n), dtES: dataCampo(c.DT_E_S, reg, 'DT_E_S', ctx, n),
          vlDoc: num(c, reg, 'VL_DOC', n), vlDesc: num(c, reg, 'VL_DESC', n), vlMerc: num(c, reg, 'VL_MERC', n),
          vlBcIcms: num(c, reg, 'VL_BC_ICMS', n), vlIcms: num(c, reg, 'VL_ICMS', n), vlBcIcmsSt: num(c, reg, 'VL_BC_ICMS_ST', n), vlIcmsSt: num(c, reg, 'VL_ICMS_ST', n), vlIpi: num(c, reg, 'VL_IPI', n),
          itens: [], analitico: [], ajustes: []
        };
        r.notas.push(nota);
      } else if (reg === 'C170' || reg === 'C190' || reg === 'C197') {
        if (!nota) { ctx.avisar('orfao|' + reg, 'Registro ' + reg + ' sem C100 anterior; guardado em uma nota marcada semC100.', n); nota = notaVazia(n); r.notas.push(nota); }
        if (reg === 'C170') {
          if (c.COD_ITEM) usados[c.COD_ITEM] = n;
          nota.itens.push({
            numItem: c.NUM_ITEM, codItem: c.COD_ITEM, descrCompl: c.DESCR_COMPL, qtd: num(c, reg, 'QTD', n), unid: c.UNID, vlItem: num(c, reg, 'VL_ITEM', n), vlDesc: num(c, reg, 'VL_DESC', n),
            cstIcms: c.CST_ICMS, cfop: c.CFOP, vlBcIcms: num(c, reg, 'VL_BC_ICMS', n), aliqIcms: num(c, reg, 'ALIQ_ICMS', n), vlIcms: num(c, reg, 'VL_ICMS', n),
            vlBcIcmsSt: num(c, reg, 'VL_BC_ICMS_ST', n), vlIcmsSt: num(c, reg, 'VL_ICMS_ST', n), vlIpi: num(c, reg, 'VL_IPI', n), ncm: null
          });
        } else if (reg === 'C190') {
          if (SIT_SEM_VALORES[nota.codSit]) ctx.avisar('c190sit|' + nota.codSit, 'C190 em documento com COD_SIT ' + nota.codSit + ' (' + COD_SIT[nota.codSit] + '), que não deveria trazer registros analíticos.', n);
          var a = { cstIcms: c.CST_ICMS, cfop: c.CFOP, aliqIcms: num(c, reg, 'ALIQ_ICMS', n), vlOpr: num(c, reg, 'VL_OPR', n), vlBcIcms: num(c, reg, 'VL_BC_ICMS', n), vlIcms: num(c, reg, 'VL_ICMS', n),
            vlBcIcmsSt: num(c, reg, 'VL_BC_ICMS_ST', n), vlIcmsSt: num(c, reg, 'VL_ICMS_ST', n), vlRedBc: num(c, reg, 'VL_RED_BC', n), vlIpi: num(c, reg, 'VL_IPI', n), codObs: c.COD_OBS };
          nota.analitico.push(a);
          var sentido = /^[123]/.test(a.cfop) ? 'entrada' : /^[567]/.test(a.cfop) ? 'saida' : null;
          if (!/^\d{4}$/.test(a.cfop)) ctx.avisar('cfop', 'CFOP do C190 que não tem 4 dígitos (ex.: "' + a.cfop + '").', n);
          var k = a.cstIcms + '|' + a.cfop + '|' + a.aliqIcms;
          var g = resumoMapa[k] || (resumoMapa[k] = { cstIcms: a.cstIcms, cfop: a.cfop, aliqIcms: a.aliqIcms, sentido: sentido, documentos: 0, vlOpr: 0, vlBcIcms: 0, vlIcms: 0, vlBcIcmsSt: 0, vlIcmsSt: 0, vlRedBc: 0, vlIpi: 0 });
          g.documentos++; ['vlOpr', 'vlBcIcms', 'vlIcms', 'vlBcIcmsSt', 'vlIcmsSt', 'vlRedBc', 'vlIpi'].forEach(function (f) { g[f] += a[f]; });
        } else {
          var aj = { codAj: c.COD_AJ, descrComplAj: c.DESCR_COMPL_AJ, codItem: c.COD_ITEM, vlBcIcms: num(c, reg, 'VL_BC_ICMS', n), aliqIcms: num(c, reg, 'ALIQ_ICMS', n), vlIcms: num(c, reg, 'VL_ICMS', n), vlOutros: num(c, reg, 'VL_OUTROS', n) };
          nota.ajustes.push(aj);
          r.ajustesC197.push({ numDoc: nota.numDoc, ser: nota.ser, codMod: nota.codMod, codAj: aj.codAj, descrComplAj: aj.descrComplAj, codItem: aj.codItem, vlBcIcms: aj.vlBcIcms, aliqIcms: aj.aliqIcms, vlIcms: aj.vlIcms, vlOutros: aj.vlOutros });
        }
      } else if (reg === 'E100') {
        nota = null;
        per = { ini: dataCampo(c.DT_INI, reg, 'DT_INI', ctx, n), fin: dataCampo(c.DT_FIN, reg, 'DT_FIN', ctx, n) };
      } else if (reg === 'E110') {
        nota = null;
        e110 = {
          periodo: per, vlTotDebitos: num(c, reg, 'VL_TOT_DEBITOS', n), vlAjDebitos: num(c, reg, 'VL_AJ_DEBITOS', n), vlTotAjDebitos: num(c, reg, 'VL_TOT_AJ_DEBITOS', n), vlEstornosCred: num(c, reg, 'VL_ESTORNOS_CRED', n),
          vlTotCreditos: num(c, reg, 'VL_TOT_CREDITOS', n), vlAjCreditos: num(c, reg, 'VL_AJ_CREDITOS', n), vlTotAjCreditos: num(c, reg, 'VL_TOT_AJ_CREDITOS', n), vlEstornosDeb: num(c, reg, 'VL_ESTORNOS_DEB', n),
          vlSldCredorAnt: num(c, reg, 'VL_SLD_CREDOR_ANT', n), vlSldApurado: num(c, reg, 'VL_SLD_APURADO', n), vlTotDed: num(c, reg, 'VL_TOT_DED', n), vlIcmsRecolher: num(c, reg, 'VL_ICMS_RECOLHER', n),
          vlSldCredorTransportar: num(c, reg, 'VL_SLD_CREDOR_TRANSPORTAR', n), debEsp: num(c, reg, 'DEB_ESP', n), ajustes: []
        };
        r.apuracaoE110.push(e110);
      } else if (reg === 'E111') {
        if (!e110) ctx.avisar('e111orfao', 'E111 sem E110 anterior.', n);
        var a2 = { codAjApur: c.COD_AJ_APUR, descrComplAj: c.DESCR_COMPL_AJ, vlAjApur: num(c, reg, 'VL_AJ_APUR', n), periodo: e110 ? e110.periodo : per };
        r.ajustesE111.push(a2); if (e110) e110.ajustes.push(a2);
      } else if (reg === 'E116') {
        r.obrigacoesE116.push({ codOr: c.COD_OR, vlOr: num(c, reg, 'VL_OR', n), dtVcto: dataCampo(c.DT_VCTO, reg, 'DT_VCTO', ctx, n), codRec: c.COD_REC, numProc: c.NUM_PROC, indProc: c.IND_PROC, proc: c.PROC, txtCompl: c.TXT_COMPL, mesRef: c.MES_REF, periodo: per });
      } else if (reg === 'H010') {
        nota = null;
        r.inventarioH010.push({ codItem: c.COD_ITEM, unid: c.UNID, qtd: num(c, reg, 'QTD', n), vlUnit: num(c, reg, 'VL_UNIT', n), vlItem: num(c, reg, 'VL_ITEM', n), indProp: c.IND_PROP, codPart: c.COD_PART, txtCompl: c.TXT_COMPL });
      }
    });

    if (!tem0000) ctx.avisar('sem0000', 'Registro 0000 não encontrado: o arquivo pode não ser uma EFD ICMS/IPI.', 1);

    // referências cruzadas (aviso, não descarte)
    Object.keys(usados).forEach(function (cod) {
      if (itensPorCod[cod]) return;
      ctx.avisar('item0200', 'COD_ITEM do C170 sem cadastro no 0200 (ex.: "' + cod + '").', usados[cod]);
    });
    Object.keys(partUsados).forEach(function (cod) {
      if (!partPorCod[cod]) ctx.avisar('part0150', 'COD_PART do C100 sem cadastro no 0150 (ex.: "' + cod + '").', partUsados[cod]);
    });
    r.notas.forEach(function (nt) { nt.itens.forEach(function (i) { var cad = itensPorCod[i.codItem]; if (cad) i.ncm = cad.ncm || null; }); });

    r.resumoC190 = Object.keys(resumoMapa).map(function (k) {
      var g = resumoMapa[k];
      ['vlOpr', 'vlBcIcms', 'vlIcms', 'vlBcIcmsSt', 'vlIcmsSt', 'vlRedBc', 'vlIpi'].forEach(function (f) { g[f] = r2(g[f]); });
      return g;
    }).sort(function (a, b) { return a.cfop < b.cfop ? -1 : a.cfop > b.cfop ? 1 : a.cstIcms < b.cstIcms ? -1 : a.cstIcms > b.cstIcms ? 1 : a.aliqIcms - b.aliqIcms; });

    r.avisos = ctx.lista();
    return r;
  }

  // ------------------------------------------------------------------ resumo
  /** Totais de ICMS de um arquivo lido (ou de uma lista de arquivos lidos). */
  function resumo(lidos) {
    var arr = Array.isArray(lidos) ? lidos : [lidos];
    arr = arr.filter(Boolean);
    var avisos = [], chaves = {}, e110 = [];
    arr.forEach(function (l) {
      var pre = arr.length > 1 ? '[' + l.arquivo + '] ' : '';
      (l.avisos || []).forEach(function (a) { avisos.push(pre + a); });
      (l.apuracaoE110 || []).forEach(function (e) { e110.push(e); });
      var chave = (l.cnpj || l.cpf || '') + '|' + (l.ini || '');
      if (l.ini && chaves[chave]) avisos.push('Período ' + l.ini + ' do mesmo contribuinte aparece em mais de um arquivo (' + chaves[chave] + ' e ' + l.arquivo + '): totais podem estar em duplicidade.');
      else if (l.ini) chaves[chave] = l.arquivo;
      if (!(l.apuracaoE110 || []).length) avisos.push((pre) + 'Arquivo sem E110: sem apuração de ICMS declarada.');
    });
    var sai = 0, ent = 0, outros = 0;
    arr.forEach(function (l) {
      (l.resumoC190 || []).forEach(function (g) {
        if (g.sentido === 'saida') sai += g.vlIcms; else if (g.sentido === 'entrada') ent += g.vlIcms; else outros += g.vlIcms;
      });
    });
    var debito = soma(e110, function (e) { return e.vlTotDebitos; });
    if (e110.length && Math.abs(debito - r2(sai)) > 0.01) {
      avisos.push('ICMS das saídas nos C190 (' + r2(sai).toFixed(2) + ') difere do VL_TOT_DEBITOS do E110 (' + debito.toFixed(2) + '); informativo, pois o E110 também reúne registros que este leitor não lê (C390, C490, C590, D190 etc.).');
    }
    return {
      arquivos: arr.length,
      periodos: arr.map(function (l) { return { arquivo: l.arquivo, cnpj: l.cnpj, ini: l.ini, fin: l.fin }; }),
      icms: {
        fonte: 'E110 (valores declarados)',
        debito: debito,
        credito: soma(e110, function (e) { return e.vlTotCreditos; }),
        ajustesDebito: soma(e110, function (e) { return e.vlAjDebitos + e.vlTotAjDebitos; }),
        ajustesCredito: soma(e110, function (e) { return e.vlAjCreditos + e.vlTotAjCreditos; }),
        saldoApurado: soma(e110, function (e) { return e.vlSldApurado; }),
        icmsARecolher: soma(e110, function (e) { return e.vlIcmsRecolher; }),
        saldoCredorATransportar: soma(e110, function (e) { return e.vlSldCredorTransportar; })
      },
      c190: { fonte: 'C190 (conferência, não é apuração)', icmsSaidas: r2(sai), icmsEntradas: r2(ent), icmsSemSentido: r2(outros) },
      avisos: avisos
    };
  }

  var api = { VERSAO: VERSAO, lerEfdIcms: lerEfdIcms, resumo: resumo, LEIAUTE: LEIAUTE, COD_SIT: COD_SIT, DUVIDAS: DUVIDAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorEfdIcms = api;
})(typeof self !== 'undefined' ? self : this);
