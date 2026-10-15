/*
 * Reversa Tax — pré-validador da EFD-Contribuições ("PVA simulado").
 * Confere estrutura, totalizadores e somas do bloco M antes do PVA oficial. Não substitui o PVA:
 * o programa da Receita tem regras e cruzamentos que só ele aplica.
 *   erros  = o PVA recusaria o arquivo (estrutura, contagens, somas obrigatórias, identificação);
 *   avisos = conferir (arredondamentos e consistências que o PVA trata como advertência ou que dependem do caso).
 * Roda no navegador (window.ValidadorEfd) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var ORDEM_BLOCOS = ['0', 'A', 'C', 'D', 'F', 'I', 'M', 'P', '1', '9'];
  var PAI = { C100: 'C010', C170: 'C100', C175: 'C100', C180: 'C010', C190: 'C010', A100: 'A010', A170: 'A100', D100: 'D010', D200: 'D010',
    M205: 'M200', M210: 'M200', M605: 'M600', M610: 'M600' };
  var VALOR = /^-?\d+(,\d+)?$/;

  function cent(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return 0;
    var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var p = s.split(','), d = (p[1] || '') + '000';
    var c = parseInt(p[0] || '0', 10) * 100 + parseInt(d.slice(0, 2), 10) + (parseInt(d.charAt(2), 10) >= 5 ? 1 : 0);
    return neg ? -c : c;
  }
  function fmt(c) { var r = String(Math.abs(c) % 100); return (c < 0 ? '-' : '') + Math.floor(Math.abs(c) / 100) + ',' + (r.length < 2 ? '0' + r : r); }
  function dataOk(s) {
    if (!/^\d{8}$/.test(s)) return false;
    var d = +s.slice(0, 2), m = +s.slice(2, 4), a = +s.slice(4);
    var x = new Date(a, m - 1, d); return x.getFullYear() === a && x.getMonth() === m - 1 && x.getDate() === d;
  }
  function cnpjOk(c) {
    if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
    var dv = function (n) { var p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], s = 0;
      for (var i = 0; i < n; i++) s += +c[i] * p[i]; var r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +c[12] && dv(13) === +c[13];
  }

  function validar(texto, nome) {
    var erros = [], avisos = [];
    var e = function (l, m) { erros.push((l ? 'Linha ' + l + ': ' : '') + m); };
    var w = function (l, m) { avisos.push((l ? 'Linha ' + l + ': ' : '') + m); };
    var linhas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/);
    while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
    if (!linhas.length) return { arquivo: nome, erros: ['Arquivo vazio.'], avisos: [], linhas: 0 };
    var cont = {}, porBloco = {}, blocoAtual = null, vistos = {}, ultimo = {};
    var decl9900 = {}, x990 = {}, q9990 = null, q9999 = null, meta = {};
    var m200 = {}, m205 = { M205: {}, M605: {} };

    linhas.forEach(function (l, i) {
      var n = i + 1;
      if (l.charAt(0) !== '|' || l.charAt(l.length - 1) !== '|') { e(n, 'a linha deve começar e terminar com "|".'); return; }
      var f = l.split('|'), reg = f[1];
      if (!/^[0-9A-Z]\d{3}$/.test(reg)) { e(n, 'registro inválido "' + reg + '".'); return; }
      if (n === 1 && reg !== '0000') e(n, 'o arquivo deve começar pelo registro 0000.');
      var bloco = reg.charAt(0);
      if (bloco !== blocoAtual) {
        if (vistos[bloco]) e(n, 'bloco ' + bloco + ' aparece fora de sequência.');
        if (blocoAtual !== null && ORDEM_BLOCOS.indexOf(bloco) < ORDEM_BLOCOS.indexOf(blocoAtual)) e(n, 'bloco ' + bloco + ' fora da ordem dos blocos.');
        vistos[bloco] = true; blocoAtual = bloco;
      }
      cont[reg] = (cont[reg] || 0) + 1; porBloco[bloco] = (porBloco[bloco] || 0) + 1;
      if (PAI[reg] && !ultimo[PAI[reg]]) e(n, reg + ' sem o registro pai ' + PAI[reg] + '.');
      ultimo[reg] = n;
      // valores numéricos com vírgula decimal (sem ponto de milhar)
      f.slice(2, -1).forEach(function (v, k) { if (/^-?[\d.]+,\d+$/.test(v) && v.indexOf('.') >= 0) e(n, 'campo ' + (k + 2) + ' com ponto no número (use só vírgula decimal).'); });

      if (reg === '0000') {
        meta.tipo = f[3]; meta.recibo = f[5]; meta.ini = f[6]; meta.fim = f[7]; meta.cnpj = f[9];
        if (['0', '1'].indexOf(f[3]) < 0) e(n, 'TIPO_ESCRIT deve ser 0 (original) ou 1 (retificadora).');
        if (f[3] === '1' && !f[5]) e(n, 'retificadora sem o número do recibo da escrituração anterior.');
        if (f[3] === '0' && f[5]) e(n, 'escrituração original não deve informar recibo anterior.');
        if (!dataOk(f[6]) || !dataOk(f[7])) e(n, 'datas inicial/final inválidas (DDMMAAAA).');
        else if (f[6].slice(2) !== f[7].slice(2)) e(n, 'o período deve estar dentro do mesmo mês.');
        if (!cnpjOk(f[9])) e(n, 'CNPJ do contribuinte inválido.');
      } else if (reg === '0140' && f[4] && !cnpjOk(f[4])) e(n, 'CNPJ do estabelecimento inválido.');
      else if (/^[0A-Z1]001$/.test(reg) && ['0', '1'].indexOf(f[2]) < 0) e(n, 'indicador de movimento do bloco deve ser 0 ou 1.');
      else if (/^[0A-Z1]990$/.test(reg) && reg !== '9990') x990[bloco] = { n: n, q: parseInt(f[2], 10) };
      else if (reg === '9900') decl9900[f[2]] = { n: n, q: parseInt(f[3], 10) };
      else if (reg === '9990') q9990 = { n: n, q: parseInt(f[2], 10) };
      else if (reg === '9999') q9999 = { n: n, q: parseInt(f[2], 10) };
      else if (reg === 'C170') {
        [[26, 27, 30, 'PIS'], [32, 33, 36, 'COFINS']].forEach(function (k) {
          if (f[k[0]] === '' || f[k[2]] === '') return;
          if (!VALOR.test(f[k[0]]) || !VALOR.test(f[k[2]])) { e(n, k[3] + ' do item com valor não numérico.'); return; }
          var esperado = Math.round(cent(f[k[0]]) * Number(String(f[k[1]] || '0').replace(',', '.')) / 100);
          if (Math.abs(esperado - cent(f[k[2]])) > 1) w(n, k[3] + ' do item ' + f[k[2]] + ' difere da base × alíquota (' + fmt(esperado) + ').');
        });
      } else if (reg === 'M200' || reg === 'M600') {
        var v = function (k) { return cent(f[k]); };
        m200[reg] = { n: n, nc: v(8), cum: v(12) };
        if (v(5) !== v(2) - v(3) - v(4)) e(n, reg + ' campo 05 deve ser 02 − 03 − 04.');
        if (v(8) !== v(5) - v(6) - v(7)) e(n, reg + ' campo 08 deve ser 05 − 06 − 07.');
        if (v(12) !== v(9) - v(10) - v(11)) e(n, reg + ' campo 12 deve ser 09 − 10 − 11.');
        if (v(13) !== v(8) + v(12)) e(n, reg + ' campo 13 deve ser 08 + 12.');
        [2, 5, 8, 9, 12, 13].forEach(function (k) { if (v(k) < 0) e(n, reg + ' campo ' + (k < 10 ? '0' : '') + k + ' negativo.'); });
      } else if (reg === 'M205' || reg === 'M605') {
        m205[reg][f[2]] = (m205[reg][f[2]] || 0) + cent(f[4]);
      } else if (reg === 'M210' || reg === 'M610') {
        var novo = f.length >= 18, bc = cent(f[novo ? 7 : 4]), al = Number(String(f[novo ? 8 : 5] || '0').replace(',', '.')), ap = cent(f[novo ? 11 : 8]);
        if (bc && Math.abs(Math.round(bc * al / 100) - ap) > 2) w(n, reg + ' contribuição apurada difere da base × alíquota.');
        var per = cent(f[novo ? 16 : 13]), conf = ap + cent(f[novo ? 12 : 9]) - cent(f[novo ? 13 : 10]) - cent(f[novo ? 14 : 11]) + cent(f[novo ? 15 : 12]);
        if (per !== conf) e(n, reg + ' contribuição do período deve ser apurada + acréscimos − reduções − diferida + diferida de períodos anteriores.');
      }
    });

    if (linhas[linhas.length - 1].split('|')[1] !== '9999') e(linhas.length, 'o arquivo deve terminar pelo registro 9999.');
    ORDEM_BLOCOS.forEach(function (b) {
      if (b === '9') return;
      if (!vistos[b]) { if (['0', 'M'].indexOf(b) >= 0) e(null, 'bloco ' + b + ' ausente.'); else w(null, 'bloco ' + b + ' ausente: confira se o leiaute do período exige a abertura.'); return; }
      if (!x990[b]) e(null, 'registro ' + b + '990 ausente.');
      else if (x990[b].q !== porBloco[b]) e(x990[b].n, b + '990 informa ' + x990[b].q + ' linhas; o bloco tem ' + porBloco[b] + '.');
    });
    Object.keys(cont).forEach(function (r) {
      if (!decl9900[r]) e(null, 'registro ' + r + ' sem totalização no 9900.');
      else if (decl9900[r].q !== cont[r]) e(decl9900[r].n, '9900 informa ' + decl9900[r].q + ' registro(s) ' + r + '; o arquivo tem ' + cont[r] + '.');
    });
    Object.keys(decl9900).forEach(function (r) { if (!cont[r]) e(decl9900[r].n, '9900 totaliza o registro ' + r + ', que não existe no arquivo.'); });
    if (!q9990) e(null, 'registro 9990 ausente.'); else if (q9990.q !== porBloco['9']) e(q9990.n, '9990 informa ' + q9990.q + ' linhas; o bloco 9 tem ' + porBloco['9'] + '.');
    if (!q9999) e(null, 'registro 9999 ausente.'); else if (q9999.q !== linhas.length) e(q9999.n, '9999 informa ' + q9999.q + ' linhas; o arquivo tem ' + linhas.length + '.');
    [['M200', 'M205'], ['M600', 'M605']].forEach(function (p) {
      var t = m200[p[0]]; if (!t) return;
      var s08 = m205[p[1]]['08'] || 0, s12 = m205[p[1]]['12'] || 0;
      if (t.nc > 0 && s08 !== t.nc) e(t.n, p[1] + ' do campo 08 soma ' + fmt(s08) + '; o ' + p[0] + ' informa ' + fmt(t.nc) + '.');
      if (t.cum > 0 && s12 !== t.cum) e(t.n, p[1] + ' do campo 12 soma ' + fmt(s12) + '; o ' + p[0] + ' informa ' + fmt(t.cum) + '.');
    });
    return { versao: VERSAO, arquivo: nome || '', linhas: linhas.length, retificadora: meta.tipo === '1', recibo: meta.recibo || '',
      cnpj: meta.cnpj || '', competencia: meta.ini && meta.ini.length === 8 ? meta.ini.slice(4) + '-' + meta.ini.slice(2, 4) : '', erros: erros, avisos: avisos };
  }

  var api = { VERSAO: VERSAO, validar: validar, cnpjOk: cnpjOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ValidadorEfd = api;
})(typeof self !== 'undefined' ? self : this);
