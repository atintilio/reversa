'use strict';

// Views/exportações sobre dados já persistidos; não duplica o armazenamento.
const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[;\"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (columns, rows) => [columns.map(esc).join(';'), ...rows.map((r) => columns.map((c) => esc(r[c])).join(';'))].join('\r\n') + '\r\n';

function workspace({ documents = [], retificacoes = [], recoveryPackages = [] } = {}) {
  return {
    documentos: documents.map((d) => ({ id: d.id || null, nome: d.name || d.nome || '', tipo: d.document_kind || d.tipo || '', competencia: d.competence || d.competencia || '', cnpj: d.cnpj || '', estado: d.state || d.estado || '', sha256: d.sha256 || '', etag: d.etag || '' })),
    retificacoes: retificacoes.map((r) => ({ id: r.id || null, nome: r.name || r.nome || '', competencia: r.competencia || '', tipo: r.tipo || '', status: r.status || r.estado || '', recibo: r.recibo || r.protocol || '' })),
    perdcomp: recoveryPackages.map((p) => ({ id: p.id || null, tipo: p.package_type || p.tipo || '', status: p.status || '', periodoInicio: p.period_start || '', periodoFim: p.period_end || '', totalPotencial: p.total_potential ?? '', totalAprovado: p.total_approved ?? '' }))
  };
}

function exportInventory(documents) {
  return csv(['id', 'nome', 'tipo', 'competencia', 'cnpj', 'estado', 'sha256', 'etag'], workspace({ documents }).documentos);
}
function exportRetificacoes(retificacoes) {
  return csv(['id', 'nome', 'competencia', 'tipo', 'status', 'recibo'], workspace({ retificacoes }).retificacoes);
}
function exportPerdcomp(recoveryPackages) {
  return csv(['id', 'tipo', 'status', 'periodoInicio', 'periodoFim', 'totalPotencial', 'totalAprovado'], workspace({ recoveryPackages }).perdcomp);
}
function exportCompletude({ expected = [], result = [] } = {}) {
  const rows = (result.length ? result : expected).map((r) => ({
    tipo: r.tipo || '', competencia: r.competencia || '', estado: r.estado || r.status || '',
    evidencia: r.evidencia || r.reference || '', consultadaEm: r.consultadaEm || ''
  }));
  return csv(['tipo', 'competencia', 'estado', 'evidencia', 'consultadaEm'], rows);
}

module.exports = { workspace, csv, exportInventory, exportRetificacoes, exportPerdcomp, exportCompletude };
