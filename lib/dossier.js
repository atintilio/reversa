'use strict';

// Memória de cálculo auditável; mantém a fonte documental e não decide mérito jurídico.
function money(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; }
function memory(lines = [], { selic = 0 } = {}) {
  const itens = lines.map((l, i) => {
    const nominal = money(l.nominal != null ? l.nominal : l.valor);
    const taxa = Number(l.selicRate != null ? l.selicRate : selic) || 0;
    const atualizado = Math.round(nominal * (1 + taxa));
    return { id: String(l.id || `linha-${i + 1}`), materia: l.materia || l.nome || '', nominalCentavos: nominal, taxaSelic: taxa, atualizadoCentavos: atualizado, formula: `nominal × (1 + ${taxa})`, origem: l.origem || l.documento || null, referencia: l.referencia || null };
  });
  return { itens, nominalCentavos: itens.reduce((s, x) => s + x.nominalCentavos, 0), atualizadoCentavos: itens.reduce((s, x) => s + x.atualizadoCentavos, 0) };
}
function version(snapshot, previous = []) {
  const n = previous.length ? Math.max(...previous.map((x) => Number(x.versao) || 0)) + 1 : 1;
  return { versao: n, criadoEm: new Date().toISOString(), snapshot };
}
function workspace(client = {}) {
  return { clienteId: client.id || null, nome: client.nome || client.name || null, cnpj: client.cnpj || null, semDocumentos: !Number(client.documentos || client.documents || 0), diagnosticos: client.diagnosticos || [], dossies: client.dossies || [], execucoes: client.execucoes || [] };
}
module.exports = { money, memory, version, workspace };
