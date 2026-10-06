// Agente de IA do CRM (Qwen por padrão, via endpoint compatível com a API da OpenAI).
// Lê o que o Reversa já sabe do cliente e devolve análise comercial estruturada. Nunca afirma crédito (RB-09)
// e só cita base legal que veio do diagnóstico. Sugestões de perfil são aplicadas só se a pessoa confirmar.
// Configuração: LLM_API_KEY (obrigatória), LLM_BASE_URL (padrão Alibaba Model Studio internacional), LLM_MODEL (padrão qwen-flash).
const Regras = require('../teses-regras.js');

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-flash';
const TIMEOUT_MS = 55000; // cabe no limite de 60 s da função (vercel.json)
const PERFIL_IDS = Regras.PERFIL.map((p) => p.id);

function configurado() { return Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY.trim()); }
function modelo() { return (process.env.LLM_MODEL || DEFAULT_MODEL).trim(); }

const SISTEMA = [
  'Você é o analista comercial do Reversa Tax (Argus Prime), especialista em recuperação de tributos no Brasil.',
  'Trabalhe só com os dados fornecidos. Não invente fatos sobre a empresa, valores, leis ou decisões.',
  'Regra inegociável: diagnóstico preliminar não é crédito. Nunca afirme que a empresa "tem crédito" nem estime valores;',
  'fale em "oportunidade a confirmar com cálculo, documentos e revisão humana".',
  'Ao citar base legal ou precedente, use apenas o que estiver no diagnóstico fornecido.',
  'Teses de segurança vermelha não devem ser oferecidas como recuperáveis.',
  'Responda em português do Brasil, de forma objetiva, para um executivo comercial que vai falar com o cliente.'
].join(' ');

const FORMATO = `Responda SOMENTE com um objeto JSON neste formato:
{
  "resumo": "2 a 4 frases sobre a empresa e o momento comercial",
  "perfil_sugerido": [{ "flag": "<id do perfil>", "valor": true|false, "evidencia": "dado que sustenta" }],
  "teses_prioritarias": [{ "id": "T0xx", "motivo": "por que priorizar nesta conversa" }],
  "perguntas": ["pergunta para a reunião"],
  "proximos_passos": ["ação concreta"],
  "alertas": ["risco ou cuidado"]
}
Ids de perfil válidos: ${PERFIL_IDS.join(', ')}. Sugira perfil apenas quando houver evidência nos dados e o valor atual for desconhecido ou diferente.
No máximo 5 teses prioritárias, 6 perguntas, 5 próximos passos e 4 alertas.`;

function contexto(d) {
  const perfil = Regras.PERFIL.map((p) => `${p.id}=${d.perfil[p.id] === true ? 'sim' : d.perfil[p.id] === false ? 'não' : '?'}`).join(', ');
  const pub = d.publico ? [
    `Situação: ${d.publico.situacao || '?'}; abertura: ${d.publico.abertura || '?'}; porte: ${d.publico.porte || '?'}; natureza: ${d.publico.naturezaJuridica || '?'}`,
    `Local: ${d.publico.municipio || '?'}/${d.publico.uf || '?'}; capital social: ${d.publico.capitalSocial == null ? '?' : d.publico.capitalSocial}`,
    d.publico.cnae ? `CNAE principal: ${d.publico.cnae.codigo} ${d.publico.cnae.descricao}` : '',
    d.publico.cnaesSecundarios.length ? `CNAEs secundárias: ${d.publico.cnaesSecundarios.slice(0, 15).map((c) => `${c.codigo} ${c.descricao}`).join('; ')}` : '',
    `Simples: ${d.publico.simples ? 'sim' : 'não'}`
  ].filter(Boolean).join('\n') : 'Dados públicos do CNPJ: não consultados.';
  const grupos = d.diagnostico.map((g) => `## ${g.nome}: ${g.total} teses (${g.provavel} prováveis, ${g.verificar} a verificar)\n` +
    g.teses.slice(0, 40).map((t) => `- ${t.id} ${t.nome} | ${t.estado}${t.faltam.length ? ` (falta: ${t.faltam.join(', ')})` : ''} | segurança ${t.seguranca || '?'} | ${t.maturidade || ''} | base: ${(t.base || '').slice(0, 160)}`).join('\n')).join('\n');
  const ativ = d.atividades.slice(0, 15).map((a) => `- ${String(a.createdAt).slice(0, 10)} [${a.type}] ${a.subject || ''}: ${String(a.body || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') || '- (nenhuma)';
  const contatos = d.contatos.map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ''}`).join('\n') || '- (nenhum)';
  return `# Empresa
${d.nome} — CNPJ ${d.cnpj}; regime: ${d.regime || 'não informado'}
Fase comercial: ${d.fase}; próximo passo registrado: ${d.proximoPasso || '—'}
Valor do motor (PIS/COFINS no prazo, pendente de revisão): ${d.valorMotor == null ? 'sem cálculo' : `R$ ${d.valorMotor.toLocaleString('pt-BR')}`}
Perfil atual: ${perfil}

# Dados públicos do CNPJ
${pub}

# Diagnóstico preliminar
${grupos}

# Contatos
${contatos}

# Histórico recente
${ativ}`;
}

async function chamar(messages, { json, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const base = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const r = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY.trim()}` },
      body: JSON.stringify({ model: modelo(), messages, temperature: 0.2, ...(json ? { response_format: { type: 'json_object' } } : {}) })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Modelo de IA respondeu ${r.status}${data.error && data.error.message ? `: ${String(data.error.message).slice(0, 200)}` : ''}`);
    const texto = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!texto) throw new Error('Modelo de IA não retornou conteúdo.');
    return { texto: String(texto), uso: data.usage || null };
  } finally { clearTimeout(timer); }
}

function extrairJson(texto) {
  const s = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* segue */ }
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
  throw new Error('Resposta do modelo fora do formato.');
}

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const lista = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => str(x, m)).filter(Boolean).slice(0, n);

// Valida e limpa a saída: só flags e teses que existem; teses vermelhas saem das prioritárias.
function sanear(bruto, d) {
  const teses = new Map(d.diagnostico.flatMap((g) => g.teses).map((t) => [t.id, t]));
  const perfil = (Array.isArray(bruto.perfil_sugerido) ? bruto.perfil_sugerido : [])
    .filter((p) => p && PERFIL_IDS.includes(p.flag) && typeof p.valor === 'boolean' && d.perfil[p.flag] !== p.valor)
    .slice(0, 10).map((p) => ({ flag: p.flag, valor: p.valor, evidencia: str(p.evidencia, 240) }));
  const prioritarias = (Array.isArray(bruto.teses_prioritarias) ? bruto.teses_prioritarias : [])
    .filter((t) => t && teses.has(t.id) && teses.get(t.id).seguranca !== 'vermelho')
    .slice(0, 5).map((t) => ({ id: t.id, nome: teses.get(t.id).nome, seguranca: teses.get(t.id).seguranca, motivo: str(t.motivo, 300) }));
  return {
    resumo: str(bruto.resumo, 1200), perfilSugerido: perfil, tesesPrioritarias: prioritarias,
    perguntas: lista(bruto.perguntas, 6, 300), proximosPassos: lista(bruto.proximos_passos, 5, 300), alertas: lista(bruto.alertas, 4, 300)
  };
}

function texto(a) {
  const l = [a.resumo];
  if (a.tesesPrioritarias.length) l.push('', 'Teses para priorizar:', ...a.tesesPrioritarias.map((t) => `• ${t.id} ${t.nome} — ${t.motivo}`));
  if (a.perguntas.length) l.push('', 'Perguntas para a reunião:', ...a.perguntas.map((p) => `• ${p}`));
  if (a.proximosPassos.length) l.push('', 'Próximos passos:', ...a.proximosPassos.map((p) => `• ${p}`));
  if (a.alertas.length) l.push('', 'Alertas:', ...a.alertas.map((p) => `• ${p}`));
  if (a.perfilSugerido.length) l.push('', 'Perfil sugerido (confirme antes de aplicar):', ...a.perfilSugerido.map((p) => `• ${p.flag}: ${p.valor ? 'sim' : 'não'} — ${p.evidencia}`));
  return l.join('\n').trim();
}

async function analisar(dados, opcoes = {}) {
  const r = await chamar([
    { role: 'system', content: `${SISTEMA}\n\n${FORMATO}` },
    { role: 'user', content: contexto(dados) }
  ], { json: true, fetchImpl: opcoes.fetchImpl });
  const analise = sanear(extrairJson(r.texto), dados);
  return { analise, texto: texto(analise), uso: r.uso, modelo: modelo() };
}

async function perguntar(dados, pergunta, opcoes = {}) {
  const r = await chamar([
    { role: 'system', content: SISTEMA },
    { role: 'user', content: `${contexto(dados)}\n\n# Pergunta do executivo\n${str(pergunta, 1000)}` }
  ], { fetchImpl: opcoes.fetchImpl });
  return { texto: str(r.texto, 6000), uso: r.uso, modelo: modelo() };
}

module.exports = { configurado, modelo, analisar, perguntar, sanear, extrairJson, contexto };
