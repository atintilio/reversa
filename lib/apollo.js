// Enriquecimento via Apollo.io: organização do cliente e a pessoa responsável pela demanda (financeiro/tributário).
// Desligado sem APOLLO_API_KEY. Falha silenciosa: nunca interrompe o diagnóstico nem o salvamento.
// ATENÇÃO: endpoints, parâmetros e formato das respostas abaixo foram escritos a partir de documentação secundária
// (a doc oficial não estava acessível). Valide com uma chave real e ajuste SOMENTE o objeto CFG.
const { getSql } = require('./db');
const { audit } = require('./audit');

const CFG = {
  base: 'https://api.apollo.io',
  timeoutMs: 6000,
  janelaDias: 30,
  maxDiaPadrao: 30,
  headers: (key) => ({ 'x-api-key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', accept: 'application/json' }),
  orgSearch: { path: '/api/v1/mixed_companies/search', body: (nome) => ({ q_organization_name: nome, page: 1, per_page: 5 }), lista: (j) => j.organizations || j.accounts || [] },
  peopleSearch: {
    path: '/api/v1/mixed_people/api_search',
    body: (org, titulos) => ({ organization_ids: org.id ? [org.id] : undefined, q_organization_domains_list: org.dominio ? [org.dominio] : undefined, person_titles: titulos, page: 1, per_page: 25 }),
    lista: (j) => j.people || j.contacts || []
  },
  peopleMatch: { path: '/api/v1/people/match', body: (p) => ({ id: p.id, reveal_personal_emails: false }), pessoa: (j) => j.person || null },
  // prioridade de cargo para a demanda tributária: menor índice = melhor
  prioridade: [/financ|financ[ei]|cfo|finance/i, /controller|controlad/i, /tribut|fiscal|\btax\b/i, /contab|account/i, /diretor|director|\bvp\b|vice|head/i, /s[óo]cio|partner|owner|ceo|presidente|fundador|founder/i],
  titulos: ['CFO', 'Diretor Financeiro', 'Gerente Financeiro', 'Controller', 'Gerente de Controladoria', 'Gerente Tributário', 'Gerente Fiscal', 'Contador', 'Diretor', 'Sócio', 'CEO']
};

let fetchImpl = null; // injetável nos testes
function setFetchForTests(f) { fetchImpl = f; }
const chave = () => String(process.env.APOLLO_API_KEY || '').trim();
const ativo = () => Boolean(chave());
const maxDia = () => { const n = Number(process.env.APOLLO_MAX_DIA); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : CFG.maxDiaPadrao; };
const txt = (v, n = 240) => (v == null ? null : String(v).trim().slice(0, n) || null);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SUFIXOS = /\b(ltda|s\.?a\.?|me|epp|eireli|sa|s\/a|cia|comercio|comércio|industria|indústria|e|de|do|da|dos|das)\b/g;
const tokens = (s) => semAcento(s).replace(/[.,/\\-]/g, ' ').replace(SUFIXOS, ' ').split(/\s+/).filter((t) => t.length > 2);

// Exige sobreposição de nome para não gravar dados de outra empresa.
function mesmaEmpresa(alvo, candidato) {
  const a = new Set(tokens(alvo)); const b = tokens(candidato);
  return b.some((t) => a.has(t));
}

async function chamar(ctx, endpoint, path, body) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), CFG.timeoutMs) : null;
  let ok = false;
  try {
    const r = await f(CFG.base + path, { method: 'POST', headers: CFG.headers(chave()), body: JSON.stringify(body), ...(ctl ? { signal: ctl.signal } : {}) });
    ok = Boolean(r && r.ok);
    return ok ? await r.json() : null;
  } catch (e) { return null; } finally {
    if (timer) clearTimeout(timer);
    await audit('apollo.call', { outcome: ok ? 'success' : 'failure', organizationId: ctx.organization.id, actorUserId: ctx.user && ctx.user.id, metadata: { endpoint } });
  }
}

function orgNormalizada(o) {
  const dominio = txt(o.primary_domain || (o.website_url ? String(o.website_url).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] : null), 120);
  return {
    id: txt(o.id, 80), nome: txt(o.name, 200), dominio, site: txt(o.website_url, 200), linkedin: txt(o.linkedin_url, 200),
    telefone: txt(o.phone || (o.primary_phone && o.primary_phone.number), 40), cidade: txt(o.city, 120), uf: txt(o.state, 60),
    porte: o.estimated_num_employees != null ? `${o.estimated_num_employees} funcionários` : null, industria: txt(o.industry, 120)
  };
}

function escolherPessoa(lista) {
  let melhor = null; let idx = 99;
  for (const p of lista) {
    const i = CFG.prioridade.findIndex((re) => re.test(p.title || ''));
    if (i >= 0 && i < idx) { idx = i; melhor = p; }
  }
  return melhor;
}

// Contador diário de enriquecimentos de pessoa (consomem créditos). Atômico; false = teto atingido.
async function reservarCredito() {
  const sql = getSql();
  const k = `apollo.uso.${new Date().toISOString().slice(0, 10)}`;
  const max = maxDia();
  if (max <= 0) return false;
  const r = await sql`insert into system_parameters (key, value, version) values (${k}, '{"n":1}'::jsonb, '1')
    on conflict (key) do update set value = jsonb_build_object('n', (system_parameters.value->>'n')::int + 1), updated_at = now()
    where (system_parameters.value->>'n')::int < ${max} returning key`;
  return r.length > 0;
}

// Retorna { ativo, consultado, ... }. nomes = candidatos de busca (fantasia, razão social).
async function enriquecer(ctx, taxpayerId, caseId, { forcar = false, nomes = [] } = {}) {
  if (!ativo()) return { ativo: false };
  try {
    const sql = getSql();
    const org = ctx.organization.id;
    const t = (await sql`select metadata from taxpayers where id = ${taxpayerId} and organization_id = ${org}`)[0];
    if (!t) return { ativo: true, consultado: false };
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : JSON.parse(t.metadata || '{}');
    const ult = meta.apollo && meta.apollo.consultadoEm ? new Date(meta.apollo.consultadoEm).getTime() : 0;
    if (!forcar && ult && Date.now() - ult < CFG.janelaDias * 86400000) return { ativo: true, consultado: false, cache: true };
    if (!forcar) {
      const ct = await sql`select role, name, email, phone from crm_contacts where organization_id = ${org} and taxpayer_id = ${taxpayerId}`;
      const completo = ct.some((c) => !/Sugerido \((Receita|Apollo)\)/.test(String(c.role || '')) && c.name && c.email && c.phone);
      if (completo) return { ativo: true, consultado: false, parceiroPreencheu: true }; // o parceiro já informou: não gasta crédito
    }
    const candidatos = nomes.map((n) => txt(n, 200)).filter(Boolean);
    if (!candidatos.length) return { ativo: true, consultado: false };

    let organizacao = null;
    for (const nome of candidatos) {
      const j = await chamar(ctx, 'organizacao', CFG.orgSearch.path, CFG.orgSearch.body(nome));
      const achada = j && CFG.orgSearch.lista(j).find((o) => mesmaEmpresa(nome, o.name));
      if (achada) { organizacao = orgNormalizada(achada); break; }
    }
    const agora = new Date().toISOString();
    if (!organizacao) { await gravar(sql, taxpayerId, { organizacao: null, responsavel: null, consultadoEm: agora, encontrada: false }); return { ativo: true, consultado: true, encontrada: false }; }

    let responsavel = null; let limite = false;
    const jp = await chamar(ctx, 'pessoas', CFG.peopleSearch.path, CFG.peopleSearch.body(organizacao, CFG.titulos));
    const cand = jp ? escolherPessoa(CFG.peopleSearch.lista(jp)) : null;
    if (cand) {
      responsavel = { nome: txt([cand.first_name, cand.last_name || cand.last_name_obfuscated].filter(Boolean).join(' '), 160), cargo: txt(cand.title, 160), email: null, telefone: null, linkedin: txt(cand.linkedin_url, 200), fonte: 'Apollo.io', consultadoEm: agora };
      if (await reservarCredito()) {
        const jm = await chamar(ctx, 'pessoa', CFG.peopleMatch.path, CFG.peopleMatch.body(cand));
        const p = jm && CFG.peopleMatch.pessoa(jm);
        if (p) {
          responsavel.nome = txt(p.name || responsavel.nome, 160); responsavel.cargo = txt(p.title || responsavel.cargo, 160);
          responsavel.email = txt(p.email, 240) ? String(p.email).toLowerCase() : null;
          responsavel.telefone = txt((p.phone_numbers && p.phone_numbers[0] && (p.phone_numbers[0].sanitized_number || p.phone_numbers[0].raw_number)) || p.phone, 40);
          responsavel.linkedin = txt(p.linkedin_url || responsavel.linkedin, 200);
        }
      } else limite = true;
    }
    await gravar(sql, taxpayerId, { organizacao, responsavel, consultadoEm: agora, encontrada: true, limiteDiario: limite || undefined });
    const sugerido = responsavel && responsavel.nome ? await sugerirContato(ctx, taxpayerId, caseId, responsavel) : false;
    return { ativo: true, consultado: true, encontrada: true, responsavel: Boolean(responsavel), sugerido, limiteDiario: limite };
  } catch (e) { return { ativo: true, consultado: false }; }
}

async function gravar(sql, taxpayerId, apollo) {
  await sql`update taxpayers set metadata = metadata || ${JSON.stringify({ apollo })}::jsonb, updated_at = now() where id = ${taxpayerId}`;
}

// Contato sugerido (nunca principal), sem duplicar por e-mail; o cadastro só conta como completo quando alguém confirmar.
async function sugerirContato(ctx, taxpayerId, caseId, r) {
  const sql = getSql(); const org = ctx.organization.id;
  const role = `${r.cargo || 'Responsável'} — Sugerido (Apollo) — confirmar`.slice(0, 120);
  const contatos = await sql`select id, role, email from crm_contacts where organization_id = ${org} and taxpayer_id = ${taxpayerId}`;
  if (r.email && contatos.some((c) => c.email && c.email.toLowerCase() === r.email)) return false;
  const antigo = contatos.find((c) => String(c.role || '').includes('Sugerido (Apollo)'));
  if (antigo) await sql`update crm_contacts set name = ${r.nome}, role = ${role}, email = ${r.email}, phone = ${r.telefone}, updated_at = now() where id = ${antigo.id}`;
  else await sql`insert into crm_contacts (organization_id, taxpayer_id, name, role, email, phone, is_primary, created_by) values (${org}, ${taxpayerId}, ${r.nome}, ${role}, ${r.email}, ${r.telefone}, false, ${ctx.user.id})`;
  await sql`insert into crm_activities (organization_id, taxpayer_id, case_id, type, subject, body, created_by, meta)
    values (${org}, ${taxpayerId}, ${caseId || null}, 'agent', 'Responsável sugerido pelo Apollo', ${[r.nome, r.cargo, r.email ? 'e-mail obtido' : 'sem e-mail'].filter(Boolean).join(' · ')},
            ${ctx.user.id}, ${JSON.stringify({ apollo: true, contatoSugerido: true })}::jsonb)`;
  return true;
}

module.exports = { enriquecer, ativo, setFetchForTests, mesmaEmpresa, escolherPessoa, CFG };
