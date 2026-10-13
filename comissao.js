// Comissão do parceiro na fase de contrato. Compartilhado entre navegador (window.Comissao) e servidor (require).
// Honorários = base × % de honorários; tributos da Argus = 16,85% sobre os honorários;
// comissão = % do contrato do parceiro sobre os honorários líquidos de tributos.
(function (root) {
  var TRIBUTO = 0.1685;
  function n(v) { var x = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(x) ? x : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function calcular(base, honorariosPct, comissaoPct) {
    var b = Math.max(0, n(base)), h = Math.max(0, Math.min(100, n(honorariosPct))) / 100, c = Math.max(0, Math.min(100, n(comissaoPct))) / 100;
    var honorarios = b * h, tributos = honorarios * TRIBUTO, liquido = honorarios - tributos, comissao = liquido * c;
    return { base: r2(b), honorariosPct: r2(h * 100), comissaoPct: r2(c * 100), honorarios: r2(honorarios), tributos: r2(tributos), liquido: r2(liquido), comissao: r2(comissao), argus: r2(liquido - comissao) };
  }
  function simular(base, comissaoPct, faixas) {
    return (faixas || [10, 15, 20, 25, 30]).map(function (h) { return calcular(base, h, comissaoPct); });
  }
  var api = { TRIBUTO: TRIBUTO, calcular: calcular, simular: simular };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Comissao = api;
})(typeof window !== 'undefined' ? window : this);
