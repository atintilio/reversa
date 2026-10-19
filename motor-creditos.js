/*
 * Reversa — motor de apuração (v0.2)
 * Leitura da EFD-Contribuições e apuração das teses de PIS/COFINS para
 * empresas do Lucro Real (não cumulativo) e do Lucro Presumido (cumulativo).
 *
 * Teses calculadas:
 *   tema69      Exclusão do ICMS destacado da base (STF, Tema 69)           -> soma no recuperável
 *   monofasico  Revenda de produtos monofásicos tributada por engano         -> soma no recuperável
 *   icmsSt      Exclusão do ICMS-ST da base do substituído (STJ, Tema 1125) -> soma no recuperável
 *   insumos     Levantamento de entradas sem crédito (STJ, Temas 779/780)   -> potencial a validar
 *   lei14592    Crédito tomado sobre ICMS após 05/2023 (só Lucro Real)      -> risco (passivo)
 *
 * Em monitoramento: Tema 118, Tema 1067, Tema 1093 e PERSE. O PERSE exige
 * dados de habilitação, atividade e vigência que não existem na EFD isolada.
 *
 * Todos os valores monetários em CENTAVOS (inteiros).
 * Funciona no navegador (window.MotorCreditos) e no Node (module.exports).
 */
(function (root) {
  'use strict';

  var VERSAO_MOTOR = '0.3.0';

  // ---------------------------------------------------------------- utilidades

  /** "1234,56" -> 123456 (centavos). Vazio -> 0. */
  function centavos(txt) {
    if (txt === undefined || txt === null) return 0;
    var s = String(txt).trim();
    if (s === '') return 0;
    s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    if (!isFinite(n)) throw new Error('Valor numérico inválido: "' + txt + '"');
    return Math.round(n * 100);
  }

  /** "1,6500" -> 1.65 (alíquota percentual). */
  function aliquota(txt) {
    if (txt === undefined || txt === null || String(txt).trim() === '') return 0;
    var n = Number(String(txt).trim().replace(',', '.'));
    if (!isFinite(n)) throw new Error('Alíquota inválida: "' + txt + '"');
    return n;
  }

  /** "12,50000" -> 12.5 (quantidade). */
  function quantidade(txt) {
    if (txt === undefined || txt === null || String(txt).trim() === '') return 0;
    var n = Number(String(txt).trim().replace(/\./g, '').replace(',', '.'));
    if (!isFinite(n)) throw new Error('Quantidade inválida: "' + txt + '"');
    return n;
  }

  /** "31012024" -> {iso:"2024-01-31", ano:2024, mes:1} */
  function data(txt) {
    var s = String(txt || '').trim();
    if (!/^\d{8}$/.test(s)) return null;
    var d = +s.slice(0, 2), m = +s.slice(2, 4), a = +s.slice(4, 8);
    return { iso: a + '-' + s.slice(2, 4) + '-' + s.slice(0, 2), ano: a, mes: m, dia: d };
  }

  function competencia(d) {
    return d ? d.ano + '-' + (d.mes < 10 ? '0' : '') + d.mes : '?';
  }

  /** Divide a linha "|REG|A|B|" em ["REG","A","B"]. */
  function campos(linha) {
    var p = linha.split('|');
    if (p.length < 3 || p[0] !== '') return null;
    if (p[p.length - 1] === '' || p[p.length - 1] === '\r') p.pop();
    p.shift();
    return p;
  }

  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  function sufixoCfop(cfop) { return String(cfop || '').slice(-3); }

  // ---------------------------------------------------------- layout (campos)
  // Índices 0-based conforme o Guia Prático da EFD-Contribuições.
  var L = {
    '0000': { COD_VER: 1, TIPO_ESCRIT: 2, IND_SIT_ESP: 3, NUM_REC_ANT: 4, DT_INI: 5, DT_FIN: 6, NOME: 7, CNPJ: 8, UF: 9, COD_MUN: 10 },
    '0110': { COD_INC_TRIB: 1, IND_APRO_CRED: 2, COD_TIPO_CONT: 3, IND_REG_CUM: 4 },
    '0140': { COD_EST: 1, NOME: 2, CNPJ: 3 },
    '0200': { COD_ITEM: 1, DESCR_ITEM: 2, UNID_INV: 5, TIPO_ITEM: 6, COD_NCM: 7, EX_IPI: 8 },
    'C010': { CNPJ: 1, IND_ESCRI: 2 },
    'C100': { IND_OPER: 1, IND_EMIT: 2, COD_PART: 3, COD_MOD: 4, COD_SIT: 5, SER: 6, NUM_DOC: 7, CHV_NFE: 8, DT_DOC: 9, DT_E_S: 10, VL_DOC: 11, VL_DESC: 13, VL_MERC: 15, VL_ICMS: 21, VL_PIS: 25, VL_COFINS: 26 },
    'C170': { NUM_ITEM: 1, COD_ITEM: 2, DESCR_COMPL: 3, QTD: 4, UNID: 5, VL_ITEM: 6, VL_DESC: 7, CST_ICMS: 9, CFOP: 10,
              VL_BC_ICMS: 12, ALIQ_ICMS: 13, VL_ICMS: 14, VL_BC_ICMS_ST: 15, ALIQ_ST: 16, VL_ICMS_ST: 17, VL_IPI: 23,
              CST_PIS: 24, VL_BC_PIS: 25, ALIQ_PIS: 26, VL_PIS: 29, CST_COFINS: 30, VL_BC_COFINS: 31, ALIQ_COFINS: 32, VL_COFINS: 35 },
    'C180': { COD_MOD: 1, DT_DOC_INI: 2, DT_DOC_FIN: 3, COD_ITEM: 4, COD_NCM: 5, EX_IPI: 6, VL_TOT_ITEM: 7 },
    'C181': { CST: 1, CFOP: 2, VL_ITEM: 3, VL_DESC: 4, VL_BC: 5, ALIQ: 6, VL_TRIB: 9 },
    'C185': { CST: 1, CFOP: 2, VL_ITEM: 3, VL_DESC: 4, VL_BC: 5, ALIQ: 6, VL_TRIB: 9 },
    'M100': { COD_CRED: 1, VL_CRED: 7, VL_CRED_DISP: 11, SLD_CRED: 14 },
    'M500': { COD_CRED: 1, VL_CRED: 7, VL_CRED_DISP: 11, SLD_CRED: 14 },
    '9999': { QTD_LIN: 1 }
  };
  var MIN_CAMPOS = { '0000': 11, '0140': 4, '0200': 9, 'C010': 3, 'C100': 27, 'C170': 36, 'C180': 8, 'C181': 10, 'C185': 10, 'M100': 15, 'M500': 15 };

  var REGIME = { '1': 'Não cumulativo', '2': 'Cumulativo', '3': 'Misto (não cumulativo e cumulativo)' };
  var SIT_VALIDAS = { '00': 1, '01': 1, '06': 1, '07': 1, '08': 1 };
  var CST_TRIBUTADOS = { '01': 1, '02': 1 };
  var CST_ENTRADA_COM_CREDITO = { '50': 1, '51': 1, '52': 1, '53': 1, '54': 1, '55': 1, '56': 1 };
  var CST_ENTRADA_SEM_CREDITO = { '70': 1, '71': 1, '72': 1, '73': 1, '74': 1, '75': 1, '98': 1, '99': 1 };

  // Saídas de mercadoria adquirida de terceiros (revenda). Últimos 3 dígitos do CFOP.
  var CFOP_REVENDA = { '102': 1, '104': 1, '106': 1, '108': 1, '110': 1, '114': 1, '117': 1, '119': 1, '123': 1, '403': 1, '405': 1, '655': 1, '656': 1, '667': 1 };
  // Entradas típicas de insumo, frete, serviço e consumo (candidatas ao levantamento de insumos).
  var CFOP_INSUMO = { '101': 1, '111': 1, '116': 1, '120': 1, '122': 1, '126': 1, '128': 1, '351': 1, '352': 1, '353': 1, '354': 1, '356': 1, '407': 1, '556': 1, '653': 1, '933': 1 };

  var ALIQ_NC = { pis: 1.65, cofins: 7.6 };
  var INICIO_LEI_14592 = '2023-05';   // MP 1.159/2023 (efeitos a partir de 01/05/2023), convertida na Lei 14.592/2023

  // ---------------------------------------------- tabela inicial de monofásicos
  // Prefixos de NCM. É uma tabela de PARTIDA: o resultado sai como "a conferir NCM a NCM".
  var MONOFASICOS = [
    { grupo: 'Farmacêuticos', base: 'Lei 10.147/2000, art. 1º, I, "a"',
      prefixos: ['3001', '3003', '3004', '3002101', '3002102', '3002103', '3002201', '3002202', '30029020', '30029092', '30029099', '30051010', '3006301', '3006302', '30066000'],
      excecoes: ['30039056', '30049046'] },
    { grupo: 'Perfumaria e higiene pessoal', base: 'Lei 10.147/2000, art. 1º, I, "b"',
      prefixos: ['3303', '3304', '3305', '3306', '3307', '34011190', '34012010', '96032100'], excecoes: [] },
    { grupo: 'Pneus e câmaras de ar', base: 'Lei 10.485/2002, art. 5º',
      prefixos: ['4011', '4013'], excecoes: [] }
  ];

  function classificarMonofasico(ncm, exIpi, extras) {
    var n = soDigitos(ncm);
    if (n.length < 4) return null;
    for (var i = 0; i < MONOFASICOS.length; i++) {
      var g = MONOFASICOS[i];
      if (g.excecoes.some(function (e) { return n.indexOf(e) === 0; })) return null;
      if (g.grupo.indexOf('Perfumaria') === 0 && n.indexOf('34011190') === 0 && soDigitos(exIpi) === '01') return null;
      if (g.prefixos.some(function (p) { return n.indexOf(p) === 0; })) return { grupo: g.grupo, base: g.base };
    }
    for (var j = 0; j < (extras || []).length; j++) {
      var p = soDigitos(extras[j]);
      if (p.length >= 4 && n.indexOf(p) === 0) return { grupo: 'Incluído pelo usuário (' + p + ')', base: 'Tabela complementar informada pelo usuário' };
    }
    return null;
  }

  // ------------------------------------------------------------------ parser

  /**
   * Lê o texto de uma EFD-Contribuições.
   * @returns {{arquivo, meta, itens, entradas, produtos, avisos, erros, estatisticas}}
   *   itens    = itens C170 de notas de SAÍDA válidas
   *   entradas = itens C170 de notas de ENTRADA válidas
   */
  function lerEfdContribuicoes(texto, nomeArquivo) {
    var res = {
      arquivo: nomeArquivo || '(sem nome)',
      meta: null, itens: [], entradas: [], consolidados: [], saldoCredito: { pis: 0, cofins: 0, registros: 0 }, produtos: 0, avisos: [], erros: [],
      estatisticas: { linhas: 0, registros: {}, c100Saida: 0, c100Entrada: 0, c100SaidaSemItens: 0, c100Ignorados: 0, consolidados: 0, itensSemNcm: 0 }
    };
    var linhas = texto.split(/\r?\n/);
    var estab = null, estab0140 = null, doc = null, docTemItem = false, qtd9999 = null, c180 = null;
    var cadastro = {};   // "cnpj|cod" e "*|cod" -> {ncm, descr, exIpi, unid}

    function fecharDoc() {
      if (doc && doc.saida && doc.valida && !docTemItem) res.estatisticas.c100SaidaSemItens++;
      doc = null; docTemItem = false;
    }
    function produto(cod) {
      return cadastro[estab + '|' + cod] || cadastro['*|' + cod] || null;
    }

    for (var i = 0; i < linhas.length; i++) {
      var bruta = linhas[i];
      if (bruta.trim() === '') continue;
      var nLinha = i + 1;
      var f = campos(bruta);
      if (!f) { res.erros.push('Linha ' + nLinha + ': formato inválido (não começa com "|").'); continue; }
      var reg = f[0];
      res.estatisticas.linhas++;
      res.estatisticas.registros[reg] = (res.estatisticas.registros[reg] || 0) + 1;

      if (MIN_CAMPOS[reg] && f.length < MIN_CAMPOS[reg]) {
        res.erros.push('Linha ' + nLinha + ': registro ' + reg + ' com ' + f.length + ' campos (esperado ≥ ' + MIN_CAMPOS[reg] + ').');
        continue;
      }

      try {
        if (reg === '0000') {
          if (/^\d{8}$/.test(f[3])) {
            res.erros.push('Este arquivo parece ser uma EFD ICMS/IPI, não uma EFD-Contribuições.');
            return res;
          }
          var x = L['0000'];
          res.meta = {
            versaoLeiaute: f[x.COD_VER],
            retificadora: f[x.TIPO_ESCRIT] === '1',
            recAnterior: f[x.NUM_REC_ANT] || '',
            dtIni: data(f[x.DT_INI]), dtFin: data(f[x.DT_FIN]),
            nome: f[x.NOME], cnpj: f[x.CNPJ], uf: f[x.UF],
            regime: null, regimeCodigo: null
          };
          res.meta.competencia = competencia(res.meta.dtIni);
        } else if (reg === '0110') {
          if (res.meta) {
            res.meta.regimeCodigo = f[L['0110'].COD_INC_TRIB];
            res.meta.regime = REGIME[res.meta.regimeCodigo] || ('Código ' + f[1]);
          }
        } else if (reg === '0140') {
          estab0140 = f[L['0140'].CNPJ] || null;
        } else if (reg === '0200') {
          var z = L['0200'];
          var info = { ncm: soDigitos(f[z.COD_NCM]), descr: f[z.DESCR_ITEM] || '', exIpi: f[z.EX_IPI] || '', unid: f[z.UNID_INV] || '' };
          cadastro[(estab0140 || '*') + '|' + f[z.COD_ITEM]] = info;
          if (!cadastro['*|' + f[z.COD_ITEM]]) cadastro['*|' + f[z.COD_ITEM]] = info;
          res.produtos++;
        } else if (reg === 'C010') {
          fecharDoc();
          estab = f[L.C010.CNPJ];
          if (f[L.C010.IND_ESCRI] === '1') {
            res.avisos.push('Estabelecimento ' + estab + ' escriturado de forma consolidada (C180/C181/C185): analisado apenas para monofásicos.');
          }
        } else if (reg === 'C180') {
          res.estatisticas.consolidados++;
          var q = L.C180, pc = produto(f[q.COD_ITEM]);
          c180 = { estab: estab, codItem: f[q.COD_ITEM], ncm: soDigitos(f[q.COD_NCM]) || (pc ? pc.ncm : ''), exIpi: f[q.EX_IPI] || (pc ? pc.exIpi : ''),
                   descricao: pc ? pc.descr : '', data: data(f[q.DT_DOC_INI]), porCfop: {} };
        } else if (reg === 'C181' || reg === 'C185') {
          res.estatisticas.consolidados++;
          if (!c180) { res.avisos.push('Linha ' + nLinha + ': ' + reg + ' sem C180 anterior — ignorado.'); continue; }
          var qc = L[reg], pis = reg === 'C181';
          var alvo = c180.porCfop[f[qc.CFOP]];
          if (!alvo) {
            alvo = c180.porCfop[f[qc.CFOP]] = { linha: nLinha, estab: c180.estab, doc: 'consolidado', serie: '', chave: '', data: c180.data ? c180.data.iso : '', item: '', codItem: c180.codItem,
              descricao: c180.descricao, ncm: c180.ncm, exIpi: c180.exIpi, qtd: 0, unid: '', cfop: f[qc.CFOP], cstIcms: '',
              vlItem: 0, vlDesc: 0, vlIcms: 0, vlIcmsSt: 0, vlIpi: 0, cstPis: '', bcPis: 0, aliqPis: 0, vlPis: 0, cstCofins: '', bcCofins: 0, aliqCofins: 0, vlCofins: 0, consolidado: true };
            res.consolidados.push(alvo);
          }
          if (pis) { alvo.cstPis = f[qc.CST]; alvo.vlItem = centavos(f[qc.VL_ITEM]); alvo.vlDesc = centavos(f[qc.VL_DESC]); alvo.bcPis = centavos(f[qc.VL_BC]); alvo.aliqPis = aliquota(f[qc.ALIQ]); alvo.vlPis = centavos(f[qc.VL_TRIB]); }
          else { alvo.cstCofins = f[qc.CST]; if (!alvo.vlItem) alvo.vlItem = centavos(f[qc.VL_ITEM]); alvo.bcCofins = centavos(f[qc.VL_BC]); alvo.aliqCofins = aliquota(f[qc.ALIQ]); alvo.vlCofins = centavos(f[qc.VL_TRIB]); }
        } else if (reg === 'C190') {
          res.estatisticas.consolidados++;
        } else if (reg === 'M100' || reg === 'M500') {
          var qm = L[reg], sld = centavos(f[qm.SLD_CRED]);
          res.saldoCredito[reg === 'M100' ? 'pis' : 'cofins'] += sld; res.saldoCredito.registros++;
        } else if (reg === 'C100') {
          fecharDoc();
          var c = L.C100;
          var saida = f[c.IND_OPER] === '1';
          var entrada = f[c.IND_OPER] === '0';
          var sitOk = !!SIT_VALIDAS[f[c.COD_SIT]];
          doc = {
            linha: nLinha, estab: estab, numero: f[c.NUM_DOC], serie: f[c.SER], chave: f[c.CHV_NFE],
            modelo: f[c.COD_MOD], data: data(f[c.DT_DOC]), sit: f[c.COD_SIT],
            saida: saida, entrada: entrada, valida: sitOk
          };
          if (!sitOk) res.estatisticas.c100Ignorados++;
          else if (saida) res.estatisticas.c100Saida++;
          else if (entrada) res.estatisticas.c100Entrada++;
        } else if (reg === 'C170') {
          if (!doc) { res.avisos.push('Linha ' + nLinha + ': C170 sem C100 anterior — ignorado.'); continue; }
          docTemItem = true;
          if (!doc.valida || !(doc.saida || doc.entrada)) continue;
          var k = L.C170;
          var prod = produto(f[k.COD_ITEM]);
          if (!prod || !prod.ncm) res.estatisticas.itensSemNcm++;
          var it = {
            linha: nLinha, linhaDoc: doc.linha, estab: doc.estab,
            doc: doc.numero, serie: doc.serie, chave: doc.chave, data: doc.data ? doc.data.iso : '',
            item: f[k.NUM_ITEM], codItem: f[k.COD_ITEM], descricao: prod ? prod.descr : '', ncm: prod ? prod.ncm : '', exIpi: prod ? prod.exIpi : '',
            qtd: quantidade(f[k.QTD]), unid: f[k.UNID] || '', cfop: f[k.CFOP], cstIcms: f[k.CST_ICMS] || '',
            vlItem: centavos(f[k.VL_ITEM]), vlDesc: centavos(f[k.VL_DESC]), vlIcms: centavos(f[k.VL_ICMS]),
            vlIcmsSt: centavos(f[k.VL_ICMS_ST]), vlIpi: centavos(f[k.VL_IPI]),
            cstPis: f[k.CST_PIS], bcPis: centavos(f[k.VL_BC_PIS]), aliqPis: aliquota(f[k.ALIQ_PIS]), vlPis: centavos(f[k.VL_PIS]),
            cstCofins: f[k.CST_COFINS], bcCofins: centavos(f[k.VL_BC_COFINS]), aliqCofins: aliquota(f[k.ALIQ_COFINS]), vlCofins: centavos(f[k.VL_COFINS])
          };
          (doc.saida ? res.itens : res.entradas).push(it);
        } else if (reg === '9999') {
          qtd9999 = parseInt(f[L['9999'].QTD_LIN], 10);
        }
      } catch (e) {
        res.erros.push('Linha ' + nLinha + ': ' + e.message);
      }
    }
    fecharDoc();

    if (!res.meta) res.erros.push('Registro 0000 não encontrado: o arquivo não é uma EFD-Contribuições válida.');
    else if (!res.meta.regimeCodigo) res.avisos.push('Registro 0110 ausente: regime de apuração não identificado.');
    if (qtd9999 === null) res.avisos.push('Registro 9999 ausente: o arquivo pode estar incompleto.');
    else if (qtd9999 !== res.estatisticas.linhas) res.avisos.push('Registro 9999 informa ' + qtd9999 + ' linhas, mas o arquivo tem ' + res.estatisticas.linhas + '. O arquivo pode estar truncado ou editado.');
    if (res.estatisticas.c100SaidaSemItens > 0) res.avisos.push(res.estatisticas.c100SaidaSemItens + ' nota(s) de saída sem itens C170: não analisadas nesta versão.');
    if (res.consolidados.length > 0) res.avisos.push(res.consolidados.length + ' linha(s) de escrituração consolidada (C180/C181/C185) lida(s): usadas na tese dos monofásicos; sem ICMS destacado, não entram no Tema 69.');
    var totalItens = res.itens.length + res.entradas.length;
    if (totalItens > 0 && res.estatisticas.itensSemNcm === totalItens) res.avisos.push('Nenhum item tem NCM no cadastro (0200): a tese dos monofásicos não pode ser verificada neste arquivo.');
    else if (res.estatisticas.itensSemNcm > 0) res.avisos.push(res.estatisticas.itensSemNcm + ' item(ns) sem NCM no cadastro (0200).');
    return res;
  }

  // ------------------------------------------------------------------- regras

  function valorTributo(vl, bc, aliq) {
    return vl > 0 ? vl : Math.round(bc * aliq / 100);
  }

  /**
   * Tema 69 — exclusão do ICMS destacado da base do PIS/COFINS.
   *   base_correta  = max(0, VL_ITEM − VL_DESC − VL_ICMS)
   *   excesso_base  = min(VL_ICMS, max(0, VL_BC − base_correta))
   *   crédito       = excesso_base × alíquota declarada
   */
  function calcularItem(it) {
    var baseCorreta = Math.max(0, it.vlItem - it.vlDesc - it.vlIcms);
    function trib(cst, bc, aliq) {
      if (!CST_TRIBUTADOS[cst]) return { excesso: 0, credito: 0, status: 'CST ' + cst + ' fora do escopo' };
      if (it.vlIcms <= 0) return { excesso: 0, credito: 0, status: 'Sem ICMS destacado' };
      var excesso = Math.min(it.vlIcms, Math.max(0, bc - baseCorreta));
      if (excesso === 0) return { excesso: 0, credito: 0, status: 'ICMS já excluído' };
      return { excesso: excesso, credito: Math.round(excesso * aliq / 100), status: 'Crédito' };
    }
    var p = trib(it.cstPis, it.bcPis, it.aliqPis);
    var c = trib(it.cstCofins, it.bcCofins, it.aliqCofins);
    return {
      baseCorreta: baseCorreta,
      excessoPis: p.excesso, creditoPis: p.credito, statusPis: p.status,
      excessoCofins: c.excesso, creditoCofins: c.credito, statusCofins: c.status
    };
  }

  /** Monofásico: revenda de produto monofásico tributada (CST 01/02) -> restituição integral do PIS/COFINS pago. */
  function calcularMonofasico(it, extras) {
    var cls = classificarMonofasico(it.ncm, it.exIpi, extras);
    if (!cls) return null;
    var r = { grupo: cls.grupo, base: cls.base, pis: 0, cofins: 0, status: '' };
    if (!CFOP_REVENDA[sufixoCfop(it.cfop)]) { r.status = 'CFOP ' + it.cfop + ' não é de revenda'; return r; }
    var tribPis = !!CST_TRIBUTADOS[it.cstPis], tribCof = !!CST_TRIBUTADOS[it.cstCofins];
    if (!tribPis && !tribCof) { r.status = 'Já sem tributação (CST ' + it.cstPis + ')'; return r; }
    r.pis = tribPis ? valorTributo(it.vlPis, it.bcPis, it.aliqPis) : 0;
    r.cofins = tribCof ? valorTributo(it.vlCofins, it.bcCofins, it.aliqCofins) : 0;
    r.status = (r.pis || r.cofins) ? 'Crédito — conferir NCM' : 'Tributado sem valor';
    return r;
  }

  /** Custo médio unitário de ICMS-ST nas entradas, por estabelecimento + código do item. */
  function indiceSt(entradas) {
    var idx = {};
    entradas.forEach(function (e) {
      if (e.vlIcmsSt <= 0 || e.qtd <= 0) return;
      var k = e.estab + '|' + e.codItem;
      var a = idx[k] || (idx[k] = { st: 0, qtd: 0, unids: {}, notas: 0 });
      a.st += e.vlIcmsSt; a.qtd += e.qtd; a.unids[e.unid] = 1; a.notas++;
    });
    return idx;
  }

  /**
   * ICMS-ST (substituído) — Tema 1125 STJ.
   * Só saídas com CST ICMS x60 (ICMS cobrado anteriormente por ST), CFOP de revenda e PIS/COFINS tributados.
   *   st_atribuído  = quantidade vendida × (ICMS-ST das entradas ÷ quantidade das entradas)
   *   base_correta  = max(0, VL_ITEM − VL_DESC − st_atribuído)
   *   excesso_base  = min(st_atribuído, max(0, VL_BC − base_correta))
   */
  function calcularIcmsSt(it, idx) {
    if (String(it.cstIcms).slice(-2) !== '60') return null;
    if (!CFOP_REVENDA[sufixoCfop(it.cfop)]) return null;
    var r = { stUnit: 0, stAtribuido: 0, excessoPis: 0, excessoCofins: 0, pis: 0, cofins: 0, status: '', semEntrada: false };
    if (!CST_TRIBUTADOS[it.cstPis] && !CST_TRIBUTADOS[it.cstCofins]) { r.status = 'CST ' + it.cstPis + ' fora do escopo'; return r; }
    var a = idx[it.estab + '|' + it.codItem];
    if (!a) { r.status = 'Sem entrada com ICMS-ST para o item'; r.semEntrada = true; return r; }
    var unids = Object.keys(a.unids);
    if (unids.length !== 1 || unids[0] !== it.unid) { r.status = 'Unidade divergente (' + unids.join('/') + ' × ' + it.unid + ') — conferir 0220'; return r; }
    r.stUnit = a.st / a.qtd;
    r.stAtribuido = Math.round(it.qtd * r.stUnit);
    var baseCorreta = Math.max(0, it.vlItem - it.vlDesc - r.stAtribuido);
    if (CST_TRIBUTADOS[it.cstPis]) { r.excessoPis = Math.min(r.stAtribuido, Math.max(0, it.bcPis - baseCorreta)); r.pis = Math.round(r.excessoPis * it.aliqPis / 100); }
    if (CST_TRIBUTADOS[it.cstCofins]) { r.excessoCofins = Math.min(r.stAtribuido, Math.max(0, it.bcCofins - baseCorreta)); r.cofins = Math.round(r.excessoCofins * it.aliqCofins / 100); }
    r.status = (r.pis || r.cofins) ? 'Crédito' : 'ICMS-ST já excluído';
    return r;
  }

  /** Insumos (só não cumulativo): entrada sem crédito em CFOP típico de insumo -> potencial a validar. */
  function calcularInsumo(e, comp) {
    if (!CST_ENTRADA_SEM_CREDITO[e.cstPis]) return null;
    if (!CFOP_INSUMO[sufixoCfop(e.cfop)]) return null;
    var semIcms = comp >= INICIO_LEI_14592;
    var base = Math.max(0, e.vlItem - e.vlDesc + e.vlIpi - (semIcms ? e.vlIcms : 0));
    return { base: base, pis: Math.round(base * ALIQ_NC.pis / 100), cofins: Math.round(base * ALIQ_NC.cofins / 100),
             status: 'A validar (essencialidade/relevância)' + (semIcms ? ' — base sem ICMS' : '') };
  }

  /** Lei 14.592/2023: a partir de 05/2023 o ICMS não entra na base do crédito. Detecta crédito tomado sobre ICMS. */
  function calcularRisco14592(e, comp) {
    if (comp < INICIO_LEI_14592) return null;
    if (!CST_ENTRADA_COM_CREDITO[e.cstPis] || e.vlIcms <= 0) return null;
    var baseMax = Math.max(0, e.vlItem - e.vlDesc + e.vlIpi - e.vlIcms);
    var exPis = Math.min(e.vlIcms, Math.max(0, e.bcPis - baseMax));
    var exCof = CST_ENTRADA_COM_CREDITO[e.cstCofins] ? Math.min(e.vlIcms, Math.max(0, e.bcCofins - baseMax)) : 0;
    if (!exPis && !exCof) return null;
    return { excessoPis: exPis, excessoCofins: exCof,
             pis: Math.round(exPis * e.aliqPis / 100), cofins: Math.round(exCof * e.aliqCofins / 100),
             status: 'Crédito sobre ICMS — risco de glosa' };
  }

  // ------------------------------------------------------------ catálogo

  var CATALOGO = [
    { id: 'tema69', nome: 'Exclusão do ICMS da base do PIS/COFINS', curto: 'ICMS na base (Tema 69)',
      classificacao: 'Pacificada', natureza: 'credito', regimes: 'Lucro Real e Presumido', calculada: true,
      fundamento: 'STF, RE 574.706 (Tema 69), com modulação a partir de 15/03/2017; ICMS a excluir é o destacado na nota (ED julgados em 13/05/2021). PGFN, Parecer SEI 7.698/2021/ME.' },
    { id: 'monofasico', nome: 'Revenda de produtos monofásicos tributada por engano', curto: 'Monofásicos (revenda)',
      classificacao: 'Pacificada (correção de erro)', natureza: 'credito', regimes: 'Lucro Real e Presumido', calculada: true,
      fundamento: 'Lei 10.147/2000 (farmacêuticos e perfumaria) e Lei 10.485/2002 (autopeças, pneus e câmaras): alíquota zero na revenda por atacadista ou varejista. Pagamento indevido restituível (CTN, arts. 165 e 168).' },
    { id: 'icmsSt', nome: 'Exclusão do ICMS-ST da base do PIS/COFINS do substituído', curto: 'ICMS-ST (Tema 1125)',
      classificacao: 'Pacificada', natureza: 'credito', regimes: 'Lucro Real e Presumido', calculada: true,
      fundamento: 'STJ, Tema 1.125 (REsp 1.896.678 e 1.958.265), efeitos a partir de 15/03/2017 (modulação redefinida em 20/06/2024). PGFN, Parecer SEI 4.090/2024/MF; Receita Federal, Solução de Consulta Cosit 100/2025 (recuperação administrativa; valor a excluir é o destacado nas notas).' },
    { id: 'insumos', nome: 'Créditos de insumos não aproveitados — Tema 779/780', curto: 'Tema 779/780 — insumos',
      classificacao: 'Pacificada no conceito, prova caso a caso', natureza: 'potencial', regimes: 'Só Lucro Real (não cumulativo)', calculada: true,
      fundamento: 'STJ, REsp 1.221.170 (Temas 779 e 780): insumo pelo critério de essencialidade ou relevância, com análise casuística e prova. PGFN, página de créditos de PIS/COFINS atualizada em 28/04/2026. O motor faz triagem por entrada/CFOP; não reconhece crédito sem análise do processo produtivo, fornecedor, vedações legais e documentação.' },
    { id: 'lei14592', nome: 'Crédito tomado sobre ICMS após a Lei 14.592/2023', curto: 'Risco: ICMS no crédito',
      classificacao: 'Verificação de risco', natureza: 'risco', regimes: 'Só Lucro Real (não cumulativo)', calculada: true,
      fundamento: 'Lei 14.592/2023 (conversão da MP 1.159/2023): a partir de 05/2023 o ICMS destacado não integra a base dos créditos. Crédito tomado sobre ICMS pode ser glosado e deve ser compensado antes de pedir restituição.' },
    { id: 'saldoCredor', nome: 'Saldo credor de PIS/COFINS acumulado e não utilizado', curto: 'Saldo credor acumulado (M100/M500)',
      classificacao: 'Consolidada em lei — destino depende da origem do crédito', natureza: 'potencial', regimes: 'Só Lucro Real (não cumulativo)', calculada: true,
      fundamento: 'Leis 10.637/2002, art. 5º, e 10.833/2003, art. 6º; Lei 11.033/2004, art. 17; IN RFB 2.055/2021. Saldo informado pela própria empresa nos registros M100 (PIS) e M500 (COFINS) da última competência lida. Ressarcimento ou compensação dependem da origem do crédito (exportação, suspensão, alíquota zero) e da conferência da escrituração.' },
    { id: 'tema118', nome: 'Exclusão do ISS da base do PIS/COFINS', curto: 'ISS na base (Tema 118)',
      classificacao: 'Em julgamento — alto risco', natureza: 'monitorar', regimes: 'Lucro Real e Presumido', calculada: false,
      fundamento: 'STF, RE 592.616 (Tema 118): placar empatado em 5 x 5, julgamento retirado da pauta de 25/02/2026. Só por ação judicial; não entra no recuperável.' },
    { id: 'tema1067', nome: 'Exclusão do PIS/COFINS da própria base', curto: 'PIS/COFINS na própria base (Tema 1067)',
      classificacao: 'Pendente no STF — alto risco', natureza: 'monitorar', regimes: 'Lucro Real e Presumido', calculada: false,
      fundamento: 'STF, RE 1.233.096 (Tema 1.067), sem data de julgamento. Só por ação judicial; não entra no recuperável.' },
    { id: 'tema1093', nome: 'Crédito na compra de monofásicos para revenda', curto: 'Crédito na compra de monofásicos',
      classificacao: 'Desfavorável — não recomendada', natureza: 'monitorar', regimes: 'Só Lucro Real', calculada: false,
      fundamento: 'STJ, Tema 1.093: vedado o crédito sobre aquisição de bens sujeitos à tributação monofásica para revenda.' },
    { id: 'perse', nome: 'PERSE — PIS/Cofins sobre receitas de atividades elegíveis', curto: 'PERSE (revisão por competência)',
      classificacao: 'Encerrado administrativamente em 2025; validar atos e decisões judiciais', natureza: 'monitorar', regimes: 'Conforme habilitação, atividade e regime', calculada: false,
      fundamento: 'Lei 14.148/2021, alterações da Lei 14.859/2024, ADE RFB nº 2/2025 e avaliação oficial do Governo. O benefício dependia de atividade/CNAE e receita diretamente elegível, habilitação e demais requisitos; o teto fiscal foi declarado exaurido em março de 2025. Não é quantificado pelo EFD sozinho.' }
  ];

  var COLUNAS = {
    tema69: [
      ['data', 'Data', 't'], ['doc', 'NF', 't'], ['item', 'Item', 't'], ['cfop', 'CFOP', 't'], ['vlItem', 'Valor item', 'm'], ['vlIcms', 'ICMS', 'm'],
      ['bcPis', 'Base PIS decl.', 'm'], ['baseCorreta', 'Base correta', 'm'], ['excessoPis', 'Excesso base', 'm'], ['pis', 'Crédito PIS', 'm'], ['cofins', 'Crédito COFINS', 'm'], ['status', 'Situação', 't']],
    monofasico: [
      ['data', 'Data', 't'], ['doc', 'NF', 't'], ['codItem', 'Produto', 't'], ['ncm', 'NCM', 't'], ['grupo', 'Grupo', 't'], ['cfop', 'CFOP', 't'],
      ['cstPis', 'CST', 't'], ['vlItem', 'Valor item', 'm'], ['pis', 'PIS pago', 'm'], ['cofins', 'COFINS pago', 'm'], ['status', 'Situação', 't']],
    icmsSt: [
      ['data', 'Data', 't'], ['doc', 'NF', 't'], ['codItem', 'Produto', 't'], ['qtd', 'Qtd', 'n'], ['cstIcms', 'CST ICMS', 't'], ['vlItem', 'Valor item', 'm'],
      ['stAtribuido', 'ICMS-ST atribuído', 'm'], ['excessoPis', 'Excesso base', 'm'], ['pis', 'Crédito PIS', 'm'], ['cofins', 'Crédito COFINS', 'm'], ['status', 'Situação', 't']],
    insumos: [
      ['data', 'Data', 't'], ['doc', 'NF', 't'], ['codItem', 'Produto', 't'], ['descricao', 'Descrição', 't'], ['cfop', 'CFOP', 't'], ['cstPis', 'CST', 't'],
      ['base', 'Base potencial', 'm'], ['pis', 'PIS potencial', 'm'], ['cofins', 'COFINS potencial', 'm'], ['status', 'Situação', 't']],
    saldoCredor: [
      ['competencia', 'Última competência', 't'], ['cnpjMatriz', 'CNPJ', 't'], ['arquivo', 'Arquivo', 't'], ['pis', 'Saldo PIS', 'm'], ['cofins', 'Saldo COFINS', 'm'], ['status', 'Situação', 't']],
    lei14592: [
      ['data', 'Data', 't'], ['doc', 'NF', 't'], ['codItem', 'Produto', 't'], ['cfop', 'CFOP', 't'], ['vlItem', 'Valor item', 'm'], ['vlIcms', 'ICMS', 'm'],
      ['bcPis', 'Base do crédito', 'm'], ['excessoPis', 'ICMS na base', 'm'], ['pis', 'PIS em risco', 'm'], ['cofins', 'COFINS em risco', 'm'], ['status', 'Situação', 't']]
  };

  /**
   * Por que uma tese ficou sem valor? Nunca deixa o zero mudo: aponta o que o arquivo tem (ou não tem).
   * Devolve { arquivos: [...], motivos: { idTese: 'texto' } }.
   */
  function explicarLeitura(usados, T) {
    var arquivos = usados.map(function (l) {
      var e = l.estatisticas || {};
      return { arquivo: l.arquivo, competencia: l.meta.competencia, regime: l.meta.regime || '—',
               saidas: l.itens.length, entradas: (l.entradas || []).length, consolidados: (l.consolidados || []).length,
               produtos: l.produtos, saldoM: l.saldoCredito ? l.saldoCredito.registros : 0, c100SemItens: e.c100SaidaSemItens || 0 };
    });
    var saidas = [], entradas = [], consol = [];
    usados.forEach(function (l) { saidas = saidas.concat(l.itens); entradas = entradas.concat(l.entradas || []); consol = consol.concat(l.consolidados || []); });
    var semItens = arquivos.reduce(function (n, a) { return n + a.c100SemItens; }, 0);
    var naoCum = usados.some(function (l) { return l.meta.regimeCodigo === '1' || l.meta.regimeCodigo === '3'; });
    var m = {};
    function algum(arr, fn) { return arr.some(fn); }
    var base0 = semItens ? ' Há ' + semItens + ' nota(s) de saída sem itens C170 (registro C100 sem detalhe): sem o item não há como calcular.' : '';
    if (!T.tema69.aplicavel || !T.tema69.total.itensComValor) {
      if (!saidas.length) m.tema69 = 'Nenhuma saída com itens C170 nos arquivos.' + base0 + (consol.length ? ' A escrituração consolidada (C180/C181/C185) não traz o ICMS destacado.' : '');
      else if (!algum(saidas, function (i) { return i.vlIcms > 0; })) m.tema69 = 'Nenhum item de saída tem ICMS destacado (campo VL_ICMS do C170 zerado ou vazio). Sem o ICMS por item, a exclusão não pode ser calculada.';
      else if (!algum(saidas, function (i) { return CST_TRIBUTADOS[i.cstPis] || CST_TRIBUTADOS[i.cstCofins]; })) m.tema69 = 'Nenhuma saída com CST 01 ou 02 de PIS/COFINS (tributação normal): os itens estão com outros CST.';
      else m.tema69 = 'Nos itens com ICMS, a base de PIS/COFINS declarada já está sem o ICMS (BC igual ou menor que a base correta): não há excesso a recuperar.';
    }
    if (!T.monofasico.aplicavel || !T.monofasico.total.itensComValor) {
      var comNcm = saidas.concat(consol).filter(function (i) { return i.ncm; });
      if (!comNcm.length) m.monofasico = 'Nenhum item de saída tem NCM (cadastro 0200 ausente ou sem NCM): sem NCM não é possível identificar monofásicos.';
      else if (!algum(comNcm, function (i) { return classificarMonofasico(i.ncm, i.exIpi, extrasGlobais); })) m.monofasico = 'Nenhum NCM vendido está na tabela de monofásicos (farmacêuticos, perfumaria, pneus). Combustíveis, bebidas e autopeças dependem de tabela complementar.';
      else m.monofasico = 'Há NCM monofásico, mas a venda não é de revenda (CFOP) ou o PIS/COFINS já está sem tributação (CST diferente de 01/02).';
    }
    if (!T.icmsSt.aplicavel || !T.icmsSt.total.itensComValor) {
      if (!algum(saidas, function (i) { return String(i.cstIcms).slice(-2) === '60'; })) m.icmsSt = 'Nenhuma saída com CST de ICMS final 60 (ICMS cobrado anteriormente por substituição tributária).';
      else m.icmsSt = 'Há saídas com ICMS-ST (CST x60), mas sem a entrada correspondente com ICMS-ST nos meses enviados, ou com unidades divergentes. Envie também os meses de compra.';
    }
    if (!T.insumos.aplicavel) m.insumos = !naoCum ? 'Tese só do regime não cumulativo; os arquivos são de regime cumulativo.' : (entradas.length ? 'Nenhuma entrada sem crédito (CST 70 a 75, 98, 99) em CFOP típico de insumo.' : 'Nenhuma entrada (C170 de notas de entrada) nos arquivos.');
    if (!T.lei14592.aplicavel) m.lei14592 = !naoCum ? 'Verificação só do regime não cumulativo.' : 'Nenhum crédito (CST 50 a 56) tomado sobre ICMS a partir de 05/2023.';
    if (!T.saldoCredor.aplicavel) m.saldoCredor = !naoCum ? 'Saldo credor só no regime não cumulativo.' : 'Registros M100/M500 (apuração de créditos) ausentes nos arquivos.';
    return { arquivos: arquivos, motivos: m };
  }
  var extrasGlobais = [];

  // ------------------------------------------------------------ apuração

  /**
   * Processa um conjunto de arquivos já lidos.
   * @param {Array} lidos  saídas de lerEfdContribuicoes
   * @param {{hoje?: Date, ncmsExtras?: string[]}} opts
   */
  function apurar(lidos, opts) {
    opts = opts || {};
    var hoje = opts.hoje || new Date();
    var extras = opts.ncmsExtras || [];
    extrasGlobais = extras;
    var limite = new Date(hoje.getFullYear() - 5, hoje.getMonth(), 1); // corte aproximado de 5 anos
    var avisos = [], porChave = {};

    lidos.forEach(function (l) {
      if (!l.meta || (l.erros.length && !l.itens.length && !(l.entradas || []).length)) return;
      var chave = l.meta.cnpj + '|' + l.meta.competencia;
      var atual = porChave[chave];
      if (atual) {
        var fica = (!atual.meta.retificadora && l.meta.retificadora) ? l : atual;
        avisos.push('Dois arquivos para ' + l.meta.cnpj + ' em ' + l.meta.competencia + ' (' + atual.arquivo + ', ' + l.arquivo + '). Usado: ' + fica.arquivo + '.');
        porChave[chave] = fica;
      } else porChave[chave] = l;
    });
    var usados = Object.keys(porChave).sort().map(function (k) { return porChave[k]; });

    // Resultado por tese
    var T = {};
    CATALOGO.forEach(function (c) {
      if (!c.calculada) return;
      T[c.id] = { id: c.id, nome: c.nome, curto: c.curto, classificacao: c.classificacao, natureza: c.natureza, regimes: c.regimes, fundamento: c.fundamento,
                  colunas: COLUNAS[c.id], total: { pis: 0, cofins: 0, itens: 0, itensComValor: 0 }, totalNoPrazo: { pis: 0, cofins: 0 },
                  competencias: {}, detalhes: [], avisos: [], aplicavel: false };
    });
    function lancar(id, l, comp, prescrito, linha, pis, cofins) {
      var t = T[id];
      t.aplicavel = true;
      var ck = l.meta.cnpj + '|' + comp;
      var lc = t.competencias[ck] || (t.competencias[ck] = { cnpj: l.meta.cnpj, nome: l.meta.nome, competencia: comp, regime: l.meta.regime || '—', arquivo: l.arquivo,
                                                             retificadora: l.meta.retificadora, possivelmentePrescrito: prescrito, itens: 0, itensComValor: 0, pis: 0, cofins: 0 });
      linha.pis = pis; linha.cofins = cofins; linha.competencia = comp; linha.cnpjMatriz = l.meta.cnpj; linha.arquivo = l.arquivo; linha.possivelmentePrescrito = prescrito;
      t.detalhes.push(linha);
      lc.itens++; t.total.itens++;
      if (pis || cofins) { lc.itensComValor++; t.total.itensComValor++; }
      lc.pis += pis; lc.cofins += cofins; t.total.pis += pis; t.total.cofins += cofins;
      if (!prescrito) { t.totalNoPrazo.pis += pis; t.totalNoPrazo.cofins += cofins; }
    }

    // Índice de ICMS-ST de entradas de todos os arquivos usados (mesmo CNPJ/estabelecimento)
    var todasEntradas = [];
    usados.forEach(function (l) { (l.entradas || []).forEach(function (e) { todasEntradas.push(e); }); });
    var idxSt = indiceSt(todasEntradas);
    var stSemEntrada = { receita: 0, itens: 0 };

    // Compatibilidade com v0.1 (tela e PDF do Tema 69)
    var detalhes = [], competencias = {}, tot = { excessoPis: 0, creditoPis: 0, excessoCofins: 0, creditoCofins: 0, itens: 0, itensComCredito: 0 };
    var totPrazo = { creditoPis: 0, creditoCofins: 0 };
    var regimes = {};

    usados.forEach(function (l) {
      var comp = l.meta.competencia;
      var di = l.meta.dtIni;
      var prescrito = di ? new Date(di.ano, di.mes - 1, 1) < limite : false;
      var naoCumulativo = l.meta.regimeCodigo === '1' || l.meta.regimeCodigo === '3';
      regimes[l.meta.regime || '—'] = 1;
      var cKey = l.meta.cnpj + '|' + comp;
      var linhaComp = competencias[cKey] = {
        cnpj: l.meta.cnpj, nome: l.meta.nome, competencia: comp, regime: l.meta.regime || '—',
        arquivo: l.arquivo, retificadora: l.meta.retificadora, possivelmentePrescrito: prescrito,
        itens: 0, itensComCredito: 0, excessoPis: 0, creditoPis: 0, excessoCofins: 0, creditoCofins: 0
      };

      l.itens.forEach(function (it) {
        var r = calcularItem(it);
        var mono = calcularMonofasico(it, extras);
        var st = calcularIcmsSt(it, idxSt);

        // Prioridade: a restituição integral do monofásico absorve as exclusões de base no mesmo item.
        if (mono && (mono.pis || mono.cofins)) {
          ['Pis', 'Cofins'].forEach(function (s) {
            if (r['credito' + s]) { r['credito' + s] = 0; r['excesso' + s] = 0; r['status' + s] = 'Coberto pela tese dos monofásicos'; }
          });
          if (st && (st.pis || st.cofins)) { st.pis = 0; st.cofins = 0; st.status = 'Coberto pela tese dos monofásicos'; }
        }

        var d = Object.assign({ competencia: comp, cnpjMatriz: l.meta.cnpj, arquivo: l.arquivo }, it, r);
        detalhes.push(d);
        linhaComp.itens++; tot.itens++;
        if (r.creditoPis || r.creditoCofins) { linhaComp.itensComCredito++; tot.itensComCredito++; }
        ['excessoPis', 'creditoPis', 'excessoCofins', 'creditoCofins'].forEach(function (c) { linhaComp[c] += r[c]; tot[c] += r[c]; });
        if (!prescrito) { totPrazo.creditoPis += r.creditoPis; totPrazo.creditoCofins += r.creditoCofins; }

        lancar('tema69', l, comp, prescrito, Object.assign({}, it, { baseCorreta: r.baseCorreta, excessoPis: r.excessoPis, excessoCofins: r.excessoCofins, status: r.statusPis }), r.creditoPis, r.creditoCofins);
        if (mono) lancar('monofasico', l, comp, prescrito, Object.assign({}, it, { grupo: mono.grupo, base: mono.base, status: mono.status }), mono.pis, mono.cofins);
        if (st) {
          if (st.semEntrada) { stSemEntrada.receita += it.vlItem - it.vlDesc; stSemEntrada.itens++; }
          lancar('icmsSt', l, comp, prescrito, Object.assign({}, it, { stAtribuido: st.stAtribuido, excessoPis: st.excessoPis, excessoCofins: st.excessoCofins, status: st.status }), st.pis, st.cofins);
        }
      });

      (l.consolidados || []).forEach(function (it) {
        var mono = calcularMonofasico(it, extras);
        if (mono) lancar('monofasico', l, comp, prescrito, Object.assign({}, it, { grupo: mono.grupo, base: mono.base, status: mono.status + ' (consolidado C180/C181/C185)' }), mono.pis, mono.cofins);
      });

      if (naoCumulativo) {
        (l.entradas || []).forEach(function (e) {
          var ins = calcularInsumo(e, comp);
          if (ins) lancar('insumos', l, comp, prescrito, Object.assign({}, e, { base: ins.base, status: ins.status }), ins.pis, ins.cofins);
          var rk = calcularRisco14592(e, comp);
          if (rk) lancar('lei14592', l, comp, prescrito, Object.assign({}, e, { excessoPis: rk.excessoPis, excessoCofins: rk.excessoCofins, status: rk.status }), rk.pis, rk.cofins);
        });
      }
    });

    var ultimoPorCnpj = {};
    usados.forEach(function (l) { if (!ultimoPorCnpj[l.meta.cnpj] || l.meta.competencia > ultimoPorCnpj[l.meta.cnpj].meta.competencia) ultimoPorCnpj[l.meta.cnpj] = l; });
    Object.keys(ultimoPorCnpj).forEach(function (cnpj) {
      var l = ultimoPorCnpj[cnpj];
      if (!(l.meta.regimeCodigo === '1' || l.meta.regimeCodigo === '3')) return;
      var sp = l.saldoCredito.pis, sc = l.saldoCredito.cofins;
      if (!l.saldoCredito.registros) return;
      lancar('saldoCredor', l, l.meta.competencia, false, { status: (sp || sc) ? 'Saldo informado nos registros M100/M500 — conferir origem' : 'Sem saldo credor informado' }, sp, sc);
    });

    if (stSemEntrada.itens > 0) {
      T.icmsSt.avisos.push(stSemEntrada.itens + ' item(ns) vendidos com ICMS-ST (CST x60) sem entrada correspondente nos arquivos (receita de ' + formatarReais(stSemEntrada.receita) +
        '). Para quantificar, carregue os meses de compra ou a EFD ICMS/IPI.');
    }
    if (T.monofasico.aplicavel) T.monofasico.avisos.push('Classificação por NCM a partir de tabela inicial: confira NCM a NCM e a condição de revendedor antes do pedido.');
    if (T.insumos.aplicavel) T.insumos.avisos.push('Valores potenciais, não somados ao recuperável: cada item depende de análise de essencialidade ou relevância e de o fornecedor ser pessoa jurídica.');
    if (T.lei14592.aplicavel) T.lei14592.avisos.push('Passivo potencial: se confirmado, deve ser regularizado e abatido antes de pedir restituição.');

    var leitura = explicarLeitura(usados, T);
    var teses = CATALOGO.filter(function (c) { return c.calculada; }).map(function (c) {
      var t = T[c.id];
      t.competencias = Object.keys(t.competencias).sort().map(function (k) { return t.competencias[k]; });
      return t;
    });
    var recuperavel = { pis: 0, cofins: 0 }, recuperavelNoPrazo = { pis: 0, cofins: 0 }, potencial = { pis: 0, cofins: 0 }, risco = { pis: 0, cofins: 0 };
    teses.forEach(function (t) {
      if (t.natureza === 'credito') {
        recuperavel.pis += t.total.pis; recuperavel.cofins += t.total.cofins;
        recuperavelNoPrazo.pis += t.totalNoPrazo.pis; recuperavelNoPrazo.cofins += t.totalNoPrazo.cofins;
      } else if (t.natureza === 'potencial') { potencial.pis += t.totalNoPrazo.pis; potencial.cofins += t.totalNoPrazo.cofins; }
      else if (t.natureza === 'risco') { risco.pis += t.total.pis; risco.cofins += t.total.cofins; }
    });

    return {
      versaoMotor: VERSAO_MOTOR,
      tese: 'Exclusão do ICMS da base de cálculo do PIS/COFINS (STF, Tema 69 — RE 574.706)',
      geradoEm: hoje.toISOString(),
      regimes: Object.keys(regimes),
      // Tema 69 (formato v0.1)
      competencias: Object.keys(competencias).sort().map(function (k) { return competencias[k]; }),
      total: tot, totalNoPrazo: totPrazo, detalhes: detalhes,
      // Todas as teses
      teses: teses,
      resumo: { recuperavel: recuperavel, recuperavelNoPrazo: recuperavelNoPrazo, potencial: potencial, risco: risco },
      catalogo: CATALOGO,
      leitura: leitura,
      avisos: avisos
    };
  }

  function formatarReais(c) {
    var neg = c < 0; c = Math.abs(Math.round(c));
    var s = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var r = (c % 100).toString(); if (r.length < 2) r = '0' + r;
    return (neg ? '-' : '') + 'R$ ' + s + ',' + r;
  }

  var api = {
    VERSAO_MOTOR: VERSAO_MOTOR,
    lerEfdContribuicoes: lerEfdContribuicoes,
    calcularItem: calcularItem,
    calcularMonofasico: calcularMonofasico,
    calcularIcmsSt: calcularIcmsSt,
    classificarMonofasico: classificarMonofasico,
    apurar: apurar,
    CATALOGO: CATALOGO, MONOFASICOS: MONOFASICOS,
    centavos: centavos, aliquota: aliquota, quantidade: quantidade, formatarReais: formatarReais
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MotorCreditos = api;
})(typeof window !== 'undefined' ? window : this);
