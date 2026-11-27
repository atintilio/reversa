'use strict';

// Composição do potencial em centavos. O módulo não remove teses por cor:
// segurança jurídica é uma decisão humana, não um filtro silencioso de valor.
function centavos(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function avaliarTesesAplicaveis(diagnosticar, cliente) {
  if (typeof diagnosticar !== 'function') throw new TypeError('diagnosticar deve ser uma função');
  return diagnosticar(cliente).map((grupo) => ({
    ...grupo,
    teses: (grupo.teses || []).map((tese) => ({ ...tese, aplicavel: true }))
  }));
}

function comporPotencial(grupos, { motor = [] } = {}) {
  const linhas = [];
  const refs = new Map();
  const alertas = [];
  (grupos || []).forEach((grupo) => (grupo.teses || []).forEach((tese) => {
    const valor = centavos(tese.valorIdentificado != null ? tese.valorIdentificado : tese.valor);
    const id = String(tese.id || `${grupo.id}:${linhas.length}`);
    const referencia = String(tese.referencia || tese.sourceRef || id);
    if (refs.has(referencia)) {
      alertas.push({ tipo: 'POSSIVEL_SOBREPOSICAO', referencia, linhas: [refs.get(referencia), id] });
    } else refs.set(referencia, id);
    linhas.push({ id, grupo: grupo.id, nome: tese.nome || id, valorCentavos: valor, seguranca: tese.seguranca || null, origem: tese.origem || null, referencia, aplicavel: tese.aplicavel !== false });
  }));
  (motor || []).forEach((item, i) => {
    const valor = centavos(item.valorIdentificado != null ? item.valorIdentificado : (item.noPrazo != null ? item.noPrazo : item.total));
    if (!valor) return;
    const id = String(item.id || `motor:${i}`);
    const referencia = String(item.referencia || item.sourceRef || id);
    if (refs.has(referencia)) alertas.push({ tipo: 'POSSIVEL_SOBREPOSICAO', referencia, linhas: [refs.get(referencia), id] });
    else refs.set(referencia, id);
    linhas.push({ id, grupo: item.grupo || 'motor', nome: item.nome || id, valorCentavos: valor, seguranca: item.seguranca || null, origem: item.origem || null, referencia, aplicavel: item.aplicavel !== false });
  });
  const totalCentavos = linhas.filter((x) => x.aplicavel).reduce((s, x) => s + x.valorCentavos, 0);
  return { linhas, totalCentavos, total: totalCentavos / 100, alertas };
}

module.exports = { centavos, avaliarTesesAplicaveis, comporPotencial };

