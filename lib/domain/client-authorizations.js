const crypto = require('node:crypto');
const { getSql } = require('../db');
const { HttpError } = require('../authz');
const { audit } = require('../audit');
const { randomToken, hashSession, normalizeEmail } = require('../security');
const { hit } = require('../rate-limit');
const mailer = require('../mailer');
const Regras = require('../../teses-regras');
const Diag = require('../../teses-diagnostico');

const TERMS = 'Autorizo o trabalho de recuperação administrativa relativo às teses que selecionei, incluindo apuração e preparação dos atos necessários. Li a classificação e as ressalvas de cada tese. A seleção não reconhece crédito, não altera a classificação de risco e não dispensa a validação técnica de cabimento, documentos, valores e prazos antes de retificação ou compensação. A prática dos atos perante a Receita exige os poderes de representação correspondentes. Não autorizo propositura de ação judicial por este formulário.';
function need(ok, status, code, message) { if (!ok) throw new HttpError(status, code, message); }
const uuidOk = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
function baseUrl() {
  const u = new URL(process.env.APP_BASE_URL || '');
  need(u.protocol === 'https:' && !u.username && !u.password, 503, 'BASE_URL_REQUIRED', 'Configure APP_BASE_URL HTTPS.');
  return u.origin;
}
async function create(ctx, caseId, body = {}) {
  need(!ctx.user.legacy && uuidOk(caseId), 400, 'INVALID_CASE', 'Entre com seu e-mail e selecione um caso.');
  const sql = getSql();
  const c = (await sql`select c.id, c.status, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime, t.metadata
    from tax_cases c join taxpayers t on t.id = c.taxpayer_id
    where c.id = ${caseId} and c.organization_id = ${ctx.organization.id} and t.organization_id = ${ctx.organization.id}`)[0];
  need(c && c.status !== 'archived', 404, 'NOT_FOUND', 'Caso não encontrado.');
  const ids = body.theses === undefined ? Regras.TESES.map(t => t.id) : body.theses;
  need(Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && new Set(ids).size === ids.length && ids.every(id => Regras.TESES.some(t => t.id === id)), 400, 'INVALID_THESES', 'Selecione teses válidas, sem duplicações.');
  const cliente = { regime: Regras.regimeDe(c.tax_regime), perfil: c.metadata?.perfil || {} };
  const overrides = body.risks || {};
  need(overrides && typeof overrides === 'object' && !Array.isArray(overrides) && Object.keys(overrides).every(id => ids.includes(id)), 400, 'INVALID_RISK', 'Classificação inválida.');
  ids.forEach(id => {
    const r = overrides[id];
    if (!r) return;
    need(['verde', 'amarelo', 'vermelho'].includes(r.color), 400, 'INVALID_RISK', 'Cor inválida.');
    if (r.color !== (Diag.de(id)?.seguranca || 'amarelo')) need(typeof r.reason === 'string' && r.reason.trim().length >= 10 && r.reason.length <= 2000,
      400, 'RISK_REASON_REQUIRED', 'Justifique cada classificação alterada.');
  });
  const periodStart = String(body.periodStart || ''), periodEnd = String(body.periodEnd || '');
  need(/^\d{4}-(0[1-9]|1[0-2])$/.test(periodStart) && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodEnd) && periodStart <= periodEnd,
    400, 'INVALID_PERIOD', 'Informe o período de apuração autorizado.');
  // Valores estimados por tese (opcionais) e link do contrato para assinatura eletrônica (VaultSign por enquanto).
  const values = body.values || {};
  need(values && typeof values === 'object' && !Array.isArray(values) && Object.entries(values).every(([id, v]) => ids.includes(id) && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e12),
    400, 'INVALID_VALUES', 'Valores estimados inválidos.');
  let contract = null;
  if (body.contractUrl) {
    let u; try { u = new URL(String(body.contractUrl)); } catch { u = null; }
    need(u && u.protocol === 'https:' && !u.username && !u.password && String(body.contractUrl).length <= 2000, 400, 'INVALID_CONTRACT_URL', 'Informe o link HTTPS do contrato para assinatura.');
    contract = { provider: String(body.contractProvider || 'VaultSign').slice(0, 40), url: u.href };
  }
  const snapshot = {
    version: 1, contract, catalogVersion: Diag.VERSAO, taxpayer: { name: c.legal_name, cnpj: c.cnpj },
    terms: TERMS, scope: 'administrative_recovery', periodStart, periodEnd,
    theses: ids.map(id => {
      const t = Regras.TESES.find(t => t.id === id), d = Diag.de(id) || {};
      const originalColor = d.seguranca || 'amarelo', override = overrides[id];
      const changed = override && override.color !== originalColor;
      return { id, name: t.nome, tax: t.tributo, originalColor, color: changed ? override.color : originalColor,
        riskEdit: changed ? { reason: override.reason.trim(), by: ctx.user.name, userId: ctx.user.id, at: new Date().toISOString() } : null,
        maturity: d.maturidade || 'em_validacao',
        legalBasis: d.base || '', ref: d.ref || '', precedent: d.precedente || '', note: d.nota || '', documents: d.docs || [],
        value: values[id] === undefined ? null : Math.round(Number(values[id]) * 100) / 100,
        applicability: Regras.avaliar(t, cliente).estado };
    })
  };
  const token = randomToken(32), digest = hashSession(token);
  const snapshotHash = hashSession(JSON.stringify(snapshot));
  const url = baseUrl() + '/aprovacao.html#' + token;
  const row = (await sql`insert into client_authorizations (organization_id, tax_case_id, created_by, token_hash, snapshot, snapshot_hash, expires_at)
    values (${ctx.organization.id}, ${caseId}, ${ctx.user.id}, ${digest}, ${JSON.stringify(snapshot)}::jsonb, ${snapshotHash}, now() + interval '7 days')
    returning id, expires_at`)[0];
  await audit('client.authorization.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: caseId, metadata: { authorization_id: row.id, snapshot_hash: snapshotHash } });
  return { id: row.id, url, expiresAt: row.expires_at };
}
async function list(ctx, caseId) {
  need(uuidOk(caseId), 404, 'NOT_FOUND', 'Caso não encontrado.');
  const rows = await getSql()`select id, snapshot, snapshot_hash, expires_at, revoked_at, accepted_at, representative_name, representative_email, representative_role, selected_theses, created_at
    from client_authorizations where tax_case_id = ${caseId} and organization_id = ${ctx.organization.id} order by created_at desc`;
  return { authorizations: rows };
}
async function revoke(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Autorização não encontrada.');
  const rows = await getSql()`update client_authorizations set revoked_at = coalesce(revoked_at, now())
    where id = ${id} and organization_id = ${ctx.organization.id} returning tax_case_id`;
  need(rows.length, 404, 'NOT_FOUND', 'Autorização não encontrada.');
  await audit('client.authorization.revoked', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: rows[0].tax_case_id, metadata: { authorization_id: id } });
  return { ok: true };
}
async function publicContext(req) {
  const token = String(req.headers['x-approval-token'] || '');
  need(/^[A-Za-z0-9_-]{43}$/.test(token), 404, 'INVALID_LINK', 'Link inválido ou indisponível.');
  const sql = getSql();
  const origin = req.headers.origin;
  need(!origin || origin === baseUrl(), 403, 'INVALID_ORIGIN', 'Origem inválida.');
  const digest = hashSession(token);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const ipLimited = await hit(sql, 'approval-ip:' + hashSession(ip), 240, 15);
  const limited = ipLimited || await hit(sql, 'approval:' + digest, 120, 15);
  need(!limited, 429, 'RATE_LIMITED', 'Muitas tentativas. Tente novamente mais tarde.');
  const row = (await sql`select a.* from client_authorizations a join tax_cases c on c.id = a.tax_case_id
    join organizations o on o.id = a.organization_id
    where a.token_hash = ${digest} and a.revoked_at is null and a.expires_at > now()
      and c.status <> 'archived' and o.status = 'active'`)[0];
  need(row, 404, 'INVALID_LINK', 'Link inválido, expirado ou revogado.');
  return { sql, row };
}
function view(row) {
  return { snapshot: row.snapshot, snapshotHash: row.snapshot_hash, expiresAt: row.expires_at,
    acceptedAt: row.accepted_at, selectedTheses: row.selected_theses || [] };
}
async function readPublic(req) { return view((await publicContext(req)).row); }
async function acceptPublic(req, body) {
  const { sql, row } = await publicContext(req);
  need(!row.accepted_at, 409, 'ALREADY_ACCEPTED', 'Autorização já registrada. Solicite um novo link para mudar a seleção.');
  need(body.snapshotHash === row.snapshot_hash, 409, 'SNAPSHOT_CHANGED', 'Recarregue e confira o diagnóstico.');
  need(body.acceptedTerms === true, 400, 'TERMS_REQUIRED', 'Confirme a autorização e as ressalvas.');
  const ids = body.selectedTheses;
  need(Array.isArray(ids) && ids.length > 0 && ids.length <= row.snapshot.theses.length && new Set(ids).size === ids.length && ids.every(id => row.snapshot.theses.some(t => t.id === id)), 400, 'INVALID_THESES', 'Selecione pelo menos uma tese apresentada, sem duplicações.');
  const name = String(body.name || '').trim(), email = normalizeEmail(body.email), role = String(body.role || '').trim();
  need(name.length >= 3 && name.length <= 240 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 && role.length >= 3 && role.length <= 240,
    400, 'IDENTITY_REQUIRED', 'Informe nome, e-mail e vínculo/poder de representação.');
  // A decisão é gravada em uma única atualização condicional: concorrência não sobrescreve a autorização.
  const done = (await sql`update client_authorizations set accepted_at = now(), representative_name = ${name}, representative_email = ${email},
    representative_role = ${role}, selected_theses = ${JSON.stringify(ids)}::jsonb
    where id = ${row.id} and accepted_at is null and revoked_at is null and expires_at > now()
      and exists (select 1 from tax_cases c join organizations o on o.id = c.organization_id
        where c.id = client_authorizations.tax_case_id and c.status <> 'archived' and o.status = 'active')
    returning accepted_at`)[0];
  need(done, 409, 'LINK_UNAVAILABLE', 'O link não permite mais registrar autorização.');
  const total = row.snapshot.theses.filter((t) => ids.includes(t.id)).reduce((a, t) => a + (Number(t.value) || 0), 0);
  await audit('client.authorization.accepted', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id,
    metadata: { authorization_id: row.id, snapshot_hash: row.snapshot_hash, selected_theses: ids, total } });
  const emails = await notificar(sql, row, { name, email, role, ids, total, acceptedAt: done.accepted_at });
  return { receiptId: row.id, acceptedAt: done.accepted_at, selectedTheses: ids, scope: row.snapshot.scope, total,
    contract: row.snapshot.contract || null, emails };
}
// E-mails após a aprovação (melhor esforço: a aprovação vale mesmo se o envio falhar; o resultado fica na auditoria).
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROT = { verde: 'Provável', amarelo: 'Possível', vermelho: 'Remoto' };
async function notificar(sql, row, a) {
  const s = row.snapshot, teses = s.theses.filter((t) => a.ids.includes(t.id));
  const linhas = teses.map((t) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e0d6">${esc(t.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #e4e0d6">${ROT[t.color] || ''}</td><td style="padding:6px 0;border-bottom:1px solid #e4e0d6;text-align:right">${t.value == null ? 'a dimensionar' : brl(t.value)}</td></tr>`).join('');
  const tabela = `<table style="border-collapse:collapse;width:100%;font-size:14px">${linhas}<tr><td style="padding:8px 0"><b>Total estimado</b></td><td></td><td style="padding:8px 0;text-align:right"><b>${brl(a.total)}</b></td></tr></table>`;
  const contrato = s.contract ? `<p>Próximo passo: assinatura eletrônica do contrato.<br><a href="${esc(s.contract.url)}">Assinar o contrato (${esc(s.contract.provider)})</a></p>` : '<p>Próximo passo: a equipe Argus Prime enviará o contrato para assinatura eletrônica.</p>';
  const resultado = { cliente: 'nao_enviado', equipe: 'nao_enviado' };
  try {
    await mailer.sendGraphMail({ to: a.email, subject: `Aprovação registrada · ${s.taxpayer.name}`,
      html: `<p>Olá, ${esc(a.name)}.</p><p>Registramos a aprovação das teses abaixo em ${new Date(a.acceptedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Protocolo ${esc(row.id)}.</p>${tabela}<p style="color:#6e7773;font-size:12px">Valores estimados, sujeitos à revisão técnica e à atualização pela Selic. A aprovação não reconhece crédito.</p>${contrato}<p>Reversa Tax · uma solução Argus Prime</p>` });
    resultado.cliente = 'enviado';
  } catch (e) { resultado.cliente = 'falhou: ' + String(e.message || e).slice(0, 80); }
  try {
    const autor = (await sql`select email, name from users where id = ${row.created_by}`)[0];
    if (autor && autor.email) {
      await mailer.sendGraphMail({ to: autor.email, subject: `Cliente aprovou teses · ${s.taxpayer.name}`,
        html: `<p>${esc(a.name)} (${esc(a.role)}, ${esc(a.email)}) aprovou ${teses.length} tese(s) de ${esc(s.taxpayer.name)}.</p>${tabela}<p>${s.contract ? 'O cliente foi direcionado para assinar o contrato.' : 'Envie o contrato para assinatura.'} Gere o diagnóstico das teses aprovadas na pasta do cliente.</p>` });
      resultado.equipe = 'enviado';
    }
  } catch (e) { resultado.equipe = 'falhou: ' + String(e.message || e).slice(0, 80); }
  await audit('client.authorization.notified', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id,
    metadata: { authorization_id: row.id, ...resultado } });
  return resultado;
}

// Última autorização do caso (aprovada, se houver): base dos valores e das teses aprovadas no relatório.
async function ultima(organizationId, caseId) {
  const rows = await getSql()`select id, snapshot, selected_theses, accepted_at, representative_name from client_authorizations
    where tax_case_id = ${caseId} and organization_id = ${organizationId} and revoked_at is null
    order by (accepted_at is not null) desc, created_at desc limit 1`;
  return rows[0] || null;
}
function linkValido(url) {
  try { return typeof url === 'string' && url.startsWith(baseUrl() + '/aprovacao.html#') && /#[A-Za-z0-9_-]{43}$/.test(url); } catch { return false; }
}

module.exports = { create, list, revoke, readPublic, acceptPublic, ultima, linkValido };
