// Busca da Selic mensal (% a.m.) em várias fontes públicas, normalizada para { 'AAAA-MM': taxa }.
// Uso: diagnóstico PRELIMINAR. Para compensação vale a tabela oficial da Receita (o PER/DCOMP calcula na transmissão).
const Selic = require('../selic');

const TIMEOUT_MS = 8000;
const CACHE_MS = 12 * 60 * 60 * 1000;
const BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados';
const INICIO = '01/01/2015';

// Fonte (c) Ipeadata: DESLIGADA. Não foi possível confirmar o código (SERCODIGO) da Selic mensal na
// documentação/API do Ipeadata neste ambiente (sem acesso à rede). Para ligar, confirmar o código em
// http://www.ipeadata.gov.br/api/odata4/Metadados e preencher IPEADATA_SERCODIGO; o parser abaixo já está pronto.
const IPEADATA_SERCODIGO = null;
const IPEADATA_URL = 'http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO=\'%s\')';

async function baixar(fetchImpl, url, tipo) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { Accept: tipo === 'json' ? 'application/json' : 'text/csv,text/plain' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return tipo === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(timer); }
}

// SGS usa 'dd/mm/aaaa'; a taxa pode vir com ponto (JSON) ou vírgula (CSV).
function taxa(v) {
  const n = Number(String(v).trim().replace(/^"|"$/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function competencia(data) {
  const m = /^"?(\d{2})\/(\d{2})\/(\d{4})/.exec(String(data).trim());
  return m ? `${m[3]}-${m[2]}` : null;
}

function normalizarSgsJson(dados) {
  if (!Array.isArray(dados)) throw new Error('formato inesperado');
  const t = {};
  for (const it of dados) { const ym = competencia(it && it.data), v = taxa(it && it.valor); if (ym && v !== null) t[ym] = v; }
  return t;
}
function normalizarSgsCsv(texto) {
  const t = {};
  for (const linha of String(texto).replace(/^﻿/, '').split(/\r?\n/)) {
    const [d, v] = linha.split(';');
    const ym = competencia(d || ''), x = taxa(v === undefined ? '' : v);
    if (ym && x !== null) t[ym] = x; // cabeçalho ("data";"valor") é ignorado
  }
  return t;
}
function normalizarIpeadata(dados) {
  const lista = dados && dados.value;
  if (!Array.isArray(lista)) throw new Error('formato inesperado');
  const t = {};
  for (const it of lista) { const m = /^(\d{4})-(\d{2})/.exec(String(it.VALDATA || '')); const v = taxa(it.VALVALOR); if (m && v !== null) t[`${m[1]}-${m[2]}`] = v; }
  return t;
}

const FONTES = [
  { nome: 'BCB SGS 4390 (JSON)', buscar: async (f) => normalizarSgsJson(await baixar(f, `${BCB}?formato=json&dataInicial=${INICIO}`, 'json')) },
  { nome: 'BCB SGS 4390 (CSV)', buscar: async (f) => normalizarSgsCsv(await baixar(f, `${BCB}?formato=csv&dataInicial=${INICIO}`, 'csv')) }
];
if (IPEADATA_SERCODIGO) {
  FONTES.push({ nome: 'Ipeadata', buscar: async (f) => normalizarIpeadata(await baixar(f, IPEADATA_URL.replace('%s', IPEADATA_SERCODIGO), 'json')) });
}

async function buscarTodas(fetchImpl = globalThis.fetch) {
  return Promise.all(FONTES.map(async (f) => {
    try {
      const tabela = await f.buscar(fetchImpl);
      if (!Object.keys(tabela).length) return { nome: f.nome, tabela: {}, erro: 'sem dados' };
      return { nome: f.nome, tabela, erro: null };
    } catch (e) {
      return { nome: f.nome, tabela: {}, erro: e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e) };
    }
  }));
}

let cache = null;
function limparCache() { cache = null; }

// Retorna { ok:false } se todas falharem; senão o consenso (cache em memória por 12 h).
async function obter(fetchImpl, agora = Date.now()) {
  if (cache && agora - cache.em < CACHE_MS) return cache.dados;
  const fontes = await buscarTodas(fetchImpl);
  const c = Selic.consenso(fontes);
  if (!c.fontes.some((f) => f.ok) || !Object.keys(c.tabela).length) return { ok: false, fontes: c.fontes };
  const dados = {
    ok: true, tabela: c.tabela, fontes: c.fontes, divergencias: c.divergencias, ultimaCompetencia: c.ultimaCompetencia,
    avisosConsenso: c.avisos, atualizadoEm: new Date(agora).toISOString(), uso: 'preliminar',
    aviso: 'Para compensação vale a tabela oficial da Receita Federal (o PER/DCOMP calcula na transmissão).'
  };
  cache = { em: agora, dados };
  return dados;
}

module.exports = { buscarTodas, obter, limparCache, normalizarSgsJson, normalizarSgsCsv, normalizarIpeadata, FONTES };
