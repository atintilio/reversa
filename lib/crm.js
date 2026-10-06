// Integração Reversa Tax → CRM (trycompai/crm, publicado no Vercel gratuito).
// O Reversa é a fonte de clientes, fase comercial e diagnóstico preliminar; o CRM organiza o funil.
// Cada cliente vira uma empresa; cada grupo com teses aplicáveis (Fiscal, Previdenciário) vira um negócio
// com uma nota do diagnóstico (base legal, origem, maturidade, segurança). Diagnóstico não é crédito (RB-09).
// Configuração: CRM_API_URL (ex.: https://crm-api.argusprime.com.br) e CRM_SYNC_SECRET (o mesmo REVERSA_SYNC_SECRET do CRM).
const { getSql } = require('./db');
const Regras = require('../teses-regras.js');
const Diag = require('../teses-diagnostico.js');

const TIMEOUT_MS = 8000;
const GRUPOS = [
  { id: 'fiscal', nome: 'Fiscal', de: (t) => t.tributo !== 'Previdenciário' },
  { id: 'prev', nome: 'Previdenciário', de: (t) => t.tributo === 'Previdenciário' }
];

function configured() { return Boolean(process.env.CRM_API_URL && process.env.CRM_SYNC_SECRET); }

function appUrl() {
  const base = process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://reversa.argusprime.com.br';
  return base.replace(/\/+$/, '');
}

function teseDiag(tese, avaliacao) {
  const d = Diag.de(tese.id) || {};
  return {
    id: tese.id, nome: tese.nome.slice(0, 200), estado: avaliacao.estado,
    seguranca: d.seguranca || null,
    maturidade: d.maturidade ? (Diag.MATURIDADE && Diag.MATURIDADE[d.maturidade]) || d.maturidade : null,
    base: d.base ? String(d.base).slice(0, 600) : null,
    origem: d.origem ? String(d.origem).slice(0, 300) : null,
    faltam: (avaliacao.faltam || []).slice(0, 20).map((f) => String(f).slice(0, 80))
  };
}

// Monta o cliente no formato do CRM (puro: sem banco, testável).
function montarCliente(row) {
  const cliente = { regime: row.tax_regime, perfil: row.perfil || {} };
  const grupos = GRUPOS.map((g) => {
    const teses = Regras.TESES.filter(g.de)
      .map((t) => ({ t, a: Regras.avaliar(t, cliente) }))
      .filter((x) => x.a.estado !== 'nao')
      .map((x) => teseDiag(x.t, x.a));
    // Só o Fiscal tem valor do motor (PIS/COFINS no prazo, pendente de revisão); o resto depende de cálculo.
    const valor = g.id === 'fiscal' && row.estimated_value != null ? Number(row.estimated_value) : null;
    return { id: g.id, nome: g.nome, valorEstimado: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null, teses };
  });
  return {
    id: row.id, nome: String(row.legal_name).slice(0, 240), cnpj: String(row.cnpj), regime: row.tax_regime ? String(row.tax_regime).slice(0, 50) : null,
    fase: row.commercial_stage || 'a_apresentar', url: `${appUrl()}/clientes.html?id=${row.id}`, grupos
  };
}

async function carregar(orgId, taxpayerId, caseId) {
  const sql = getSql();
  if (!taxpayerId && caseId) {
    const c = (await sql`select taxpayer_id from tax_cases where id = ${caseId} and organization_id = ${orgId}`)[0];
    if (!c || !c.taxpayer_id) return [];
    taxpayerId = c.taxpayer_id;
  }
  const rows = await sql`
    select t.id, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime, t.metadata->'perfil' as perfil,
           c.commercial_stage, c.estimated_value
    from taxpayers t
    left join lateral (select commercial_stage, estimated_value from tax_cases c where c.taxpayer_id = t.id and c.organization_id = t.organization_id
                       order by (c.status = 'archived'), c.updated_at desc limit 1) c on true
    where t.organization_id = ${orgId} and t.status <> 'archived'
      and (${taxpayerId}::uuid is null or t.id = ${taxpayerId}::uuid)
    order by lower(t.legal_name)`;
  return rows.map((r) => ({ ...r, perfil: typeof r.perfil === 'string' ? JSON.parse(r.perfil) : r.perfil }));
}

async function enviar(clientes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${process.env.CRM_API_URL.replace(/\/+$/, '')}/internal/reversa/sync`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRM_SYNC_SECRET}` },
      body: JSON.stringify({ versao: 1, geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), clientes })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`CRM respondeu ${res.status}`);
      err.status = res.status; err.detail = data && data.message;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

// Sincroniza toda a organização (botão "Enviar ao CRM"); em lotes para caber no limite do CRM.
async function syncAll(ctx) {
  const rows = await carregar(ctx.organization.id, null, null);
  const total = { clientes: rows.length, empresas: { criadas: 0, atualizadas: 0 }, negocios: { criados: 0, atualizados: 0, semTese: 0 }, notas: 0 };
  for (let i = 0; i < rows.length; i += 100) {
    const r = await enviar(rows.slice(i, i + 100).map(montarCliente));
    total.empresas.criadas += r.empresas?.criadas || 0; total.empresas.atualizadas += r.empresas?.atualizadas || 0;
    total.negocios.criados += r.negocios?.criados || 0; total.negocios.atualizados += r.negocios?.atualizados || 0; total.negocios.semTese += r.negocios?.semTese || 0;
    total.notas += r.notas || 0;
  }
  return total;
}

// Após uma mudança num cliente: envia só ele. Nunca derruba a operação principal.
async function syncOne(ctx, taxpayerId, caseId) {
  if (!configured() || (!taxpayerId && !caseId)) return;
  try {
    const rows = await carregar(ctx.organization.id, taxpayerId || null, caseId || null);
    if (rows.length) await enviar(rows.map(montarCliente));
  } catch (error) {
    console.error('crm.sync_one falhou', error.status || error.name || 'erro');
  }
}

module.exports = { configured, montarCliente, syncAll, syncOne };
