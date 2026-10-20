const crypto = require('node:crypto');
const { getSql } = require('../db');
const { HttpError } = require('../authz');
const { audit } = require('../audit');
const { randomToken, hashSession, normalizeEmail } = require('../security');
const { hit } = require('../rate-limit');
const mailer = require('../mailer');
const Regras = require('../../teses-regras');
const Diag = require('../../teses-diagnostico');
const Contrato = require('../contrato');

const TERMS = 'Declaro ter poderes para representar a empresa, que li o contrato de prestação de serviços apresentado e que concordo com seus termos. As oportunidades sem oposição seguem para validação técnica e implementação pela via administrativa; as estimativas do diagnóstico não constituem garantia de resultado. Aceito a assinatura eletrônica com confirmação por código enviado ao meu e-mail.';
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
  const ids = body.theses === undefined ? Regras.TESES.map(t => t.id).filter(id => ((body.risks || {})[id]?.color || Diag.de(id)?.seguranca || 'amarelo') !== 'vermelho') : body.theses;
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
  // Contrato padrão: a Argus Prime figura sempre como contratada; honorários de 25% sobre o proveito econômico.
  const contract = { model: Contrato.VERSAO, fee: Contrato.HONORARIOS, contratada: Contrato.CONTRATADA };
  const snapshot = {
    version: 2, contract, catalogVersion: Diag.VERSAO, taxpayer: { name: c.legal_name, cnpj: c.cnpj },
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
    }).filter(t => t.color !== 'vermelho') // teses remotas nunca vão ao cliente
  };
  need(snapshot.theses.length > 0, 400, 'INVALID_THESES', 'Nenhuma tese provável ou possível para apresentar.');
  const token = randomToken(32), digest = hashSession(token);
  const snapshotHash = hashSession(JSON.stringify(snapshot));
  const url = baseUrl() + '/aprovacao.html#' + token;
  const row = (await sql`insert into client_authorizations (organization_id, tax_case_id, created_by, token_hash, snapshot, snapshot_hash, expires_at)
    values (${ctx.organization.id}, ${caseId}, ${ctx.user.id}, ${digest}, ${JSON.stringify(snapshot)}::jsonb, ${snapshotHash}, now() + interval '7 days')
    returning id, expires_at`)[0];
  await audit('client.authorization.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: caseId, metadata: { authorization_id: row.id, snapshot_hash: snapshotHash } });
  // Contrato enviado para assinatura leva o caso à fase "Aguardando autorização" no CRM.
  const adv = (await sql`update tax_cases c set commercial_stage = 'aguardando_autorizacao', updated_at = now() from (select commercial_stage as de from tax_cases where id = ${caseId}) v
    where c.id = ${caseId} and c.organization_id = ${ctx.organization.id} and c.commercial_stage in ('a_apresentar', 'apresentado') returning v.de`)[0];
  if (adv) await audit('case.stage_changed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: caseId, metadata: { from: adv.de, to: 'aguardando_autorizacao', by: ctx.user.name + ' (contrato enviado)' } });
  if (adv) await require('./history').registrarMudancas(ctx, { orgId: ctx.organization.id, caseId, taxpayerId: null, kind: 'fase' }, [{ field: 'fase', old: adv.de, new: 'aguardando_autorizacao' }]);
  return { id: row.id, url, expiresAt: row.expires_at };
}
async function list(ctx, caseId) {
  need(uuidOk(caseId), 404, 'NOT_FOUND', 'Caso não encontrado.');
  const rows = await getSql()`select id, snapshot, snapshot_hash, expires_at, revoked_at, accepted_at, representative_name, representative_email, representative_role, representative_cpf, selected_theses, opposed_theses, contract_hash, signer_ip, created_at
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
// O cliente não vê classificação, cor nem valores: só o nome, o grupo e a referência de cada tese.
function view(row) {
  const s = row.snapshot;
  return { version: s.version, taxpayer: s.taxpayer, periodStart: s.periodStart, periodEnd: s.periodEnd, terms: s.terms,
    theses: s.theses.map((t) => ({ id: t.id, name: t.name, tax: t.tax, ref: t.ref || t.legalBasis || '' })),
    contract: s.contract ? { model: s.contract.model, fee: s.contract.fee } : null,
    snapshotHash: row.snapshot_hash, expiresAt: row.expires_at, acceptedAt: row.accepted_at,
    opposedTheses: row.opposed_theses || [], selectedTheses: row.selected_theses || [] };
}
async function readPublic(req) { return view((await publicContext(req)).row); }

function opostas(row, body) {
  const ids = body.opposedTheses === undefined ? [] : body.opposedTheses;
  need(Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => row.snapshot.theses.some(t => t.id === id)), 400, 'INVALID_THESES', 'Oposições inválidas.');
  const aceitas = row.snapshot.theses.map(t => t.id).filter(id => !ids.includes(id));
  need(aceitas.length > 0, 400, 'ALL_OPPOSED', 'Todas as oportunidades estão com oposição: não há objeto para o contrato. Fale com a equipe Argus Prime.');
  return { opostas: ids, aceitas };
}
function previaDe(row, body) {
  const { opostas: op, aceitas } = opostas(row, body);
  const conteudo = Contrato.montar(row.snapshot, aceitas);
  return { opostas: op, aceitas, conteudo, hash: Contrato.impressao(conteudo) };
}
// Prévia do contrato conforme as oposições marcadas (o objeto muda entre fiscal, previdenciário ou ambos).
async function previewPublic(req, body) {
  const { row } = await publicContext(req);
  need(row.snapshot.contract, 409, 'NO_CONTRACT', 'Este link não tem contrato. Solicite um novo link à equipe.');
  const p = previaDe(row, body);
  return { contract: p.conteudo, contractHash: p.hash, accepted: p.aceitas, opposed: p.opostas };
}
const cpfOk = (c) => {
  c = String(c || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
};
// Código de 6 dígitos enviado ao e-mail de quem vai assinar (válido por 15 minutos, 5 tentativas).
async function codePublic(req, body) {
  const { sql, row } = await publicContext(req);
  need(!row.accepted_at, 409, 'ALREADY_ACCEPTED', 'Contrato já assinado.');
  const email = normalizeEmail(body.email), name = String(body.name || '').trim();
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 && name.length >= 3 && name.length <= 240, 400, 'IDENTITY_REQUIRED', 'Informe nome e e-mail válidos.');
  need(!(await hit(sql, 'approval-otp:' + row.id, 5, 15)), 429, 'RATE_LIMITED', 'Muitos códigos solicitados. Aguarde alguns minutos.');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await sql`update client_authorizations set otp_hash = ${hashSession(row.id + ':' + code)}, otp_email = ${email},
    otp_expires_at = now() + interval '15 minutes', otp_attempts = 0 where id = ${row.id} and accepted_at is null`;
  const html = `<p>Olá, ${esc(name)}.</p><p>Seu código para assinar o contrato de ${esc(row.snapshot.taxpayer.name)} é:</p><p style="font-size:26px;letter-spacing:.3em;font-weight:700">${code}</p><p>O código vale por 15 minutos. Se você não solicitou, ignore este e-mail.</p><p>Argus Prime · Reversa Tax</p>`;
  let enviado = false;
  try { await mailer.sendGraphMail({ to: email, subject: `Código de assinatura · ${row.snapshot.taxpayer.name}`, html }); enviado = true; }
  catch (e) { if (process.env.REVERSA_DEV_OTP !== '1') throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Não foi possível enviar o código agora. Tente novamente em instantes.'); }
  await audit('client.contract.code_sent', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id, metadata: { authorization_id: row.id, email } });
  return { sent: enviado, email, ...(process.env.REVERSA_DEV_OTP === '1' ? { devCode: code } : {}) };
}
async function acceptPublic(req, body) {
  const { sql, row } = await publicContext(req);
  need(!row.accepted_at, 409, 'ALREADY_ACCEPTED', 'Contrato já assinado. Para mudar, solicite um novo link à equipe.');
  need(row.snapshot.contract, 409, 'NO_CONTRACT', 'Este link não tem contrato. Solicite um novo link à equipe.');
  need(body.snapshotHash === row.snapshot_hash, 409, 'SNAPSHOT_CHANGED', 'Recarregue a página e confira as oportunidades.');
  need(body.acceptedTerms === true, 400, 'TERMS_REQUIRED', 'Confirme que leu e concorda com o contrato.');
  const p = previaDe(row, body);
  need(body.contractHash === p.hash, 409, 'CONTRACT_CHANGED', 'O contrato mudou desde a leitura. Revise e assine novamente.');
  const name = String(body.name || '').trim(), email = normalizeEmail(body.email), role = String(body.role || '').trim();
  const cpf = String(body.cpf || '').replace(/\D/g, '');
  need(name.length >= 3 && name.length <= 240 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 && role.length >= 3 && role.length <= 240,
    400, 'IDENTITY_REQUIRED', 'Informe nome, e-mail e cargo.');
  need(cpfOk(cpf), 400, 'INVALID_CPF', 'CPF inválido.');
  // Código: mesmo e-mail, dentro do prazo, no máximo 5 tentativas.
  const otp = (await sql`update client_authorizations set otp_attempts = otp_attempts + 1 where id = ${row.id}
    returning otp_hash, otp_email, otp_expires_at > now() as vivo, otp_attempts`)[0];
  need(otp && otp.otp_hash && otp.vivo && otp.otp_attempts <= 5, 400, 'CODE_EXPIRED', 'Código expirado ou tentativas esgotadas. Solicite um novo código.');
  need(otp.otp_email === email, 400, 'CODE_EMAIL', 'Use o mesmo e-mail que recebeu o código.');
  need(otp.otp_hash === hashSession(row.id + ':' + String(body.code || '').trim()), 400, 'INVALID_CODE', 'Código incorreto.');
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 80);
  const ua = String(req.headers['user-agent'] || '').slice(0, 400);
  // A decisão é gravada em uma única atualização condicional: concorrência não sobrescreve a assinatura.
  const done = (await sql`update client_authorizations set accepted_at = now(), representative_name = ${name}, representative_email = ${email},
    representative_role = ${role}, representative_cpf = ${cpf}, selected_theses = ${JSON.stringify(p.aceitas)}::jsonb,
    opposed_theses = ${JSON.stringify(p.opostas)}::jsonb, contract_hash = ${p.hash}, signer_ip = ${ip}, signer_user_agent = ${ua}, otp_hash = null
    where id = ${row.id} and accepted_at is null and revoked_at is null and expires_at > now()
      and exists (select 1 from tax_cases c join organizations o on o.id = c.organization_id
        where c.id = client_authorizations.tax_case_id and c.status <> 'archived' and o.status = 'active')
    returning accepted_at`)[0];
  need(done, 409, 'LINK_UNAVAILABLE', 'O link não permite mais registrar a assinatura.');
  const total = row.snapshot.theses.filter((t) => p.aceitas.includes(t.id)).reduce((a, t) => a + (Number(t.value) || 0), 0);
  await audit('client.contract.signed', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id,
    metadata: { authorization_id: row.id, snapshot_hash: row.snapshot_hash, contract_hash: p.hash, selected_theses: p.aceitas, opposed_theses: p.opostas, total, ip } });
  // Contrato assinado leva o caso à fase "Contrato" no CRM.
  const mov = (await sql`update tax_cases c set commercial_stage = 'contrato', updated_at = now() from (select commercial_stage as de from tax_cases where id = ${row.tax_case_id}) v
    where c.id = ${row.tax_case_id} and c.organization_id = ${row.organization_id} and c.commercial_stage in ('a_apresentar', 'apresentado', 'aguardando_autorizacao') returning v.de`)[0];
  if (mov) await audit('case.stage_changed', { organizationId: row.organization_id, entityType: 'tax_case', entityId: row.tax_case_id, metadata: { from: mov.de, to: 'contrato', by: name + ' (assinatura do contrato)' } });
  if (mov) await require('./history').registrarSistema({ orgId: row.organization_id, caseId: row.tax_case_id, kind: 'fase', field: 'fase', old: mov.de, nu: 'contrato', nome: name + ' (assinatura do contrato)' });
  const emails = await notificar(sql, row, { name, email, role, ids: p.aceitas, opostas: p.opostas, total, acceptedAt: done.accepted_at, hash: p.hash });
  return { receiptId: row.id, acceptedAt: done.accepted_at, selectedTheses: p.aceitas, opposedTheses: p.opostas, contractHash: p.hash, emails };
}
function assinaturaDe(row) {
  return { nome: row.representative_name, cpf: row.representative_cpf, cargo: row.representative_role, email: row.representative_email,
    em: row.accepted_at, ip: row.signer_ip, protocolo: row.id, hash: row.contract_hash };
}
// PDF: minuta conforme as oposições marcadas, ou o contrato assinado com o registro de assinatura.
async function pdfPublic(req, body) {
  const { row } = await publicContext(req);
  need(row.snapshot.contract, 409, 'NO_CONTRACT', 'Este link não tem contrato.');
  if (row.accepted_at && row.contract_hash) {
    const conteudo = Contrato.montar(row.snapshot, row.selected_theses || []);
    return { nome: 'Contrato-assinado-' + row.snapshot.taxpayer.cnpj + '.pdf', pdf: await Contrato.pdf(conteudo, assinaturaDe(row)) };
  }
  return { nome: 'Minuta-contrato-' + row.snapshot.taxpayer.cnpj + '.pdf', pdf: await Contrato.pdf(previaDe(row, body).conteudo, null) };
}
async function contractPdf(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Contrato não encontrado.');
  const row = (await getSql()`select * from client_authorizations where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(row && row.accepted_at && row.contract_hash, 404, 'NOT_FOUND', 'Contrato assinado não encontrado.');
  const conteudo = Contrato.montar(row.snapshot, row.selected_theses || []);
  return { nome: 'Contrato-assinado-' + row.snapshot.taxpayer.cnpj + '.pdf', pdf: await Contrato.pdf(conteudo, assinaturaDe(row)) };
}
// E-mails após a assinatura (melhor esforço: a assinatura vale mesmo se o envio falhar; o resultado fica na auditoria).
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function notificar(sql, row, a) {
  const s = row.snapshot, quando = new Date(a.acceptedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const nomes = (ids) => s.theses.filter((t) => ids.includes(t.id)).map((t) => esc(t.name));
  const resultado = { cliente: 'nao_enviado', equipe: 'nao_enviado' };
  try {
    await mailer.sendGraphMail({ to: a.email, subject: `Contrato assinado · ${s.taxpayer.name}`,
      html: `<p>Olá, ${esc(a.name)}.</p><p>O contrato de prestação de serviços tributários de ${esc(s.taxpayer.name)} foi assinado em ${quando}. Protocolo ${esc(row.id)}.</p><p>Impressão digital do conteúdo aceito: <code>${a.hash}</code></p><p>O contrato assinado pode ser baixado pelo mesmo link. Próximo passo: a equipe Argus Prime fará a validação técnica com a documentação da empresa.</p><p>Argus Prime · Reversa Tax</p>` });
    resultado.cliente = 'enviado';
  } catch (e) { resultado.cliente = 'falhou: ' + String(e.message || e).slice(0, 80); }
  try {
    const autor = (await sql`select email, name from users where id = ${row.created_by}`)[0];
    if (autor && autor.email) {
      const op = nomes(a.opostas);
      await mailer.sendGraphMail({ to: autor.email, subject: `Contrato assinado · ${s.taxpayer.name}`,
        html: `<p>${esc(a.name)} (${esc(a.role)}, ${esc(a.email)}) assinou o contrato de ${esc(s.taxpayer.name)} em ${quando}.</p><p><b>Seguem para o trabalho (${a.ids.length}):</b><br>${nomes(a.ids).join('<br>')}</p>${op.length ? `<p><b>Com oposição (${op.length}):</b><br>${op.join('<br>')}</p>` : '<p>Nenhuma oposição.</p>'}<p>Total estimado sem oposição: ${brl(a.total)}. O caso foi movido para Contrato no CRM.</p>` });
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

module.exports = { create, list, revoke, readPublic, previewPublic, codePublic, acceptPublic, pdfPublic, contractPdf, ultima, linkValido };
