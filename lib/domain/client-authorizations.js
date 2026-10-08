const crypto = require('node:crypto');
const { getSql } = require('../db');
const { HttpError } = require('../authz');
const { audit } = require('../audit');
const { randomToken, hashSession, normalizeEmail } = require('../security');
const { hit } = require('../rate-limit');
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
  need(Array.isArray(ids) && ids.length > 0 && ids.length <= 60 && new Set(ids).size === ids.length && ids.every(id => Regras.TESES.some(t => t.id === id)), 400, 'INVALID_THESES', 'Selecione teses válidas, sem duplicações.');
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
  const snapshot = {
    version: 1, catalogVersion: Diag.VERSAO, taxpayer: { name: c.legal_name, cnpj: c.cnpj },
    terms: TERMS, scope: 'administrative_recovery', periodStart, periodEnd,
    theses: ids.map(id => {
      const t = Regras.TESES.find(t => t.id === id), d = Diag.de(id) || {};
      const originalColor = d.seguranca || 'amarelo', override = overrides[id];
      const changed = override && override.color !== originalColor;
      return { id, name: t.nome, tax: t.tributo, originalColor, color: changed ? override.color : originalColor,
        riskEdit: changed ? { reason: override.reason.trim(), by: ctx.user.name, userId: ctx.user.id, at: new Date().toISOString() } : null,
        maturity: d.maturidade || 'em_validacao',
        legalBasis: d.base || '', precedent: d.precedente || '', note: d.nota || '', documents: d.docs || [],
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
  await audit('client.authorization.accepted', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id,
    metadata: { authorization_id: row.id, snapshot_hash: row.snapshot_hash, selected_theses: ids } });
  return { receiptId: row.id, acceptedAt: done.accepted_at, selectedTheses: ids, scope: row.snapshot.scope };
}
module.exports = { create, list, revoke, readPublic, acceptPublic };
