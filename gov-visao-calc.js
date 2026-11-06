// Reversa Gov · Visão geral: agregações puras (sem DOM). Usadas por gov-visao.js e testadas em tests/gov-visao-calc.test.js.
// Entrada: o objeto D de GovDados (casos, municipios, estoque). Valores nulos nunca viram zero "inventado": entram como 0 só nas somas.
(function (raiz) {
  'use strict';
  var num = function (v) { var n = Number(v); return Number.isFinite(n) ? n : 0; };
  // código IBGE da UF (2 primeiros dígitos do código do município) -> sigla; usado só quando o caso/município não traz a UF
  var UF_IBGE = { '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF' };
  var ESTAGIOS = [['identificado', 'Identificado'], ['validado', 'Validado'], ['compensacao', 'Em compensação'], ['recuperado', 'Recuperado']];

  function ufDoCaso(c, mapaMun) {
    var u = c && c.uf ? String(c.uf).toUpperCase() : '';
    if (!u && c && c.ibge && mapaMun[String(c.ibge)]) u = String(mapaMun[String(c.ibge)].uf || '').toUpperCase();
    if (!u && c && c.ibge) u = UF_IBGE[String(c.ibge).slice(0, 2)] || '';
    return u || null;
  }
  function mapaMunicipios(D) { var m = {}; (D && D.municipios || []).forEach(function (x) { m[String(x.ibge)] = x; }); return m; }

  // { UF: { n, municipios, i, p, c, v } } — n conta todos os casos da UF; valores nulos somam 0
  function porUF(D) {
    var mm = mapaMunicipios(D), A = {}, ibges = {};
    ((D && D.casos) || []).forEach(function (c) {
      var u = ufDoCaso(c, mm); if (!u) return;
      var o = A[u] || (A[u] = { n: 0, municipios: 0, i: 0, p: 0, c: 0, v: 0 }); ibges[u] = ibges[u] || {};
      o.n++; ibges[u][String(c.ibge || c.municipio || c.id)] = 1;
      var v = num(c.valor); o.v += v;
      if (c.tributo === 'irrf') o.i += v; else if (c.tributo === 'prev') o.p += v; else o.c += v;
    });
    Object.keys(A).forEach(function (u) { A[u].municipios = Object.keys(ibges[u]).length; });
    return A;
  }

  // fatias "por estado": maiores UFs por valor; o excedente de max fatias vira "Demais UFs"
  function fatiasUF(A, max) {
    var l = Object.keys(A).map(function (u) { return { nome: u, valor: A[u].v }; }).filter(function (x) { return x.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    max = max || 8;
    if (l.length <= max) return l;
    var resto = l.slice(max - 1).reduce(function (s, x) { return s + x.valor; }, 0);
    return l.slice(0, max - 1).concat([{ nome: 'Demais UFs', valor: resto }]);
  }

  // estágios do crédito: soma de IRRF e Previdenciário (D.estoque.irrf / D.estoque.prev)
  function porEstagio(D) {
    var e = (D && D.estoque) || {}, i = e.irrf || {}, p = e.prev || {};
    return ESTAGIOS.map(function (s) { return { id: s[0], nome: s[1], valor: num(i[s[0]]) + num(p[s[0]]), irrf: num(i[s[0]]), prev: num(p[s[0]]) }; });
  }
  function estagiosDe(e) { e = e || {}; return ESTAGIOS.map(function (s) { return { id: s[0], nome: s[1], valor: num(e[s[0]]) }; }); }

  function data10(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? '' : s));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
  }
  // série acumulada por data de criação: [{ d:'YYYY-MM-DD', i, p, n }]; casos sem data válida ficam de fora (semData informa quantos)
  function serieTemporal(casos) {
    var com = [], sem = 0;
    (casos || []).forEach(function (c) { var d = data10(c.criado); if (d) com.push({ d: d, t: c.tributo, v: num(c.valor) }); else sem++; });
    var datas = Object.keys(com.reduce(function (a, x) { a[x.d] = 1; return a; }, {})).sort();
    var s = datas.map(function (d) {
      var i = 0, p = 0, n = 0;
      com.forEach(function (x) { if (x.d <= d) { n++; if (x.t === 'irrf') i += x.v; else if (x.t === 'prev') p += x.v; } });
      return { d: d, i: i, p: p, n: n };
    });
    s.semData = sem;
    return s;
  }
  // maiores municípios por potencial total (IRRF + Prev.), a partir dos casos
  function topMunicipios(D, max) {
    var mm = mapaMunicipios(D), m = {};
    ((D && D.casos) || []).forEach(function (c) {
      var k = String(c.ibge || c.municipio || ''); if (!k) return;
      var o = m[k] || (m[k] = { ibge: c.ibge, nome: c.municipio || (mm[k] && mm[k].nome) || null, uf: ufDoCaso(c, mm), i: 0, p: 0 });
      var v = num(c.valor); if (c.tributo === 'irrf') o.i += v; else if (c.tributo === 'prev') o.p += v;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).filter(function (o) { return o.i + o.p > 0; }).sort(function (a, b) { return b.i + b.p - a.i - a.p; }).slice(0, max || 8);
  }
  // últimos casos criados (precisam de data válida)
  function atividade(casos, max) {
    return (casos || []).filter(function (c) { return data10(c.criado); }).slice().sort(function (a, b) {
      var x = data10(a.criado), y = data10(b.criado); return x < y ? 1 : x > y ? -1 : num(b.valor) - num(a.valor);
    }).slice(0, max || 6);
  }
  // maior valor "redondo" (1, 2, 2,5, 5, 10 × 10^n) que comporta v
  function maxBonito(v) {
    if (!(v > 0)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function pct(a, b) { return b > 0 ? a / b : null; }

  var API = { UF_IBGE: UF_IBGE, ESTAGIOS: ESTAGIOS, ufDoCaso: ufDoCaso, porUF: porUF, fatiasUF: fatiasUF, porEstagio: porEstagio, estagiosDe: estagiosDe, data10: data10, serieTemporal: serieTemporal, topMunicipios: topMunicipios, atividade: atividade, maxBonito: maxBonito, pct: pct };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.GovVisaoCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
