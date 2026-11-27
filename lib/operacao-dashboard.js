'use strict';

// Projeção operacional: usa o tributo mensal informado, nunca um valor arbitrário.
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }
function projetarCompensacao({ credito = 0, tributoMensal = 0, inicio } = {}) {
  const estoque = num(credito); const mensal = num(tributoMensal);
  const meses = mensal ? Math.ceil(estoque / mensal) : null;
  return { credito: estoque, tributoMensal: mensal, meses, fimEstimado: meses && inicio ? new Date(new Date(`${inicio}-01T00:00:00Z`).setUTCMonth(new Date(`${inicio}-01T00:00:00Z`).getUTCMonth() + meses - 1)).toISOString().slice(0, 7) : null };
}
function dashboardTemporal(rows = []) {
  const out = new Map();
  rows.forEach((r) => { const k = String(r.competencia || r.periodo || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(k)) return; const x = out.get(k) || { competencia: k, estoque: 0, utilizado: 0, recuperado: 0 }; x.estoque += num(r.estoque); x.utilizado += num(r.utilizado); x.recuperado += num(r.recuperado); out.set(k, x); });
  return [...out.values()].sort((a, b) => a.competencia.localeCompare(b.competencia));
}
function etapasComEvidencia(events = []) { return events.map((e) => ({ ...e, revisaoHumana: e.revisaoHumana !== false, evidencia: e.evidencia || null })); }
module.exports = { projetarCompensacao, dashboardTemporal, etapasComEvidencia };
