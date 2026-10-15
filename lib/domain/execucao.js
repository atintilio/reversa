// Execução pós-contrato: retificação, aprovação (só master: André ou Moisés), validação do contador por link,
// transmissão e PER/DCOMP. Somente a plataforma (Argus Prime) acessa; o parceiro termina no envio do contrato.
const { getSql } = require('../db');
const { HttpError, masterEmails } = require('../authz');
const { audit } = require('../audit');
const { randomToken, hashSession, normalizeEmail } = require('../security');
const { hit } = require('../rate-limit');
const mailer = require('../mailer');

const FASES = ['contrato_assinado', 'apuracao_definitiva', 'retificacao_preparada', 'pre_validacao', 'aguardando_aprovacao',
  'aprovado', 'validacao_contador', 'transmitido', 'perdcomp', 'acompanhamento', 'concluido'];
const ROTULO = {
  contrato_assinado: 'Contrato assinado', apuracao_definitiva: 'Apuração definitiva', retificacao_preparada: 'Retificação preparada',
  pre_validacao: 'Pré-validação', aguardando_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado para transmissão',
  validacao_contador: 'Validação do contador', transmitido: 'Transmitido', perdcomp: 'PER/DCOMP transmitido',
  acompanhamento: 'Acompanhamento', concluido: 'Concluído', cancelado: 'Cancelado'
};
const RESPOSTAS = { validado: 'Validado', validado_assinado: 'Validado e assinado', com_ressalvas: 'Com ressalvas' };
const idx = (f) => FASES.indexOf(f);
const APROVADO = idx('aprovado');

function need(ok, status, code, message) { if (!ok) throw new HttpError(status, code, message); }
const uuidOk = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function baseUrl() {
  const u = new URL(process.env.APP_BASE_URL || '');
  need(u.protocol === 'https:' && !u.username && !u.password, 503, 'BASE_URL_REQUIRED', 'Configure APP_BASE_URL HTTPS.');
  return u.origin;
}

// Somente membros da plataforma; aprovar, transmitir, cancelar e enviar ao contador: só master.
async function plataforma(ctx, acao) {
  if (ctx.organization.kind === 'plataforma' && !ctx.user.legacy) return;
  await audit('authz.denied', { outcome: 'denied', organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { action: acao, role: ctx.role } });
  throw new HttpError(403, 'FORBIDDEN', 'A execução é exclusiva da equipe Argus Prime.');
}
async function soMaster(ctx, acao) {
  if (ctx.master) return;
  await audit('authz.denied', { outcome: 'denied', organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { action: acao, role: ctx.role } });
  throw new HttpError(403, 'FORBIDDEN', 'Somente André ou Moisés aprovam e avançam para a transmissão.');
}
function escrita(ctx) { need(['owner', 'admin', 'analyst'].includes(ctx.role), 403, 'FORBIDDEN', 'Seu perfil não permite esta ação.'); }

async function evento(sql, execId, kind, de, para, nota, ctx, rotulo) {
  await sql`insert into recovery_execution_events (execution_id, stage_from, stage_to, kind, note, actor_user_id, actor_label)
    values (${execId}, ${de}, ${para}, ${kind}, ${nota || null}, ${ctx ? ctx.user.id : null}, ${ctx ? ctx.user.name : (rotulo || null)})`;
}

function linha(r) {
  return { id: r.id, caseId: r.tax_case_id, fase: r.stage, faseRotulo: ROTULO[r.stage], resumo: r.summary || '', exigeContador: r.requires_accountant,
    cliente: { nome: r.legal_name, cnpj: r.cnpj }, parceiro: r.org_name, aprovadoPor: r.approved_name || null, aprovadoEm: r.approved_at,
    contador: { email: r.accountant_email, enviadoEm: r.accountant_sent_at, expiraEm: r.accountant_expires_at, abertoEm: r.accountant_opened_at, prazoResposta: r.accountant_opened_at ? prazo(r) : null, nome: r.accountant_name,
      resposta: r.accountant_response, respostaRotulo: RESPOSTAS[r.accountant_response] || null, comentario: r.accountant_comment, respondidoEm: r.accountant_responded_at },
    recibos: r.receipts || [], arquivos: r.artifacts || [], atualizadoEm: r.updated_at };
}
async function list(ctx) {
  await plataforma(ctx, 'execucao.list');
  const sql = getSql();
  const execucoes = (await sql`select e.*, t.legal_name, t.cnpj_normalized as cnpj, o.name as org_name, u.name as approved_name
    from recovery_executions e join tax_cases c on c.id = e.tax_case_id join taxpayers t on t.id = c.taxpayer_id
    join organizations o on o.id = e.case_organization_id left join users u on u.id = e.approved_by
    order by e.updated_at desc limit 500`).map(linha);
  // Casos com contrato (de qualquer parceiro) que ainda não entraram em execução.
  const candidatos = (await sql`select c.id, t.legal_name, t.cnpj_normalized as cnpj, o.name as org_name, c.updated_at
    from tax_cases c join taxpayers t on t.id = c.taxpayer_id join organizations o on o.id = c.organization_id
    where c.commercial_stage = 'contrato' and c.status <> 'archived'
      and not exists (select 1 from recovery_executions e where e.tax_case_id = c.id)
    order by c.updated_at desc limit 200`).map((r) => ({ caseId: r.id, cliente: { nome: r.legal_name, cnpj: r.cnpj }, parceiro: r.org_name }));
  return { execucoes, candidatos, fases: FASES.map((f) => ({ id: f, rotulo: ROTULO[f] })), podeAprovar: Boolean(ctx.master) };
}

async function get(ctx, id) {
  await plataforma(ctx, 'execucao.get');
  need(uuidOk(id), 404, 'NOT_FOUND', 'Execução não encontrada.');
  const sql = getSql();
  const r = (await sql`select e.*, t.legal_name, t.cnpj_normalized as cnpj, o.name as org_name, u.name as approved_name
    from recovery_executions e join tax_cases c on c.id = e.tax_case_id join taxpayers t on t.id = c.taxpayer_id
    join organizations o on o.id = e.case_organization_id left join users u on u.id = e.approved_by where e.id = ${id}`)[0];
  need(r, 404, 'NOT_FOUND', 'Execução não encontrada.');
  const eventos = await sql`select kind, stage_from, stage_to, note, actor_label, created_at from recovery_execution_events where execution_id = ${id} order by created_at, id`;
  return { ...linha(r), eventos: eventos.map((e) => ({ tipo: e.kind, de: ROTULO[e.stage_from] || null, para: ROTULO[e.stage_to] || null, nota: e.note, por: e.actor_label, em: e.created_at })),
    podeAprovar: Boolean(ctx.master) };
}

async function start(ctx, body = {}) {
  await plataforma(ctx, 'execucao.start'); escrita(ctx);
  need(uuidOk(body.caseId), 400, 'INVALID_CASE', 'Selecione um caso.');
  const sql = getSql();
  const c = (await sql`select id, organization_id, commercial_stage, status from tax_cases where id = ${body.caseId}`)[0];
  need(c && c.status !== 'archived', 404, 'NOT_FOUND', 'Caso não encontrado.');
  need(c.commercial_stage === 'contrato', 409, 'NO_CONTRACT', 'O caso precisa estar na fase de contrato.');
  need(body.contratoAssinado === true, 400, 'CONTRACT_NOT_SIGNED', 'A execução só começa com o contrato assinado. Confirme a assinatura.');
  const row = (await sql`insert into recovery_executions (tax_case_id, case_organization_id, created_by)
    values (${c.id}, ${c.organization_id}, ${ctx.user.id}) on conflict (tax_case_id) do nothing returning id`)[0];
  need(row, 409, 'ALREADY_STARTED', 'Este caso já está em execução.');
  await evento(sql, row.id, 'inicio', null, 'contrato_assinado', 'Contrato assinado confirmado; execução iniciada', ctx);
  await audit('execution.started', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: c.id, metadata: { execution_id: row.id } });
  return { id: row.id };
}

async function carregar(sql, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Execução não encontrada.');
  const e = (await sql`select * from recovery_executions where id = ${id}`)[0];
  need(e, 404, 'NOT_FOUND', 'Execução não encontrada.');
  return e;
}

// Resumo e exigência de contador: editáveis só antes da aprovação (depois, volte a fase para alterar).
async function update(ctx, id, body = {}) {
  await plataforma(ctx, 'execucao.update'); escrita(ctx);
  const sql = getSql(), e = await carregar(sql, id);
  need(e.stage !== 'cancelado' && idx(e.stage) < APROVADO, 409, 'LOCKED', 'Depois da aprovação o conteúdo fica travado. Volte a fase para alterar.');
  const resumo = body.resumo !== undefined ? String(body.resumo || '').trim().slice(0, 20000) : e.summary;
  const exige = body.exigeContador !== undefined ? body.exigeContador === true : e.requires_accountant;
  await sql`update recovery_executions set summary = ${resumo || null}, requires_accountant = ${exige}, updated_at = now() where id = ${id}`;
  await evento(sql, id, 'edicao', null, null, exige !== e.requires_accountant ? (exige ? 'Passa a exigir validação do contador' : 'Deixa de exigir validação do contador') : 'Resumo atualizado', ctx);
  return { ok: true };
}

async function advance(ctx, id, body = {}) {
  await plataforma(ctx, 'execucao.advance'); escrita(ctx);
  const sql = getSql(), e = await carregar(sql, id);
  const para = String(body.para || ''), nota = String(body.nota || '').trim().slice(0, 2000);
  need(e.stage !== 'cancelado' && e.stage !== 'concluido', 409, 'CLOSED', 'Execução encerrada.');
  if (para === 'cancelado') {
    await soMaster(ctx, 'execucao.cancel');
    need(nota.length >= 5, 400, 'NOTE_REQUIRED', 'Informe o motivo do cancelamento.');
  } else {
    need(FASES.includes(para) && para !== e.stage, 400, 'INVALID_STAGE', 'Fase inválida.');
    need(para !== 'validacao_contador', 400, 'USE_ACCOUNTANT', 'Use "Enviar ao contador" para esta fase.');
    const de = idx(e.stage), ate = idx(para);
    if (ate < de) {
      // Voltar: depois da aprovação só master volta, e a aprovação é desfeita.
      if (de >= APROVADO) await soMaster(ctx, 'execucao.back');
      need(ate < APROVADO || ctx.master, 403, 'FORBIDDEN', 'Somente André ou Moisés.');
      need(nota.length >= 5, 400, 'NOTE_REQUIRED', 'Informe o motivo para voltar a fase.');
    } else {
      const proxima = FASES[de + 1] === 'validacao_contador' && !e.requires_accountant ? FASES[de + 2] : FASES[de + 1];
      need(para === proxima, 409, 'SKIP_NOT_ALLOWED', 'Avance uma fase de cada vez.');
      if (ate >= APROVADO) await soMaster(ctx, 'execucao.approve');
      if (para === 'aprovado') need(String(e.summary || '').trim().length >= 10, 409, 'SUMMARY_REQUIRED', 'Registre o resumo da retificação antes de aprovar.');
      if (para === 'aguardando_aprovacao' || para === 'aprovado') need(!(e.artifacts || []).some((a) => a.validacao && a.validacao.erros > 0), 409, 'VALIDATION_ERRORS', 'Há arquivo com erro na pré-validação. Corrija e registre de novo antes de seguir.');
      if (para === 'transmitido' && e.requires_accountant) need(e.accountant_response === 'validado_assinado', 409, 'ACCOUNTANT_PENDING', 'Aguarde o contador responder "Validado e assinado".');
    }
  }
  let recibos = e.receipts || [];
  if (para === 'transmitido' || para === 'perdcomp') {
    const numero = String(body.recibo || '').trim();
    need(/^[\w./-]{5,80}$/.test(numero), 400, 'RECEIPT_REQUIRED', 'Informe o número do recibo da transmissão.');
    recibos = recibos.concat([{ tipo: para === 'perdcomp' ? 'PER/DCOMP' : 'Retificação', numero, em: new Date().toISOString(), por: ctx.user.name }]);
  }
  const voltaAntesDaAprovacao = para !== 'cancelado' && idx(para) < APROVADO;
  const aprova = para === 'aprovado' && idx(e.stage) < APROVADO;
  await sql`update recovery_executions set stage = ${para}, receipts = ${JSON.stringify(recibos)}::jsonb, updated_at = now(),
    approved_by = ${aprova ? ctx.user.id : (voltaAntesDaAprovacao ? null : e.approved_by)},
    approved_at = ${aprova ? new Date().toISOString() : (voltaAntesDaAprovacao ? null : e.approved_at)},
    accountant_token_hash = ${voltaAntesDaAprovacao ? null : e.accountant_token_hash},
    accountant_response = ${voltaAntesDaAprovacao ? null : e.accountant_response}
    where id = ${id}`;
  await evento(sql, id, aprova ? 'aprovacao' : (para === 'cancelado' ? 'cancelamento' : 'fase'), e.stage, para,
    nota || (recibos.length !== (e.receipts || []).length ? 'Recibo ' + recibos[recibos.length - 1].numero : null), ctx);
  await audit(aprova ? 'execution.approved' : 'execution.stage', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: e.tax_case_id,
    metadata: { execution_id: id, from: e.stage, to: para } });
  return { ok: true, fase: para };
}

// Envia ao contador o link de validação (o token fica só no fragmento da URL; no banco, só o hash).
async function sendAccountant(ctx, id, body = {}) {
  await plataforma(ctx, 'execucao.accountant'); await soMaster(ctx, 'execucao.accountant');
  const sql = getSql(), e = await carregar(sql, id);
  need(e.requires_accountant, 409, 'NOT_REQUIRED', 'Esta execução não exige validação do contador.');
  need(e.stage === 'aprovado' || e.stage === 'validacao_contador', 409, 'NOT_APPROVED', 'Aprove a retificação antes de enviar ao contador.');
  const email = normalizeEmail(body.email);
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254, 400, 'INVALID_EMAIL', 'Informe o e-mail do contador.');
  const token = randomToken(32), url = baseUrl() + '/validacao-contador.html#' + token;
  await sql`update recovery_executions set stage = 'validacao_contador', accountant_email = ${email}, accountant_token_hash = ${hashSession(token)},
    accountant_sent_at = now(), accountant_expires_at = now() + interval '2 days', accountant_opened_at = null, accountant_name = null, accountant_response = null,
    accountant_comment = null, accountant_responded_at = null, updated_at = now() where id = ${id}`;
  await evento(sql, id, 'contador_enviado', e.stage, 'validacao_contador', 'Link enviado para ' + email, ctx);
  const cli = (await sql`select t.legal_name from tax_cases c join taxpayers t on t.id = c.taxpayer_id where c.id = ${e.tax_case_id}`)[0];
  let envio = 'enviado';
  try {
    await mailer.sendGraphMail({ to: email, subject: `Validação de retificação · ${cli.legal_name}`,
      html: `<p>Olá.</p><p>O time técnico Argus Prime preparou a retificação de <b>${esc(cli.legal_name)}</b> e pede a sua validação como contador responsável.</p>
        <p><a href="${esc(url)}">Abrir a página de validação</a></p><p style="color:#6e7773;font-size:12px">Link exclusivo. O prazo para registrar a resposta é de 12 horas a partir da abertura. Não encaminhe.</p><p>Reversa Tax · uma solução Argus Prime</p>` });
  } catch (err) { envio = 'falhou: ' + String(err.message || err).slice(0, 80); }
  await audit('execution.accountant.sent', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: e.tax_case_id, metadata: { execution_id: id, email: envio } });
  return { url, email: envio };
}

// Arquivos gerados no navegador (o SPED não sobe): registra só o resumo, os hashes e o resultado da pré-validação.
const num = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : 0; };
const txt = (v, n) => String(v == null ? '' : v).slice(0, n);
function arquivoValido(a) {
  return a && typeof a === 'object' && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(a.competencia || '')) && /^[0-9a-f]{64}$/.test(String(a.shaOriginal || '')) && /^[0-9a-f]{64}$/.test(String(a.shaRetificada || ''));
}
function apur(x) {
  x = x || {};
  return { aRecolherOriginal: num(x.aRecolherOriginal), aRecolherRetificado: num(x.aRecolherRetificado), diferenca: num(x.diferenca),
    codigosReceita: (Array.isArray(x.codigosReceita) ? x.codigosReceita : []).slice(0, 20).map((c) => ({ campo: txt(c.campo, 2), codigo: txt(c.codigo, 10), valor: num(c.valor) })) };
}
async function registerFiles(ctx, id, body = {}) {
  await plataforma(ctx, 'execucao.files'); escrita(ctx);
  const sql = getSql(), e = await carregar(sql, id);
  need(['apuracao_definitiva', 'retificacao_preparada', 'pre_validacao'].includes(e.stage), 409, 'LOCKED', 'Registre os arquivos entre a apuração definitiva e a pré-validação.');
  const lista = body.arquivos;
  need(Array.isArray(lista) && lista.length > 0 && lista.length <= 120 && lista.every(arquivoValido), 400, 'INVALID_FILES', 'Arquivos inválidos.');
  const novos = lista.map((a) => a.tipo === 'esocial' ? ({
    tipo: 'eSocial retificação', nome: txt(a.nome, 200), competencia: a.competencia, cnpj: txt(a.cnpj, 14).replace(/\D/g, ''),
    shaOriginal: a.shaOriginal, shaRetificada: a.shaRetificada, teses: (Array.isArray(a.teses) ? a.teses : []).slice(0, 20).map((t) => txt(t, 40)),
    itensAlterados: num(a.itensAlterados), eventos: num(a.eventos),
    apuracao: { previdenciario: { baseRetirada: num(a.apuracao && a.apuracao.previdenciario && a.apuracao.previdenciario.baseRetirada),
      contribuicaoEstimada: num(a.apuracao && a.apuracao.previdenciario && a.apuracao.previdenciario.contribuicaoEstimada) } },
    validacao: { erros: num(a.validacao && a.validacao.erros), avisos: num(a.validacao && a.validacao.avisos), versao: txt(a.validacao && a.validacao.versao, 20),
      mensagens: (Array.isArray(a.validacao && a.validacao.mensagens) ? a.validacao.mensagens : []).slice(0, 30).map((m) => txt(m, 300)) },
    geradoEm: new Date().toISOString(), por: ctx.user.name
  }) : ({
    tipo: 'EFD-Contribuições retificadora', nome: txt(a.nome, 200), competencia: a.competencia, cnpj: txt(a.cnpj, 14).replace(/\D/g, ''),
    reciboOriginal: txt(a.reciboOriginal, 60), shaOriginal: a.shaOriginal, shaRetificada: a.shaRetificada,
    teses: (Array.isArray(a.teses) ? a.teses : []).slice(0, 10).map((t) => txt(t, 40)), itensAlterados: num(a.itensAlterados),
    apuracao: { pis: apur(a.apuracao && a.apuracao.pis), cofins: apur(a.apuracao && a.apuracao.cofins) },
    validacao: { erros: num(a.validacao && a.validacao.erros), avisos: num(a.validacao && a.validacao.avisos), versao: txt(a.validacao && a.validacao.versao, 20),
      mensagens: (Array.isArray(a.validacao && a.validacao.mensagens) ? a.validacao.mensagens : []).slice(0, 30).map((m) => txt(m, 300)) },
    geradoEm: new Date().toISOString(), por: ctx.user.name
  }));
  // Substitui a mesma competência (nova geração) e mantém as demais.
  const chave = (a) => a.tipo + '|' + a.competencia + '|' + a.cnpj;
  const comps = new Set(novos.map(chave));
  const lista2 = (e.artifacts || []).filter((a) => !comps.has(chave(a))).concat(novos)
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  await sql`update recovery_executions set artifacts = ${JSON.stringify(lista2)}::jsonb, updated_at = now() where id = ${id}`;
  const comErro = novos.filter((a) => a.validacao.erros > 0).length;
  await evento(sql, id, 'arquivos', null, null, novos.length + ' arquivo(s) registrado(s); ' + (comErro ? comErro + ' com erro na pré-validação' : 'pré-validação sem erros'), ctx);
  await audit('execution.files', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'tax_case', entityId: e.tax_case_id, metadata: { execution_id: id, files: novos.length, with_errors: comErro } });
  return { ok: true, arquivos: lista2.length, comErro };
}

// ---------------------------------------------------------------- página pública do contador
async function publico(req) {
  const token = String(req.headers['x-review-token'] || '');
  need(/^[A-Za-z0-9_-]{43}$/.test(token), 404, 'INVALID_LINK', 'Link inválido ou indisponível.');
  const origin = req.headers.origin;
  need(!origin || origin === baseUrl(), 403, 'INVALID_ORIGIN', 'Origem inválida.');
  const sql = getSql(), digest = hashSession(token);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const limitado = (await hit(sql, 'accountant-ip:' + hashSession(ip), 240, 15)) || (await hit(sql, 'accountant:' + digest, 120, 15));
  need(!limitado, 429, 'RATE_LIMITED', 'Muitas tentativas. Tente novamente mais tarde.');
  const e = (await sql`select e.*, t.legal_name, t.cnpj_normalized as cnpj, u.name as approved_name
    from recovery_executions e join tax_cases c on c.id = e.tax_case_id join taxpayers t on t.id = c.taxpayer_id
    left join users u on u.id = e.approved_by
    where e.accountant_token_hash = ${digest} and e.accountant_expires_at > now() and e.stage = 'validacao_contador'`)[0];
  need(e, 404, 'INVALID_LINK', 'Link inválido, expirado ou substituído por um novo envio.');
  if (!e.accountant_opened_at) {
    // A primeira abertura inicia o prazo de 12 horas para responder.
    e.accountant_opened_at = (await sql`update recovery_executions set accountant_opened_at = coalesce(accountant_opened_at, now()) where id = ${e.id} returning accountant_opened_at`)[0].accountant_opened_at;
    await evento(sql, e.id, 'contador_abriu', null, null, 'Contador abriu o link; prazo de 12 horas iniciado', null, 'Contador');
  }
  e.prazo = prazo(e);
  return { sql, e };
}
const DOZE_HORAS = 12 * 3600 * 1000;
function prazo(e) {
  if (!e.accountant_opened_at) return e.accountant_expires_at;
  return new Date(Math.min(new Date(e.accountant_opened_at).getTime() + DOZE_HORAS, new Date(e.accountant_expires_at).getTime())).toISOString();
}
function vistaPublica(e) {
  return { cliente: { nome: e.legal_name, cnpj: e.cnpj }, resumo: e.summary || '', aprovadoEm: e.approved_at, preparadoPor: 'time técnico Argus Prime',
    arquivos: (e.artifacts || []).map((a) => ({ tipo: a.tipo, competencia: a.competencia, cnpj: a.cnpj, itensAlterados: a.itensAlterados, shaRetificada: a.shaRetificada,
      pis: a.apuracao.pis || null, cofins: a.apuracao.cofins || null, previdenciario: a.apuracao.previdenciario || null, errosValidacao: a.validacao.erros, avisosValidacao: a.validacao.avisos })),
    expiraEm: e.accountant_expires_at, prazoResposta: e.prazo, agora: new Date().toISOString(), resposta: e.accountant_response, respostaRotulo: RESPOSTAS[e.accountant_response] || null, respondidoEm: e.accountant_responded_at };
}
async function readAccountant(req) { return vistaPublica((await publico(req)).e); }
async function respondAccountant(req, body = {}) {
  const { sql, e } = await publico(req);
  need(!e.accountant_response, 409, 'ALREADY_ANSWERED', 'Resposta já registrada. Para mudar, peça um novo link.');
  need(Date.now() <= new Date(e.prazo).getTime(), 409, 'DEADLINE_PASSED', 'O prazo de 12 horas para responder terminou. Peça um novo link ao time técnico Argus Prime.');
  const resposta = String(body.resposta || ''), nome = String(body.nome || '').trim(), comentario = String(body.comentario || '').trim();
  need(RESPOSTAS[resposta], 400, 'INVALID_ANSWER', 'Escolha uma resposta.');
  need(nome.length >= 3 && nome.length <= 240, 400, 'NAME_REQUIRED', 'Informe seu nome e registro no CRC.');
  need(resposta !== 'com_ressalvas' || comentario.length >= 5, 400, 'COMMENT_REQUIRED', 'Descreva as ressalvas.');
  const ok = (await sql`update recovery_executions set accountant_name = ${nome}, accountant_response = ${resposta}, accountant_comment = ${comentario.slice(0, 5000) || null},
    accountant_responded_at = now(), updated_at = now() where id = ${e.id} and accountant_response is null and stage = 'validacao_contador' returning accountant_responded_at`)[0];
  need(ok, 409, 'LINK_UNAVAILABLE', 'O link não permite mais registrar resposta.');
  await evento(sql, e.id, 'contador_resposta', null, null, RESPOSTAS[resposta] + (comentario ? ': ' + comentario.slice(0, 500) : ''), null, nome + ' (contador)');
  await audit('execution.accountant.answered', { organizationId: e.case_organization_id, entityType: 'tax_case', entityId: e.tax_case_id, metadata: { execution_id: e.id, resposta } });
  // Aviso aos masters (melhor esforço).
  try {
    const emails = (await sql`select u.email, m.master, m.role from users u join organization_members m on m.user_id = u.id join organizations o on o.id = m.organization_id
      where o.kind = 'plataforma' and m.status = 'active' and u.status = 'active' and (m.master = true or m.role = 'owner')`)
      .filter((r) => r.master === true || masterEmails().includes(normalizeEmail(r.email))).map((r) => normalizeEmail(r.email));
    for (const to of emails) {
      await mailer.sendGraphMail({ to, subject: `Contador respondeu: ${RESPOSTAS[resposta]} · ${e.legal_name}`,
        html: `<p>${esc(nome)} respondeu <b>${RESPOSTAS[resposta]}</b> na validação da retificação de ${esc(e.legal_name)}.</p>${comentario ? '<p>' + esc(comentario) + '</p>' : ''}<p>Abra a Execução no Reversa para seguir.</p>` });
    }
  } catch { /* o registro vale mesmo sem o e-mail */ }
  return { ok: true, resposta, respondidoEm: ok.accountant_responded_at };
}

// Trava para o parceiro: com o caso em execução, só a plataforma altera.
async function emExecucao(caseId) {
  return Boolean((await getSql()`select 1 from recovery_executions where tax_case_id = ${caseId}`)[0]);
}

module.exports = { list, get, start, update, advance, sendAccountant, registerFiles, readAccountant, respondAccountant, emExecucao, FASES, ROTULO };
