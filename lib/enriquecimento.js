// Enriquecimento do cadastro pelo CNPJ (BrasilAPI / dados públicos da Receita). Falha silenciosa: nunca interrompe o diagnóstico.
const { getSql } = require('./db');

const URL_BASE = 'https://brasilapi.com.br/api/cnpj/v1/';
const TIMEOUT_MS = 4000;
const JANELA_DIAS = 30;
const ROLE_SUGERIDO = 'Sugerido (Receita) — confirmar';

let fetchImpl = null; // injetável nos testes
function setFetchForTests(f) { fetchImpl = f; }

const txt = (v, n = 240) => (v == null ? null : String(v).trim().slice(0, n) || null);

function normalizar(j) {
  return {
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
async function enriquecer(ctx, taxpayerId, caseId) {
  try {
    if (!fetchImpl && process.env.NODE_TEST_CONTEXT) return { consultado: false };
    const sql = getSql();
    const org = ctx.organization.id;
    const t = (await sql`select cnpj_normalized, metadata from taxpayers where id = ${taxpayerId} and organization_id = ${org}`)[0];
    if (!t) return { consultado: false };
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : JSON.parse(t.metadata || '{}');
    const ult = meta.enriquecimento && meta.enriquecimento.consultadoEm ? new Date(meta.enriquecimento.consultadoEm).getTime() : 0;
    if (ult && Date.now() - ult < JANELA_DIAS * 86400000) return { consultado: false };
    const r = await consultar(t.cnpj_normalized);
    if (!r) return { consultado: false };
    await sql`update taxpayers set metadata = metadata || ${JSON.stringify({ enriquecimento: r.dados })}::jsonb, updated_at = now() where id = ${taxpayerId}`;
    let sugerido = false;
    const contatos = await sql`select id, role, is_primary from crm_contacts where organization_id = ${org} and taxpayer_id = ${taxpayerId}`;
    const confirmados = contatos.filter((c) => !String(c.role || '').startsWith('Sugerido (Receita)'));
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
    return { consultado: true, sugerido };
  } catch (e) { return { consultado: false }; }
}

module.exports = { enriquecer, consultar, normalizar, setFetchForTests, ROLE_SUGERIDO };
