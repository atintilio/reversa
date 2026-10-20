// Enriquecimento do cadastro pelo CNPJ (BrasilAPI / dados públicos da Receita). Falha silenciosa: nunca interrompe o diagnóstico.
const { getSql } = require('./db');

const URL_BASE = 'https://brasilapi.com.br/api/cnpj/v1/';
const TIMEOUT_MS = 4000;
const JANELA_DIAS = 30;
const ROLE_SUGERIDO = 'Sugerido (Receita) — confirmar';

let fetchImpl = null; // injetável nos testes
function setFetchForTests(f) { fetchImpl = f; }

const txt = (v, n = 240) => (v == null ? null : String(v).trim().slice(0, n) || null);

const sa = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
// Regime segundo a Receita (ano mais recente de regime_tributario; senão opção Simples/MEI). Não substitui o regime do SPED.
function regimeReceita(j) {
  const l = (Array.isArray(j.regime_tributario) ? j.regime_tributario : []).filter((x) => x && x.forma_de_tributacao).sort((a, b) => Number(b.ano) - Number(a.ano));
  if (l.length) return { valor: txt(l[0].forma_de_tributacao, 60), ano: l[0].ano != null ? Number(l[0].ano) : null, fonte: 'BrasilAPI (Receita Federal)' };
  if (j.opcao_pelo_mei === true) return { valor: 'MEI', ano: null, fonte: 'BrasilAPI (Receita Federal)' };
  if (j.opcao_pelo_simples === true) return { valor: 'SIMPLES NACIONAL', ano: null, fonte: 'BrasilAPI (Receita Federal)' };
  return null;
}
const CHAVES = ['REAL', 'PRESUMIDO', 'SIMPLES', 'MEI', 'ARBITRADO'];
function divergencia(sped, receita) {
  if (!sped || !receita) return null;
  const a = CHAVES.find((k) => sa(sped).includes(k)); const b = CHAVES.find((k) => sa(receita.valor).includes(k));
  return a && b && a !== b ? { sped, receita: receita.valor } : null;
}
function endereco(j) {
  return {
    logradouro: txt([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), 200), numero: txt(j.numero, 20), complemento: txt(j.complemento, 100),
    bairro: txt(j.bairro, 100), cep: txt(j.cep, 12), municipio: txt(j.municipio, 120), uf: txt(j.uf, 2)
  };
}

function normalizar(j) {
  return {
    endereco: endereco(j), regimeReceita: regimeReceita(j), emailReceita: txt(j.email, 240), telefoneReceita: txt(j.ddd_telefone_1, 40),
    fonte: 'BrasilAPI (Receita Federal)', consultadoEm: new Date().toISOString(),
    razaoSocial: txt(j.razao_social), nomeFantasia: txt(j.nome_fantasia), porte: txt(j.descricao_porte || j.porte, 60),
    cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : null, cnaeDescricao: txt(j.cnae_fiscal_descricao),
    naturezaJuridica: txt(j.natureza_juridica), municipio: txt(j.municipio, 120), uf: txt(j.uf, 2),
    situacao: txt(j.descricao_situacao_cadastral, 60), abertura: txt(j.data_inicio_atividade, 10),
    capitalSocial: j.capital_social != null ? Number(j.capital_social) : null,
    socios: (Array.isArray(j.qsa) ? j.qsa : []).slice(0, 20).map((s) => ({ nome: txt(s.nome_socio, 160), qualificacao: txt(s.qualificacao_socio, 120) }))
  };
}

async function consultar(cnpj) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    const r = await f(URL_BASE + cnpj, ctl ? { signal: ctl.signal, headers: { accept: 'application/json' } } : {});
    if (!r || !r.ok) return null;
    const j = await r.json();
    return { dados: normalizar(j), email: txt(j.email, 240), telefone: txt(j.ddd_telefone_1, 40) };
  } catch (e) { return null; } finally { if (timer) clearTimeout(timer); }
}

// Consulta no máximo 1 vez por CNPJ a cada 30 dias, grava em taxpayers.metadata.enriquecimento e sugere contato (não confirmado).
async function enriquecer(ctx, taxpayerId, caseId, opts = {}) {
  let receita = { consultado: false }; let dados = null;
  try { receita = await enriquecerReceita(ctx, taxpayerId, caseId, opts); dados = receita.dados; } catch (e) { /* segue para o Apollo */ }
  let apollo = { ativo: false };
  try {
    const sql = getSql();
    const t = (await sql`select legal_name, metadata from taxpayers where id = ${taxpayerId} and organization_id = ${ctx.organization.id}`)[0];
    const m = t && (typeof t.metadata === 'object' ? t.metadata : JSON.parse(t.metadata || '{}'));
    const e = dados || (m && m.enriquecimento) || {};
    apollo = await require('./apollo').enriquecer(ctx, taxpayerId, caseId, { forcar: opts.forcar, nomes: [e.nomeFantasia, e.razaoSocial, t && t.legal_name] });
  } catch (e) { /* Apollo nunca bloqueia */ }
  const out = { ...receita }; delete out.dados;
  if (apollo && apollo.ativo) out.apollo = apollo;
  return out;
}

async function enriquecerReceita(ctx, taxpayerId, caseId, opts = {}) {
  try {
    if (!fetchImpl && process.env.NODE_TEST_CONTEXT) return { consultado: false };
    const sql = getSql();
    const org = ctx.organization.id;
    const t = (await sql`select cnpj_normalized, tax_regime, metadata from taxpayers where id = ${taxpayerId} and organization_id = ${org}`)[0];
    if (!t) return { consultado: false };
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : JSON.parse(t.metadata || '{}');
    const ult = meta.enriquecimento && meta.enriquecimento.consultadoEm ? new Date(meta.enriquecimento.consultadoEm).getTime() : 0;
    if (!opts.forcar && ult && Date.now() - ult < JANELA_DIAS * 86400000) return { consultado: false };
    const r = await consultar(t.cnpj_normalized);
    if (!r) return { consultado: false };
    r.dados.divergenciaRegime = divergencia(t.tax_regime, r.dados.regimeReceita);
    await sql`update taxpayers set metadata = metadata || ${JSON.stringify({ enriquecimento: r.dados })}::jsonb, updated_at = now() where id = ${taxpayerId}`;
    let sugerido = false;
    const contatos = await sql`select id, role, is_primary from crm_contacts where organization_id = ${org} and taxpayer_id = ${taxpayerId}`;
    const confirmados = contatos.filter((c) => !/Sugerido \((Receita|Apollo)\)/.test(String(c.role || '')));
    const jaSugerido = contatos.some((c) => String(c.role || '').startsWith('Sugerido (Receita)'));
    if (!confirmados.length && !jaSugerido && (r.email || r.telefone)) {
      await sql`insert into crm_contacts (organization_id, taxpayer_id, name, role, email, phone, is_primary, created_by)
                values (${org}, ${taxpayerId}, ${(r.dados.nomeFantasia || r.dados.razaoSocial || 'Contato da empresa').slice(0, 160)}, ${ROLE_SUGERIDO},
                        ${r.email ? r.email.toLowerCase() : null}, ${r.telefone}, false, ${ctx.user.id})`;
      sugerido = true;
    }
    await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, body, created_by, meta)
              values (${org}, ${taxpayerId}, ${caseId || null}, 'agent', 'Cadastro enriquecido pela Receita',
                      ${[r.dados.situacao && `Situação: ${r.dados.situacao}`, r.dados.porte && `Porte: ${r.dados.porte}`, r.dados.cnaeDescricao && `CNAE: ${r.dados.cnaeDescricao}`,
                         r.dados.municipio && `${r.dados.municipio}/${r.dados.uf || ''}`, sugerido && 'Contato sugerido (a confirmar)'].filter(Boolean).join(' · ')},
                      ${ctx.user.id}, ${JSON.stringify({ enriquecimento: true, fonte: r.dados.fonte, contatoSugerido: sugerido })}::jsonb)`;
    return { consultado: true, sugerido, dados: r.dados };
  } catch (e) { return { consultado: false }; }
}

module.exports = { regimeReceita, divergencia, enriquecer, consultar, normalizar, setFetchForTests, ROLE_SUGERIDO };
