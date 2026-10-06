const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError, can } = require('../authz');
const LDB = require('../../leidobem-motor.js');

// Lei do Bem nativa (mesma sessão e organização): um caso por empresa e ano-base. O navegador lê os arquivos e envia
// só os dados extraídos; o servidor recalcula tudo com o mesmo motor (não confia no cálculo do cliente) e guarda a
// trilha das quatro revisões humanas. Nada é submetido ao MCTI ou à Receita: o Reversa gera rascunhos.
const uuidOk = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
function need(cond, status, code, message) { if (!cond) throw new HttpError(status, code, message); }
const json = (v) => (v && typeof v === 'object' ? v : typeof v === 'string' ? JSON.parse(v) : {});
const ETAPAS = LDB.ETAPAS.map((e) => e.id);
const MAX_BYTES = 3 * 1024 * 1024;

function caso(row) {
  const data = json(row.data);
  return Object.assign({}, data, { anoBase: row.base_year, status: row.status, revisoes: estadoRevisoes(json(row.reviews)).atuais });
}

// Log de revisões só cresce. "reiniciar" zera as aprovações do ciclo (reprovação ou alteração dos dados).
function estadoRevisoes(log) {
  const lista = Array.isArray(log) ? log : [];
  let inicio = 0;
  lista.forEach((r, i) => { if (r.decisao === 'reiniciar' || r.decisao === 'reprovar') inicio = i + 1; });
  const atuais = lista.slice(inicio).filter((r) => r.decisao === 'aprovar');
  const aprovadas = ETAPAS.filter((e) => atuais.some((r) => r.etapa === e));
  return { atuais, aprovadas, proxima: ETAPAS.find((e) => !aprovadas.includes(e)) || null, log: lista };
}

function resumo(c) {
  const calc = LDB.calcular(c);
  const pend = LDB.pendencias(c, calc);
  return {
    calc, pend,
    sumario: {
      dispendios: calc.dispendios, exclusao: LDB.r2(calc.exclusao + calc.exclusaoPatente), economia: calc.economia,
      elegibilidade: { status: calc.elegibilidade.status, rotulo: calc.elegibilidade.rotulo }, confianca: calc.confianca.score,
      prazo: calc.prazo, bloqueios: pend.filter((p) => p.nivel === 'bloqueio' || p.nivel === 'erro').length, alertas: pend.filter((p) => p.nivel === 'alerta').length,
      versaoMotor: LDB.VERSAO
    }
  };
}

async function row(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Caso não encontrado.');
  const r = (await getSql()`select * from ldb_cases where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  need(r, 404, 'NOT_FOUND', 'Caso não encontrado.');
  return r;
}

async function list(ctx) {
  const rows = await getSql()`select c.id, c.cnpj, c.legal_name, c.base_year, c.status, c.result, c.taxpayer_id, c.updated_at, u.name as updated_by_name
                              from ldb_cases c left join users u on u.id = c.updated_by
                              where c.organization_id = ${ctx.organization.id} and c.status <> 'arquivado'
                              order by c.updated_at desc limit 500`;
  return { casos: rows.map((r) => ({ id: r.id, cnpj: r.cnpj, legalName: r.legal_name, anoBase: r.base_year, status: r.status, taxpayerId: r.taxpayer_id,
    resumo: json(r.result), updatedAt: r.updated_at, updatedBy: r.updated_by_name })) };
}

async function create(ctx, body) {
  const sql = getSql();
  let cnpj = String(body.cnpj || '').replace(/\D/g, ''); let nome = String(body.legalName || '').trim().slice(0, 240);
  const ano = Number(body.anoBase);
  let taxpayerId = null;
  if (body.taxpayerId) {
    need(uuidOk(body.taxpayerId), 400, 'INVALID_TAXPAYER', 'Cliente inválido.');
    const t = (await sql`select id, legal_name, cnpj_normalized from taxpayers where id = ${body.taxpayerId} and organization_id = ${ctx.organization.id}`)[0];
    need(t, 404, 'NOT_FOUND', 'Cliente não encontrado.');
    taxpayerId = t.id; cnpj = cnpj || t.cnpj_normalized; nome = nome || t.legal_name;
  }
  need(/^\d{14}$/.test(cnpj), 400, 'INVALID_CNPJ', 'Informe um CNPJ com 14 dígitos.');
  need(nome, 400, 'INVALID_NAME', 'Informe a razão social.');
  need(Number.isInteger(ano) && ano >= 2006 && ano <= new Date().getFullYear() + 1, 400, 'INVALID_YEAR', 'Ano-base inválido.');
  const dup = (await sql`select id from ldb_cases where organization_id = ${ctx.organization.id} and cnpj = ${cnpj} and base_year = ${ano}`)[0];
  need(!dup, 409, 'DUPLICATE', 'Já existe um caso desta empresa para este ano-base.');
  const data = { empresa: { cnpj, nome }, projetos: [], despesas: [], pessoas: [], contabil: {}, pesquisadores: {}, patente: {}, formpd: {}, retroativo: [] };
  const c = Object.assign({}, data, { anoBase: ano, status: 'rascunho', revisoes: [] });
  const r = (await sql`insert into ldb_cases (organization_id, taxpayer_id, cnpj, legal_name, base_year, data, result, created_by, updated_by)
                       values (${ctx.organization.id}, ${taxpayerId}, ${cnpj}, ${nome}, ${ano}, ${JSON.stringify(data)}::jsonb, ${JSON.stringify(resumo(c).sumario)}::jsonb, ${ctx.user.id}, ${ctx.user.id})
                       returning id`)[0];
  await audit('ldb.case_created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'ldb_case', entityId: r.id, metadata: { ano } });
  return { id: r.id };
}

async function get(ctx, id) {
  const r = await row(ctx, id);
  const c = caso(r); const { calc, pend } = resumo(c);
  const rev = estadoRevisoes(json(r.reviews));
  return { id: r.id, cnpj: r.cnpj, legalName: r.legal_name, anoBase: r.base_year, status: r.status, taxpayerId: r.taxpayer_id,
    dados: json(r.data), calculo: calc, pendencias: pend, revisoes: { log: rev.log, aprovadas: rev.aprovadas, proxima: rev.proxima },
    recibo: r.formpd_receipt, enviadoEm: r.formpd_sent_at, updatedAt: r.updated_at, podeRevisar: can(ctx, 'review') };
}

function limpar(d) {
  need(d && typeof d === 'object' && !Array.isArray(d), 400, 'INVALID_DATA', 'Dados inválidos.');
  const permitido = ['empresa', 'projetos', 'despesas', 'pessoas', 'contabil', 'pesquisadores', 'patente', 'formpd', 'retroativo'];
  const out = {};
  permitido.forEach((k) => { if (d[k] !== undefined) out[k] = d[k]; });
  ['projetos', 'despesas', 'pessoas', 'retroativo'].forEach((k) => { if (out[k] !== undefined) need(Array.isArray(out[k]), 400, 'INVALID_DATA', `Campo ${k} inválido.`); });
  need(Buffer.byteLength(JSON.stringify(out)) <= MAX_BYTES, 413, 'TOO_LARGE', 'Dados muito grandes para um caso (limite de 3 MB).');
  return out;
}

async function save(ctx, id, body) {
  const sql = getSql();
  const r = await row(ctx, id);
  need(r.status !== 'enviado', 409, 'LOCKED', 'FORMP&D já enviado: o caso está travado. Crie um novo ano-base ou registre a retificação.');
  const data = Object.assign({}, json(r.data), limpar(body.dados || {}));
  const mudou = JSON.stringify(data) !== JSON.stringify(json(r.data));
  let reviews = json(r.reviews); let status = r.status;
  if (mudou && estadoRevisoes(reviews).aprovadas.length) {
    reviews = reviews.concat([{ etapa: '*', decisao: 'reiniciar', observacao: 'Dados alterados após aprovação: revisões reiniciadas.', userId: ctx.user.id, nome: ctx.user.name, em: new Date().toISOString() }]);
    status = 'rascunho';
  }
  const c = Object.assign({}, data, { anoBase: r.base_year, status, revisoes: estadoRevisoes(reviews).atuais });
  const s = resumo(c).sumario;
  const nome = data.empresa && data.empresa.nome ? String(data.empresa.nome).slice(0, 240) : r.legal_name;
  await sql`update ldb_cases set data = ${JSON.stringify(data)}::jsonb, result = ${JSON.stringify(s)}::jsonb, reviews = ${JSON.stringify(reviews)}::jsonb,
            status = ${status}, legal_name = ${nome}, updated_by = ${ctx.user.id}, updated_at = now()
            where id = ${r.id} and organization_id = ${ctx.organization.id}`;
  if (mudou) await audit('ldb.case_saved', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'ldb_case', entityId: r.id, metadata: { status, economia: s.economia, confianca: s.confianca } });
  return get(ctx, id);
}

async function review(ctx, id, body) {
  const sql = getSql();
  const r = await row(ctx, id);
  need(r.status !== 'enviado', 409, 'LOCKED', 'FORMP&D já enviado.');
  const etapa = String(body.etapa || ''); const decisao = String(body.decisao || ''); const obs = String(body.observacao || '').trim().slice(0, 2000);
  need(ETAPAS.includes(etapa), 400, 'INVALID_STEP', 'Etapa de revisão inválida.');
  need(['aprovar', 'reprovar'].includes(decisao), 400, 'INVALID_DECISION', 'Decisão inválida.');
  if (etapa === 'final') need(can(ctx, 'review'), 403, 'FORBIDDEN', 'A aprovação final é do administrador ou proprietário.');
  const rev = estadoRevisoes(json(r.reviews));
  if (decisao === 'aprovar') {
    need(rev.proxima === etapa, 409, 'OUT_OF_ORDER', rev.proxima ? `Aprove antes a etapa "${LDB.ETAPAS.find((e) => e.id === rev.proxima).nome}".` : 'Todas as etapas já foram aprovadas.');
    const { calc, pend } = resumo(caso(r));
    need(!['BLOQUEADO', 'INELEGIVEL'].includes(calc.elegibilidade.status), 409, 'BLOCKED', `Não é possível aprovar: ${calc.elegibilidade.rotulo}.`);
    if (etapa === 'final') {
      need(!pend.some((p) => p.nivel === 'bloqueio' || p.nivel === 'erro'), 409, 'BLOCKED', 'Resolva as pendências bloqueantes antes da aprovação final.');
      need(calc.confianca.score >= 70, 409, 'LOW_SCORE', `Score de confiança ${calc.confianca.score}: abaixo de 70 exige documentos adicionais antes da aprovação final.`);
    }
  } else need(obs.length >= 5, 400, 'REASON_REQUIRED', 'Informe o motivo da reprovação.');
  const entrada = { etapa, decisao, observacao: obs, userId: ctx.user.id, nome: ctx.user.name, em: new Date().toISOString() };
  const reviews = rev.log.concat([entrada]);
  const novo = estadoRevisoes(reviews);
  const status = decisao === 'reprovar' ? 'rascunho' : novo.aprovadas.length === ETAPAS.length ? 'aprovado' : 'em_revisao';
  await sql`update ldb_cases set reviews = ${JSON.stringify(reviews)}::jsonb, status = ${status}, updated_by = ${ctx.user.id}, updated_at = now()
            where id = ${r.id} and organization_id = ${ctx.organization.id}`;
  await audit('ldb.review', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'ldb_case', entityId: r.id, metadata: { etapa, decisao, status } });
  return get(ctx, id);
}

async function receipt(ctx, id, body) {
  const r = await row(ctx, id);
  need(r.status === 'aprovado' || r.status === 'enviado', 409, 'NOT_APPROVED', 'Registre o recibo só depois das quatro aprovações.');
  const recibo = String(body.recibo || '').trim().slice(0, 120); const data = String(body.data || '').slice(0, 10);
  need(recibo.length >= 3, 400, 'INVALID_RECEIPT', 'Informe o número do recibo do FORMP&D.');
  need(/^\d{4}-\d{2}-\d{2}$/.test(data), 400, 'INVALID_DATE', 'Informe a data do envio.');
  await getSql()`update ldb_cases set formpd_receipt = ${recibo}, formpd_sent_at = ${data}, status = 'enviado', updated_by = ${ctx.user.id}, updated_at = now()
                 where id = ${r.id} and organization_id = ${ctx.organization.id}`;
  await audit('ldb.formpd_receipt', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'ldb_case', entityId: r.id, metadata: { data } });
  return get(ctx, id);
}

module.exports = { list, create, get, save, review, receipt, estadoRevisoes };
