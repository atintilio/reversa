const crypto = require('node:crypto');

const textOf = (buffer) => Buffer.from(buffer || '').toString('utf8');
const monthOf = (s) => {
  const raw = String(s || '');
  let m = raw.match(/\b(20\d{2})[-_ ]?(0[1-9]|1[0-2])\b/) || raw.match(/(?:^|[_-])(20\d{2})(0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[_-]|\b)/) || raw.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])\d{3,}(?:\D|$)/);
  if (m) return `${m[1]}-${m[2]}`;
  m = raw.match(/(?:^|\D)(?:0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})(?:\D|$)/);
  if (m) return `${m[2]}-${m[1]}`;
  m = raw.match(/(?:^|[_-])(0[1-9]|1[0-2])(20\d{2})(?:[_-]|\b)/);
  return m ? `${m[2]}-${m[1]}` : null;
};

function classify({ name = '', buffer = Buffer.alloc(0) } = {}) {
  const filename = String(name || '');
  const lower = filename.toLowerCase();
  const body = textOf(buffer);
  const sample = `${lower}\n${body.slice(0, 50000).toLowerCase()}`;
  const ext = (lower.match(/\.([a-z0-9]+)$/) || [])[1] || 'bin';
  const cnpj = (sample.match(/\b\d{14}\b/) || [])[0] || null;
  let tipo = 'outro';
  if (/pgdas|dasn|simples\s*nacional/i.test(sample)) tipo = 'pgdas';
  else if (/(?:^|[^a-z])dctf(?:[^a-z]|$)|(?:^|[^a-z])mit(?:[^a-z]|$)/i.test(sample)) tipo = 'dctfweb';
  else if (/perdcomp/i.test(sample)) tipo = 'perdcomp';
  else if (/\becd\b|lecd|escrituracao\s*contabil/i.test(sample)) tipo = 'ecd';
  else if (/\becf\b|lecf|escrituracao\s*fiscal/i.test(sample)) tipo = 'ecf';
  else if (/efd[-_ ]?(icms|ipi)|sped\s*fiscal/i.test(sample)) tipo = 'efd_icms_ipi';
  else if (/efd[-_ ]?contrib|pis.?cofins/i.test(sample)) tipo = 'efd_contribuicoes';
  else if (/esocial/i.test(sample)) tipo = 'esocial';
  else if (ext === 'xml' || /<\/?(sped|efd|dctf|esocial|perdcomp|recibo)/i.test(body)) tipo = 'sped';
  else if (ext === 'txt' || /\|\s*(0000|M001|J001)\|/.test(body)) tipo = /\|0000\|/.test(body) ? 'sped' : 'outro';
  else if (ext === 'pdf') tipo = /recibo|protocolo|transmiss[aã]o/i.test(sample) ? 'recibo' : 'pdf';
  else if (ext === 'rec' || ext === 'p7s') tipo = 'recibo';
  else if (ext === 'zip') tipo = 'arquivo_compactado';
  const retificadora = /retific|substitut|vers[aã]o\s*\d|r\d{1,2}\b/i.test(sample) ? true : null;
  const recibo = tipo === 'recibo' || /recibo|protocolo|transmitid[oa]|n[uú]mero de recibo/i.test(sample);
  const competencia = monthOf(`${filename}\n${body}`);
  const original = /original/i.test(lower) || /\|0000\|[^\n|]*\|0\|/.test(body) ? true : retificadora === true ? false : null;
  const logicalKey = [cnpj || 'sem-cnpj', tipo, competencia || 'sem-competencia', recibo ? 'recibo' : 'declaracao'].join('|');
  return { name: filename, extension: ext, tipo, competencia, cnpj, original, retificadora, recibo, logicalKey, identificationSource: ext === 'pdf' ? 'nome_do_arquivo' : 'conteudo_e_nome', readingStatus: ext === 'pdf' ? 'aguarda_extracao_pdf' : tipo === 'outro' ? 'tipo_nao_identificado' : 'identificado' };
}

function reconcile(docs = [], expected = [], consultations = []) {
  const documents = Array.isArray(docs) ? docs : [];
  const byHash = new Map(); documents.forEach((d, i) => { if (!byHash.has(d.sha256)) byHash.set(d.sha256, []); byHash.get(d.sha256).push(i); });
  documents.forEach((d, i) => { const first = byHash.get(d.sha256).find((n) => n < i); d.duplicateOf = first == null ? null : documents[first].name; });
  const versions = [...new Map(documents.map((d) => [d.logicalKey, documents.filter((x) => x.logicalKey === d.logicalKey).sort((a, b) => Number(a.original) - Number(b.original))])).values()];
  const seen = new Set(documents.filter(d => !d.recibo).map((d) => `${d.tipo}|${d.competencia || ''}`));
  const gaps = (Array.isArray(expected) ? expected : []).map((e) => {
    const x = typeof e === 'string' ? { tipo: 'sped', competencia: e } : e || {};
    const key = `${x.tipo || 'sped'}|${x.competencia || ''}`;
    if (seen.has(key)) return null;
    const consultation = (Array.isArray(consultations) ? consultations : []).find((c) => c && c.tipo === x.tipo && c.competencia === x.competencia);
    const complete = consultation && consultation.perfil && consultation.competencia === x.competencia && consultation.referencia && consultation.consultadaEm;
    const state = !consultation ? 'documento_ausente' : consultation.acessoDisponivel === false ? 'acesso_nao_disponivel' : consultation.encontrada === false && complete ? 'declaracao_nao_encontrada_ecac' : 'consulta_inconclusiva';
    return { tipo: x.tipo || 'sped', competencia: x.competencia || null, estado: state, evidenciaConsulta: consultation ? { perfil: consultation.perfil || null, periodo: consultation.competencia || null, referencia: consultation.referencia || null, consultadaEm: consultation.consultadaEm || null } : null };
  }).filter(Boolean);
  return { documents, versions, duplicates: documents.filter((d) => d.duplicateOf), gaps };
}

function inventory(files = [], expected = [], consultations = []) {
  const docs = (Array.isArray(files) ? files : []).map((f) => {
    const buffer = Buffer.isBuffer(f) ? f : Buffer.from(f.buffer || f.content || '');
    const meta = classify({ name: f.name || f.path || '', buffer });
    return { ...meta, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  });
  return reconcile(docs, expected, consultations);
}

module.exports = { classify, inventory, reconcile };
