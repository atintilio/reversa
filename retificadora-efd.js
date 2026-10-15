/*
 * Reversa Tax — gera a EFD-Contribuições retificadora a partir do arquivo original e dos ajustes do motor.
 * Roda no navegador (window.RetificadoraEfd) e no Node (module.exports). O SPED não sai da máquina.
 *
 * Teses suportadas nesta versão (redução da base no próprio item, CST mantido):
 *   - Tema 69 (exclusão do ICMS da base) e Tema 1.125 (ICMS-ST do substituído).
 * Monofásicos exigem trocar o CST para 04 e informar a receita no M400/M410 com a natureza da receita
 * (tabela da Receita por NCM): não gerados automaticamente nesta versão.
 *
 * O que o gerador altera:
 *   0000  TIPO_ESCRIT = 1 e NUM_REC_ANTERIOR = recibo da escrituração original.
 *   C170  VL_BC_PIS, VL_PIS, VL_BC_COFINS, VL_COFINS do item (base menos o excesso apurado).
 *   C100  VL_PIS e VL_COFINS do documento (soma das reduções dos itens).
 *   M210/M610  base, base ajustada, contribuição apurada e do período do COD_CONT correspondente.
 *   M200/M600  totais e saldos a recolher (campos 02, 05, 08, 09, 12 e 13).
 *   M205/M605  valor por código de receita.
 *   Bloco 9 e totalizadores x990 recalculados.
 * Situações que exigem decisão humana viram erro (o arquivo não é entregue como pronto).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';

  // Índices no split('|') da linha: [0] = '', [1] = REG, [2] = campo 02, ... (campo n = índice n).
  var C170 = { CST_PIS: 25, VL_BC_PIS: 26, ALIQ_PIS: 27, VL_PIS: 30, CST_COFINS: 31, VL_BC_COFINS: 32, ALIQ_COFINS: 33, VL_COFINS: 36 };
  var C100 = { VL_PIS: 26, VL_COFINS: 27 };
  // M210/M610: leiaute a partir de 2019 (16 campos) e anterior (13 campos).
  var M210_NOVO = { COD_CONT: 2, VL_REC_BRT: 3, VL_BC_CONT: 4, VL_BC_CONT_AJUS: 7, ALIQ: 8, VL_CONT_APUR: 11, VL_AJUS_ACRES: 12, VL_AJUS_REDUC: 13, VL_CONT_DIFER: 14, VL_CONT_DIFER_ANT: 15, VL_CONT_PER: 16 };
  var M210_ANTIGO = { COD_CONT: 2, VL_REC_BRT: 3, VL_BC_CONT: 4, ALIQ: 5, VL_CONT_APUR: 8, VL_AJUS_ACRES: 9, VL_AJUS_REDUC: 10, VL_CONT_DIFER: 11, VL_CONT_DIFER_ANT: 12, VL_CONT_PER: 13 };
  // M200/M600
  var M200 = { NC_PER: 2, CRED_DESC: 3, CRED_DESC_ANT: 4, NC_DEV: 5, RET_NC: 6, OUT_DED_NC: 7, NC_REC: 8, CUM_PER: 9, RET_CUM: 10, OUT_DED_CUM: 11, CUM_REC: 12, TOT_REC: 13 };
  var M205 = { NUM_CAMPO: 2, COD_REC: 3, VL_DEBITO: 4 };
  var NAO_CUMULATIVOS = { '01': 1, '02': 1, '03': 1, '04': 1, '32': 1, '71': 1 };

  function cent(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return 0;
    var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var p = s.split(','), i = parseInt(p[0] || '0', 10), d = (p[1] || '') + '000';
    var c = i * 100 + parseInt(d.slice(0, 2), 10) + (parseInt(d.charAt(2), 10) >= 5 ? 1 : 0);
    return neg ? -c : c;
  }
  function fmt(c) { var neg = c < 0; c = Math.abs(c); var r = String(c % 100); return (neg ? '-' : '') + Math.floor(c / 100) + ',' + (r.length < 2 ? '0' + r : r); }
  function aliq(s) { return Number(String(s || '0').replace(',', '.')) || 0; }

  // COD_CONT do M210/M610 conforme CST e alíquota do item (alíquota básica ou diferenciada; não cumulativo ou cumulativo).
  function codCont(cst, aliquota, tributo) {
    var cum = tributo === 'pis' ? Math.abs(aliquota - 0.65) < 1e-6 : Math.abs(aliquota - 3) < 1e-6;
    var basica = tributo === 'pis' ? (Math.abs(aliquota - 1.65) < 1e-6 || cum) : (Math.abs(aliquota - 7.6) < 1e-6 || cum);
    if (cst === '01' && basica) return cum ? '51' : '01';
    if (cst === '02') return cum ? '52' : '02';
    return null;
  }

  /**
   * @param {string} texto   EFD-Contribuições original
   * @param {Object} ajustes { [linha]: { excessoPis, excessoCofins, pis, cofins, tese } } em centavos
   * @param {{recibo?: string}} opts
   */
  function gerar(texto, ajustes, opts) {
    opts = opts || {};
    var quebra = /\r\n/.test(texto) ? '\r\n' : '\n';
    var linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/);
    while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
    var erros = [], avisos = [], alterados = 0;
    var delta = { pis: {}, cofins: {} }; // por COD_CONT: { base, cont }
    var docAtual = null, docs = [];
    var f, reg, i, rec = String(opts.recibo || '').trim();

    for (i = 0; i < linhas.length; i++) {
      f = linhas[i].split('|'); reg = f[1];
      if (reg === '0000') {
        if (!rec) erros.push('Informe o número do recibo da escrituração original (campo NUM_REC_ANTERIOR do 0000).');
        else if (!/^[0-9A-Za-z.\-]{10,60}$/.test(rec)) erros.push('Recibo da escrituração original em formato inválido.');
        f[3] = '1'; f[5] = rec; linhas[i] = f.join('|');
      } else if (reg === 'C100') {
        docAtual = { i: i, pis: 0, cofins: 0 }; docs.push(docAtual);
      } else if (reg === 'C170') {
        var a = ajustes[i + 1];
        if (!a || (!a.pis && !a.cofins)) continue;
        if (!docAtual) { erros.push('Linha ' + (i + 1) + ': C170 sem C100.'); continue; }
        var r = { pis: { cst: f[C170.CST_PIS], bc: C170.VL_BC_PIS, al: C170.ALIQ_PIS, vl: C170.VL_PIS, exc: a.excessoPis || 0, cred: a.pis || 0 },
                  cofins: { cst: f[C170.CST_COFINS], bc: C170.VL_BC_COFINS, al: C170.ALIQ_COFINS, vl: C170.VL_COFINS, exc: a.excessoCofins || 0, cred: a.cofins || 0 } };
        var ok = true;
        ['pis', 'cofins'].forEach(function (t) {
          var x = r[t]; if (!x.cred) return;
          var bc = cent(f[x.bc]), vl = cent(f[x.vl]), al = aliq(f[x.al]);
          var cc = codCont(x.cst, al, t);
          if (!cc) { ok = false; erros.push('Linha ' + (i + 1) + ': CST ' + x.cst + ' com alíquota ' + f[x.al] + ' de ' + t.toUpperCase() + ' sem regra de retificação automática.'); return; }
          if (x.exc > bc || x.cred > vl) { ok = false; erros.push('Linha ' + (i + 1) + ': redução maior que a base ou o valor do item (' + t.toUpperCase() + ').'); return; }
          var nbc = bc - x.exc, nvl = vl - x.cred;
          if (Math.abs(Math.round(nbc * al / 100) - nvl) > 1) avisos.push('Linha ' + (i + 1) + ': ' + t.toUpperCase() + ' do item (' + fmt(nvl) + ') difere da base × alíquota (' + fmt(Math.round(nbc * al / 100)) + ').');
          f[x.bc] = fmt(nbc); f[x.vl] = fmt(nvl);
          var d = delta[t][cc] = delta[t][cc] || { base: 0, cont: 0 };
          d.base += x.exc; d.cont += x.cred;
          docAtual[t] += x.cred;
        });
        if (ok) { linhas[i] = f.join('|'); alterados++; }
      }
    }
    // C100: totais do documento
    docs.forEach(function (d) {
      if (!d.pis && !d.cofins) return;
      var g = linhas[d.i].split('|');
      if (d.pis && g[C100.VL_PIS] !== '') g[C100.VL_PIS] = fmt(Math.max(0, cent(g[C100.VL_PIS]) - d.pis));
      if (d.cofins && g[C100.VL_COFINS] !== '') g[C100.VL_COFINS] = fmt(Math.max(0, cent(g[C100.VL_COFINS]) - d.cofins));
      linhas[d.i] = g.join('|');
    });

    // Bloco M: PIS (M200/M205/M210) e COFINS (M600/M605/M610)
    var apuracao = {};
    [['pis', 'M200', 'M205', 'M210'], ['cofins', 'M600', 'M605', 'M610']].forEach(function (cfg) {
      var t = cfg[0], dt = delta[t], usados = {}, dNc = 0, dCum = 0;
      if (!Object.keys(dt).length) return;
      for (var j = 0; j < linhas.length; j++) {
        var g = linhas[j].split('|');
        if (g[1] !== cfg[3]) continue;
        var L = g.length >= 18 ? M210_NOVO : g.length >= 15 ? M210_ANTIGO : null;
        if (!L) { erros.push('Linha ' + (j + 1) + ': ' + cfg[3] + ' com leiaute não reconhecido.'); continue; }
        var cc = g[L.COD_CONT], d = dt[cc];
        if (!d || usados[cc]) continue;
        usados[cc] = true;
        var bc = cent(g[L.VL_BC_CONT]) - d.base, apur = cent(g[L.VL_CONT_APUR]) - d.cont, per = cent(g[L.VL_CONT_PER]) - d.cont;
        if (bc < 0 || apur < 0 || per < 0) { erros.push('Linha ' + (j + 1) + ': ' + cfg[3] + ' ficaria negativo para o COD_CONT ' + cc + '. Revise os ajustes.'); continue; }
        g[L.VL_BC_CONT] = fmt(bc);
        if (L === M210_NOVO) { var ba = cent(g[L.VL_BC_CONT_AJUS]) - d.base; g[L.VL_BC_CONT_AJUS] = fmt(ba); bc = ba; }
        g[L.VL_CONT_APUR] = fmt(apur); g[L.VL_CONT_PER] = fmt(per);
        if (Math.abs(Math.round(bc * aliq(g[L.ALIQ]) / 100) - apur) > 2) avisos.push('Linha ' + (j + 1) + ': ' + cfg[3] + ' contribuição apurada difere da base × alíquota; confira arredondamentos do original.');
        linhas[j] = g.join('|');
        if (NAO_CUMULATIVOS[cc]) dNc += d.cont; else dCum += d.cont;
      }
      Object.keys(dt).forEach(function (cc) { if (!usados[cc]) erros.push(cfg[3] + ' do COD_CONT ' + cc + ' não encontrado: a redução de ' + t.toUpperCase() + ' não tem onde ser lançada.'); });
      // M200/M600
      var iTot = -1;
      for (j = 0; j < linhas.length; j++) if (linhas[j].split('|')[1] === cfg[1]) { iTot = j; break; }
      if (iTot < 0) { erros.push('Registro ' + cfg[1] + ' não encontrado.'); return; }
      var m = linhas[iTot].split('|'), v = function (k) { return cent(m[M200[k]]); };
      var orig = { NC_REC: v('NC_REC'), CUM_REC: v('CUM_REC'), TOT_REC: v('TOT_REC') };
      if (v('NC_DEV') !== v('NC_PER') - v('CRED_DESC') - v('CRED_DESC_ANT') || v('TOT_REC') !== v('NC_REC') + v('CUM_REC'))
        avisos.push(cfg[1] + ' original não fecha as somas esperadas; confira o arquivo de origem.');
      var ncPer = v('NC_PER') - dNc, ncDev = ncPer - v('CRED_DESC') - v('CRED_DESC_ANT');
      if (ncDev < 0) { erros.push(cfg[1] + ': créditos descontados ficam maiores que a contribuição não cumulativa (' + fmt(-ncDev) + '). Revise o aproveitamento de créditos (M100/M500 e 1100/1500) antes de gerar.'); return; }
      var ncRec = ncDev - v('RET_NC') - v('OUT_DED_NC');
      var cumPer = v('CUM_PER') - dCum, cumRec = cumPer - v('RET_CUM') - v('OUT_DED_CUM');
      if (ncRec < 0 || cumRec < 0) { erros.push(cfg[1] + ': retenções e deduções ficam maiores que a contribuição. Revise o bloco 1 (retenções e deduções) antes de gerar.'); return; }
      m[M200.NC_PER] = fmt(ncPer); m[M200.NC_DEV] = fmt(ncDev); m[M200.NC_REC] = fmt(ncRec);
      m[M200.CUM_PER] = fmt(cumPer); m[M200.CUM_REC] = fmt(cumRec); m[M200.TOT_REC] = fmt(ncRec + cumRec);
      linhas[iTot] = m.join('|');
      // M205/M605 por campo (08 não cumulativo, 12 cumulativo)
      [['08', orig.NC_REC, ncRec], ['12', orig.CUM_REC, cumRec]].forEach(function (c) {
        var dif = c[1] - c[2]; if (!dif) return;
        var idx = [];
        for (var k = 0; k < linhas.length; k++) { var h = linhas[k].split('|'); if (h[1] === cfg[2] && h[M205.NUM_CAMPO] === c[0]) idx.push(k); }
        if (!idx.length) { erros.push(cfg[2] + ' do campo ' + c[0] + ' não encontrado.'); return; }
        if (idx.length > 1) avisos.push(cfg[2] + ': mais de um código de receita no campo ' + c[0] + '; a redução foi lançada no de maior valor. Confira.');
        idx.sort(function (x, y) { return cent(linhas[y].split('|')[M205.VL_DEBITO]) - cent(linhas[x].split('|')[M205.VL_DEBITO]); });
        var h = linhas[idx[0]].split('|'), nv = cent(h[M205.VL_DEBITO]) - dif;
        if (nv < 0) { erros.push(cfg[2] + ': valor por código de receita ficaria negativo.'); return; }
        h[M205.VL_DEBITO] = fmt(nv); linhas[idx[0]] = h.join('|');
        if (nv === 0) avisos.push(cfg[2] + ' do campo ' + c[0] + ' ficou zerado: confira se o PVA exige removê-lo.');
      });
      apuracao[t] = { aRecolherOriginal: orig.TOT_REC, aRecolherRetificado: ncRec + cumRec, diferenca: orig.TOT_REC - (ncRec + cumRec),
        codigosReceita: linhas.filter(function (l) { return l.split('|')[1] === cfg[2]; }).map(function (l) { var h = l.split('|'); return { campo: h[M205.NUM_CAMPO], codigo: h[M205.COD_REC], valor: cent(h[M205.VL_DEBITO]) }; }) };
    });

    var final = recontar(linhas);
    return { versao: VERSAO, texto: final.join(quebra) + quebra, itensAlterados: alterados, apuracao: apuracao, erros: erros, avisos: avisos,
      reducao: { pis: soma(delta.pis), cofins: soma(delta.cofins) } };
  }
  function soma(d) { return Object.keys(d).reduce(function (a, k) { return a + d[k].cont; }, 0); }

  // Recalcula os totalizadores x990 e o bloco 9 (9001, 9900, 9990, 9999).
  function recontar(linhas) {
    var corpo = linhas.filter(function (l) { var r = l.split('|')[1] || ''; return r && r.charAt(0) !== '9'; });
    var porBloco = {};
    corpo.forEach(function (l) { var r = l.split('|')[1]; porBloco[r.charAt(0)] = (porBloco[r.charAt(0)] || 0) + 1; });
    corpo = corpo.map(function (l) { var g = l.split('|'); if (/^[0A-Z1]990$/.test(g[1]) && g[1] !== '9990') { g[2] = String(porBloco[g[1].charAt(0)]); return g.join('|'); } return l; });
    var ordem = [], cont = {};
    corpo.forEach(function (l) { var r = l.split('|')[1]; if (!cont[r]) { cont[r] = 0; ordem.push(r); } cont[r]++; });
    var regs9 = ordem.length + 4; // + 9001, 9900, 9990, 9999
    var b9 = ['|9001|0|'];
    ordem.forEach(function (r) { b9.push('|9900|' + r + '|' + cont[r] + '|'); });
    ['9001', '9900', '9990', '9999'].forEach(function (r) { b9.push('|9900|' + r + '|' + (r === '9900' ? regs9 : 1) + '|'); });
    b9.push('|9990|' + (b9.length + 2) + '|');
    var total = corpo.length + b9.length + 1;
    b9.push('|9999|' + total + '|');
    return corpo.concat(b9);
  }

  var api = { VERSAO: VERSAO, gerar: gerar, recontar: recontar, cent: cent, fmt: fmt, codCont: codCont };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RetificadoraEfd = api;
})(typeof self !== 'undefined' ? self : this);
