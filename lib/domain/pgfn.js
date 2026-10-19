// Transação PGFN — dossiê, dívidas, cálculo determinístico (lib/pgfn.js), cenários, restrições, sensibilidades e briefs.
// Acesso: somente a plataforma (Argus Prime) opera o dossiê; aprovar brief é do master. O cálculo livre (simular) serve à demonstração.
// Toda leitura/escrita filtra por organization_id da SESSÃO (FK não é autorização).
const { getSql } = require('../db');
const { HttpError } = require('../authz');
const { audit } = require('../audit');
const Motor = require('../pgfn');
const tax = require('./tax');

const need = (ok, status, code, message) => { if (!ok) throw new HttpError(status, code, message); };
const uuidOk = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
const dstr = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const n2 = (v) => (v == null ? null : Number(v));
const DEBT_KINDS = ['principal', 'multa', 'juros', 'encargo', 'previdenciario', 'tributario', 'outro', 'desconhecido'];
const ADMIN = ['ativa', 'suspensa', 'garantida', 'parcelada', 'quitada', 'contestada', 'outra', 'desconhecida'];
const SOURCES = ['api_interna', 'pdf_manual', 'planilha_estruturada', 'entrada_manual', 'desconhecida'];
const DSTATUS = ['confirmado', 'informado_nao_validado', 'desconhecido'];
const PROPOSALS = ['individual', 'individual_simplified', 'exceptional', 'adhesion', 'not_confirmed'];
const DOSSIER = ['draft', 'collecting', 'ready_for_review', 'active_monitoring', 'archived'];

async function plataforma(ctx, acao) {
  if (ctx.organization.kind === 'plataforma' && !ctx.user.legacy) return;
  await audit('authz.denied', { outcome: 'denied', organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { action: acao, role: ctx.role } });
  throw new HttpError(403, 'FORBIDDEN', 'A transação PGFN é exclusiva da equipe Argus Prime.');
}
function escrita(ctx) { need(['owner', 'admin', 'analyst'].includes(ctx.role), 403, 'FORBIDDEN', 'Seu perfil não permite esta ação.'); }

// ---- validação de entrada ------------------------------------------------------------------------------------------------
function money(v, campo) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  need(Number.isFinite(x) && x >= 0 && x < 1e13, 400, 'INVALID_AMOUNT', `Valor inválido em ${campo}.`);
  return Math.round(x * 100) / 100;
}
function dataOk(v, campo, obrigatoria) {
  if (v === null || v === undefined || v === '') { need(!obrigatoria, 400, 'INVALID_DATE', `Informe ${campo}.`); return null; }
  const s = String(v).slice(0, 10);
  need(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 400, 'INVALID_DATE', `Data inválida em ${campo}.`);
  return s;
}
function cleanDebt(d, i) {
  need(d && typeof d === 'object', 400, 'INVALID_DEBT', `Inscrição ${i + 1} inválida.`);
  const kind = d.debtKind || 'desconhecido', adm = d.administrativeStatus || 'desconhecida', src = d.source && d.source.kind || d.sourceType || 'entrada_manual', ds = d.dataStatus || 'informado_nao_validado';
  need(DEBT_KINDS.includes(kind) && ADMIN.includes(adm) && SOURCES.includes(src) && DSTATUS.includes(ds), 400, 'INVALID_DEBT', `Inscrição ${i + 1}: tipo, situação, fonte ou status inválido.`);
  const ref = d.externalDebtReference == null || d.externalDebtReference === '' ? null : String(d.externalDebtReference).slice(0, 160);
  return {
    ref, kind, adm, src, ds,
    inscription: dataOk(d.inscriptionDate, 'a data de inscrição', false), reference: dataOk(d.referenceDate || new Date().toISOString().slice(0, 10), 'a data de referência', true),
    original: money(d.originalAmount, 'valor original'), principal: money(d.principalAmount, 'principal'), interest: money(d.interestAmount, 'juros'), penalty: money(d.penaltyAmount, 'multa'),
    legal: money(d.legalChargesAmount, 'encargo legal'), updated: money(d.updatedBalance, 'saldo atualizado'), guarantee: money(d.guaranteeAmount, 'garantia'),
    notes: d.notes ? String(d.notes).slice(0, 2000) : null
  };
}
function factNum(v, campo) {
  if (v === null || v === undefined || v === '') return undefined;
  const raw = (typeof v === 'object') ? v.value : v;
  if (raw === null || raw === undefined || raw === '') return undefined;
  const x = Number(raw); need(Number.isFinite(x) && x >= 0 && x < 1e13, 400, 'INVALID_FACT', `Valor inválido em ${campo}.`);
  const st = (typeof v === 'object' && DSTATUS.includes(v.status)) ? v.status : 'informado_nao_validado';
  return { value: Math.round(x * 1e6) / 1e6, status: st };
}
function cleanFacts(f) {
  need(f && typeof f === 'object' && !Array.isArray(f), 400, 'INVALID_FACTS', 'Fatos inválidos.');
  const out = {};
  if (f.perfil !== undefined && f.perfil !== null && f.perfil !== '') { need(['geral', 'diferenciado', 'mei'].includes(f.perfil), 400, 'INVALID_FACTS', 'Perfil inválido.'); out.perfil = f.perfil; }
  if (f.capagRating !== undefined && f.capagRating !== null && f.capagRating !== '') { const r = String(f.capagRating).toUpperCase(); need(['A', 'B', 'C', 'D'].includes(r), 400, 'INVALID_FACTS', 'Classificação CAPAG deve ser A, B, C ou D.'); out.capagRating = r; }
  for (const [k, rot] of [['capagValue', 'CAPAG'], ['passivoRfb', 'passivo na Receita Federal'], ['monthlyCashCapacity', 'caixa mensal'], ['selicAnnual', 'Selic anual'], ['discountRateAnnual', 'taxa de desconto']]) {
    const v = factNum(f[k], rot); if (v) out[k] = v;
  }
  for (const k of ['selicAnnual', 'discountRateAnnual']) if (out[k]) need(out[k].value <= 5, 400, 'INVALID_FACT', 'Informe a taxa como fração anual (ex.: 0,14 para 14%).');
  for (const k of ['devedorContumaz', 'transacaoRescindida2anos']) if (typeof f[k] === 'boolean') out[k] = f[k];
  if (f.userNotes) out.userNotes = String(f.userNotes).slice(0, 10000);
  return out;
}

// ---- leitura ------------------------------------------------------------------------------------------------------------
function debtOut(r) {
  return { id: r.id, externalDebtReference: r.external_debt_reference, debtKind: r.debt_kind, administrativeStatus: r.administrative_status, inscriptionDate: dstr(r.inscription_date), referenceDate: dstr(r.reference_date),
    originalAmount: n2(r.original_amount), principalAmount: n2(r.principal_amount), interestAmount: n2(r.interest_amount), penaltyAmount: n2(r.penalty_amount), legalChargesAmount: n2(r.legal_charges_amount),
    updatedBalance: n2(r.updated_balance), guaranteeAmount: n2(r.guarantee_amount), dataStatus: r.data_status, notes: r.notes, source: { kind: r.source_type } };
}
async function carregar(ctx, id) {
  need(uuidOk(id), 404, 'NOT_FOUND', 'Dossiê não encontrado.');
  const sql = getSql();
  const c = (await sql`select p.*, t.legal_name, t.cnpj_normalized as cnpj, t.tax_regime from pgfn_cases p join taxpayers t on t.id = p.taxpayer_id
    where p.id = ${id} and p.organization_id = ${ctx.organization.id}`)[0];
  need(c, 404, 'NOT_FOUND', 'Dossiê não encontrado.');
  const dividas = (await sql`select * from pgfn_debts where pgfn_case_id = ${id} and organization_id = ${ctx.organization.id} order by reference_date desc, created_at, id`).map(debtOut);
  return { c, dividas };
}
function caseOut(c, extra = {}) {
  return { id: c.id, taxCaseId: c.tax_case_id, taxpayerId: c.taxpayer_id, cliente: { nome: c.legal_name, cnpj: c.cnpj, regime: c.tax_regime || null }, proposalKind: c.proposal_kind, dossierStatus: c.dossier_status,
    viabilityStatus: c.viability_status, version: c.dossier_version, facts: c.facts || {}, lastInputHash: c.last_input_hash, updatedAt: c.updated_at, ...extra };
}

async function list(ctx) {
  await plataforma(ctx, 'pgfn.list');
  const rows = await getSql()`select p.id, p.proposal_kind, p.dossier_status, p.viability_status, p.updated_at, t.legal_name, t.cnpj_normalized as cnpj,
      (select count(*)::int from pgfn_debts d where d.pgfn_case_id = p.id) as dividas,
      (select coalesce(sum(coalesce(d.updated_balance, 0)), 0) from pgfn_debts d where d.pgfn_case_id = p.id and d.administrative_status <> 'quitada') as total
    from pgfn_cases p join taxpayers t on t.id = p.taxpayer_id where p.organization_id = ${ctx.organization.id} and p.dossier_status <> 'archived' order by p.updated_at desc limit 500`;
  return { dossies: rows.map((r) => ({ id: r.id, cliente: { nome: r.legal_name, cnpj: r.cnpj }, proposalKind: r.proposal_kind, dossierStatus: r.dossier_status, viabilityStatus: r.viability_status, dividas: r.dividas, total: n2(r.total), updatedAt: r.updated_at })) };
}

async function create(ctx, body) {
  await plataforma(ctx, 'pgfn.create'); escrita(ctx);
  const sql = getSql();
  const tp = await tax.findOrCreateTaxpayer(ctx, { cnpj: body.cnpj, legalName: body.legalName });
  const caseId = await tax.openCase(ctx, tp.id, body.legalName);
  const row = (await sql`insert into pgfn_cases (organization_id, tax_case_id, taxpayer_id, proposal_kind, created_by, updated_by)
    values (${ctx.organization.id}, ${caseId}, ${tp.id}, 'adhesion', ${ctx.user.id}, ${ctx.user.id})
    on conflict (organization_id, tax_case_id) do nothing returning id`)[0];
  const id = row ? row.id : (await sql`select id from pgfn_cases where organization_id = ${ctx.organization.id} and tax_case_id = ${caseId}`)[0].id;
  if (row) await audit('pgfn.case.created', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'pgfn_case', entityId: id, metadata: { tax_case_id: caseId } });
  return { id, created: Boolean(row) };
}

async function get(ctx, id) {
  await plataforma(ctx, 'pgfn.get');
  const sql = getSql();
  const { c, dividas } = await carregar(ctx, id);
  const run = (await sql`select * from pgfn_solver_runs where pgfn_case_id = ${id} and organization_id = ${ctx.organization.id} order by run_number desc limit 1`)[0];
  const atual = Motor.inputHash(dividas.map(paraMotor), c.facts || {});
  let resultado = null;
  if (run) {
    const sc = await sql`select * from pgfn_scenarios where solver_run_id = ${run.id} and organization_id = ${ctx.organization.id} order by created_at, scenario_key`;
    const ids = sc.map((s) => s.id);
    const cr = ids.length ? await sql`select * from pgfn_constraint_results where organization_id = ${ctx.organization.id} and scenario_id = any(${ids}::uuid[]) order by rule_code` : [];
    const rs = ids.length ? await sql`select * from pgfn_rate_sensitivities where organization_id = ${ctx.organization.id} and scenario_id = any(${ids}::uuid[]) order by rate_kind` : [];
    const br = ids.length ? await sql`select * from pgfn_decision_briefs where organization_id = ${ctx.organization.id} and scenario_id = any(${ids}::uuid[]) order by created_at` : [];
    resultado = {
      runId: run.id, runNumber: run.run_number, runStatus: run.run_status, engineVersion: run.engine_version, catalogVersion: run.catalog_version, inputHash: run.input_hash, calculatedAt: run.completed_at, durationMs: run.duration_ms,
      scenarios: sc.map((s) => ({ scenarioId: s.id, scenarioKey: s.scenario_key, viabilityStatus: s.label, recommendation: s.recommendation, nominalCostBRL: n2(s.nominal_cost), presentValueCostBRL: n2(s.present_value_cost),
        shortTermCashNeedBRL: n2(s.short_term_cash_need), longTermEconomicImpactBRL: n2(s.long_term_economic_impact), paretoOptimal: s.pareto_optimal, missingInputs: s.missing_inputs, assumptions: s.assumptions,
        ...(s.solver_solution || {}),
        constraintResults: cr.filter((x) => x.scenario_id === s.id).map((x) => ({ ruleCode: x.rule_code, evaluationStatus: x.evaluation_status, severity: x.severity, reasonCode: x.reason_code, explanation: x.explanation, evaluatedValues: x.evaluated_values })),
        rateSensitivities: rs.filter((x) => x.scenario_id === s.id).map((x) => ({ rateKind: x.rate_kind, unit: x.rate_unit, baselineRate: n2(x.baseline_rate), alternativeRate: n2(x.alternative_rate), recommendation: x.recommendation, reasonCodes: x.reason_codes,
          presentValueCostDeltaBRL: n2(x.present_value_cost_delta), tradeOff: (x.explanation || {}).tradeOff })),
        briefs: br.filter((x) => x.scenario_id === s.id).map((x) => ({ id: x.id, audience: x.audience, status: x.status, version: x.brief_version, content: x.content, reviewedAt: x.reviewed_at })) })) };
  }
  const motor = Motor.calcular({ debts: dividas.map(paraMotor), facts: c.facts || {} });
  return caseOut(c, { dividas, resultado, desatualizado: Boolean(run) && run.input_hash !== atual,
    previa: { grupoCapag: motor.grupoCapag, origemGrupo: motor.origemGrupo, passivo: motor.passivo, consolidadoElegivel: motor.consolidadoElegivel, foraDoCalculo: motor.foraDoCalculo, capag: motor.capag, missingInputs: motor.missingInputs, ratingWhatIf: motor.ratingWhatIf },
    catalogo: { version: Motor.CATALOG.version, status: Motor.CATALOG.status, adesaoAte: Motor.CATALOG.adesaoAte, inscricoesAte: Motor.CATALOG.inscricoesAte }, regras: Motor.REGRAS });
}
const paraMotor = (d) => ({ externalDebtReference: d.externalDebtReference, id: d.id, debtKind: d.debtKind, administrativeStatus: d.administrativeStatus, inscriptionDate: d.inscriptionDate, referenceDate: d.referenceDate,
  originalAmount: d.originalAmount, principalAmount: d.principalAmount, interestAmount: d.interestAmount, penaltyAmount: d.penaltyAmount, legalChargesAmount: d.legalChargesAmount, updatedBalance: d.updatedBalance, dataStatus: d.dataStatus });

// ---- escrita -------------------------------------------------------------------------------------------------------------
async function saveFacts(ctx, id, body) {
  await plataforma(ctx, 'pgfn.facts'); escrita(ctx);
  const { c } = await carregar(ctx, id);
  const facts = body.facts === undefined ? c.facts || {} : { ...(c.facts || {}), ...cleanFacts(body.facts) };
  if (body.facts) for (const k of Object.keys(body.facts)) { // limpar: campo enviado vazio remove o fato
    const v = body.facts[k]; if (v === null || v === '' || (typeof v === 'object' && v && (v.value === null || v.value === ''))) delete facts[k];
  }
  const proposal = body.proposalKind === undefined ? c.proposal_kind : body.proposalKind, status = body.dossierStatus === undefined ? c.dossier_status : body.dossierStatus;
  need(PROPOSALS.includes(proposal) && DOSSIER.includes(status), 400, 'INVALID_FACTS', 'Modalidade ou status inválido.');
  await getSql()`update pgfn_cases set facts = ${JSON.stringify(facts)}::jsonb, proposal_kind = ${proposal}, dossier_status = ${status}, dossier_version = dossier_version + 1, updated_by = ${ctx.user.id}, updated_at = now()
    where id = ${id} and organization_id = ${ctx.organization.id}`;
  await audit('pgfn.facts.saved', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'pgfn_case', entityId: id });
  return { ok: true };
}

async function saveDebts(ctx, id, body) {
  await plataforma(ctx, 'pgfn.debts'); escrita(ctx);
  await carregar(ctx, id);
  need(Array.isArray(body.debts) && body.debts.length <= 2000, 400, 'INVALID_DEBTS', 'Envie uma lista de até 2.000 inscrições.');
  const lista = body.debts.map(cleanDebt);
  const refs = lista.map((d) => d.ref).filter(Boolean);
  need(new Set(refs).size === refs.length, 400, 'DUPLICATE_DEBT', 'Há inscrições repetidas (mesma referência).');
  const sql = getSql();
  await sql`delete from pgfn_debts where pgfn_case_id = ${id} and organization_id = ${ctx.organization.id}`;
  if (lista.length) {
    const json = JSON.stringify(lista.map((d) => ({ ref: d.ref, kind: d.kind, adm: d.adm, src: d.src, ds: d.ds, inscription: d.inscription, reference: d.reference, original: d.original, principal: d.principal,
      interest: d.interest, penalty: d.penalty, legal: d.legal, updated: d.updated, guarantee: d.guarantee, notes: d.notes })));
    await sql`insert into pgfn_debts (organization_id, pgfn_case_id, external_debt_reference, debt_kind, administrative_status, inscription_date, reference_date, original_amount, principal_amount, interest_amount,
        penalty_amount, legal_charges_amount, updated_balance, guarantee_amount, source_type, data_status, notes, created_by, updated_by)
      select ${ctx.organization.id}, ${id}, x.ref, x.kind, x.adm, x.inscription::date, x.reference::date, x.original, x.principal, x.interest, x.penalty, x.legal, x.updated, x.guarantee, x.src, x.ds, x.notes, ${ctx.user.id}, ${ctx.user.id}
      from jsonb_to_recordset(${json}::jsonb) as x(ref text, kind text, adm text, src text, ds text, inscription text, reference text, original numeric, principal numeric, interest numeric, penalty numeric, legal numeric, updated numeric, guarantee numeric, notes text)`;
  }
  await sql`update pgfn_cases set dossier_version = dossier_version + 1, updated_by = ${ctx.user.id}, updated_at = now() where id = ${id} and organization_id = ${ctx.organization.id}`;
  await audit('pgfn.debts.saved', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'pgfn_case', entityId: id, metadata: { count: lista.length } });
  return { ok: true, count: lista.length };
}

// ---- cálculo -------------------------------------------------------------------------------------------------------------
async function run(ctx, id) {
  await plataforma(ctx, 'pgfn.run'); escrita(ctx);
  const sql = getSql();
  const { c, dividas } = await carregar(ctx, id);
  need(dividas.length > 0, 400, 'NO_DEBTS', 'Cadastre ao menos uma inscrição antes de calcular.');
  const t0 = Date.now(), started = new Date();
  const debts = dividas.map(paraMotor), facts = c.facts || {};
  const res = Motor.calcular({ debts, facts }, { semSimulador: true });
  let runRow;
  for (let tentativa = 0; tentativa < 3 && !runRow; tentativa++) {
    try {
      const n = Number((await sql`select coalesce(max(run_number), 0) + 1 as n from pgfn_solver_runs where pgfn_case_id = ${id} and organization_id = ${ctx.organization.id}`)[0].n);
      const best = res.scenarios.find((s) => s.scenarioKey === res.melhor);
      runRow = (await sql`insert into pgfn_solver_runs (organization_id, pgfn_case_id, run_number, run_status, solver_name, engine_version, catalog_version, input_hash, input_snapshot, rule_snapshot, solver_parameters,
          objective_value, started_at, completed_at, duration_ms, created_by)
        values (${ctx.organization.id}, ${id}, ${n}, 'completed', 'deterministico-cronograma', ${res.engineVersion}, ${res.catalogVersion}, ${res.inputHash}, ${JSON.stringify({ debts, facts })}::jsonb,
          ${JSON.stringify(Motor.REGRAS)}::jsonb, ${JSON.stringify({ catalogStatus: res.catalogStatus, grupoCapag: res.grupoCapag, origemGrupo: res.origemGrupo })}::jsonb,
          ${best ? (best.pv ?? best.nominalCost) : null}, ${started}, now(), ${Date.now() - t0}, ${ctx.user.id}) returning id`)[0];
    } catch (e) { if (!/duplicate key|unique/i.test(String(e.message || e)) || tentativa === 2) throw e; }
  }
  const briefs = Motor.resumos(res);
  for (const s of res.scenarios) {
    const sol = { labelText: s.label, group: s.group, n: s.n, entrada: s.entrada, desconto: s.desconto, total: s.total, saldo: s.saldo, nominalVsTotal: s.economiaNominal, fluxo: s.fluxo, solverStatus: s.solverStatus };
    const row = (await sql`insert into pgfn_scenarios (organization_id, solver_run_id, scenario_key, label, recommendation, nominal_cost, present_value_cost, short_term_cash_need, long_term_economic_impact, pareto_optimal, solver_solution, missing_inputs, assumptions)
      values (${ctx.organization.id}, ${runRow.id}, ${s.scenarioKey}, ${s.viability}, ${s.recommendation}, ${s.nominalCost}, ${s.pv}, ${s.picoCaixa}, ${s.longTermEconomicImpact}, ${s.paretoOptimal}, ${JSON.stringify(sol)}::jsonb,
        ${JSON.stringify(s.missingInputs)}::jsonb, ${JSON.stringify(s.assumptions)}::jsonb) returning id`)[0];
    s.scenarioId = row.id;
    const cr = JSON.stringify(s.constraintResults.map((r) => ({ code: r.ruleCode, st: r.evaluationStatus, sev: r.severity, reason: r.reasonCode, ev: r.evaluatedValues || {}, src: r.sourceRefs || [], exp: r.explanation || null })));
    await sql`insert into pgfn_constraint_results (organization_id, scenario_id, rule_code, evaluation_status, severity, reason_code, evaluated_values, source_refs, explanation)
      select ${ctx.organization.id}, ${row.id}, x.code, x.st, x.sev, x.reason, x.ev, x.src, x.exp from jsonb_to_recordset(${cr}::jsonb) as x(code text, st text, sev text, reason text, ev jsonb, src jsonb, exp text)`;
    const rs = JSON.stringify(s.rateSensitivities.map((r) => ({ kind: r.rateKind, base: r.baselineRate ?? null, alt: r.alternativeRate ?? null, unit: r.unit, st: r.shortTermHorizonMonths, lt: r.longTermHorizonMonths,
      stc: r.shortTermCostDeltaBRL ?? null, ltc: r.longTermCostDeltaBRL ?? null, nom: r.nominalCostDeltaBRL ?? null, pv: r.presentValueCostDeltaBRL ?? null, be: r.breakevenMonth ?? null,
      rec: r.recommendation, reasons: r.reasonCodes || [], exp: { tradeOff: r.tradeOff || null } })));
    await sql`insert into pgfn_rate_sensitivities (organization_id, scenario_id, rate_kind, baseline_rate, alternative_rate, rate_unit, is_primary, short_term_horizon_months, long_term_horizon_months, short_term_cost_delta,
        long_term_cost_delta, nominal_cost_delta, present_value_cost_delta, breakeven_month, recommendation, reason_codes, explanation)
      select ${ctx.organization.id}, ${row.id}, x.kind, x.base, x.alt, x.unit, false, x.st, x.lt, x.stc, x.ltc, x.nom, x.pv, x.be, x.rec, x.reasons, x.exp
      from jsonb_to_recordset(${rs}::jsonb) as x(kind text, base numeric, alt numeric, unit text, st int, lt int, stc numeric, ltc numeric, nom numeric, pv numeric, be int, rec text, reasons jsonb, exp jsonb)`;
    if (s.scenarioKey === res.melhor) {
      for (const b of briefs) {
        const v = Number((await sql`select coalesce(max(brief_version), 0) + 1 as v from pgfn_decision_briefs where scenario_id = ${row.id} and audience = ${b.audience}`)[0].v);
        await sql`insert into pgfn_decision_briefs (organization_id, scenario_id, audience, brief_version, template_version, status, content, created_by)
          values (${ctx.organization.id}, ${row.id}, ${b.audience}, ${v}, ${b.templateVersion}, 'draft', ${JSON.stringify(b)}::jsonb, ${ctx.user.id})`;
      }
    }
  }
  const viab = res.scenarios.some((s) => s.viability === 'viavel') ? 'viavel' : res.scenarios.some((s) => s.viability === 'viavel_com_pendencia') ? 'viavel_com_pendencia' : 'inviavel';
  await sql`update pgfn_cases set viability_status = ${viab}, last_input_hash = ${res.inputHash}, last_solver_run_id = ${runRow.id}, updated_at = now(), updated_by = ${ctx.user.id}
    where id = ${id} and organization_id = ${ctx.organization.id}`;
  await audit('pgfn.run.completed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'pgfn_case', entityId: id, metadata: { run_id: runRow.id, input_hash: res.inputHash, viability: viab } });
  return { runId: runRow.id, viabilityStatus: viab, melhor: res.melhor };
}

// Cálculo livre, sem gravar (demonstração e "e se"). Qualquer usuário autenticado.
async function simulate(ctx, body) {
  need(Array.isArray(body.debts) && body.debts.length <= 500, 400, 'INVALID_DEBTS', 'Envie até 500 inscrições.');
  const debts = body.debts.map((d, i) => { const c = cleanDebt(d, i); return { externalDebtReference: c.ref, debtKind: c.kind, administrativeStatus: c.adm, inscriptionDate: c.inscription, referenceDate: c.reference,
    originalAmount: c.original, principalAmount: c.principal, interestAmount: c.interest, penaltyAmount: c.penalty, legalChargesAmount: c.legal, updatedBalance: c.updated, dataStatus: c.ds }; });
  const facts = cleanFacts(body.facts || {});
  const res = Motor.calcular({ debts, facts });
  const sim = body.rating && (body.rating.capagRevisada !== undefined || body.rating.passivoAjuste !== undefined) ? Motor.simularRating({ debts, facts }, body.rating) : null;
  return { ...res, resumos: Motor.resumos(res), ratingSimulado: sim, catalogo: { version: Motor.CATALOG.version, status: Motor.CATALOG.status, adesaoAte: Motor.CATALOG.adesaoAte, inscricoesAte: Motor.CATALOG.inscricoesAte } };
}

// "E se o rating mudar?": usa o dossiê gravado com CAPAG/passivo alternativos, sem alterar nada.
async function rating(ctx, id, body) {
  await plataforma(ctx, 'pgfn.rating');
  const { c, dividas } = await carregar(ctx, id);
  const r = body || {};
  for (const k of ['capagRevisada', 'passivoAjuste']) if (r[k] !== undefined && r[k] !== null && r[k] !== '') need(Number.isFinite(Number(r[k])) && Math.abs(Number(r[k])) < 1e13, 400, 'INVALID_FACT', 'Valor inválido.');
  return Motor.simularRating({ debts: dividas.map(paraMotor), facts: c.facts || {} }, r);
}

// Revisão do brief: somente master. Registra o evento com snapshot da decisão.
async function review(ctx, id, body) {
  await plataforma(ctx, 'pgfn.review');
  need(ctx.master, 403, 'FORBIDDEN', 'Somente André ou Moisés aprovam o resumo da decisão.');
  await carregar(ctx, id);
  need(uuidOk(body.briefId), 400, 'INVALID_BRIEF', 'Resumo inválido.');
  need(['approve', 'reject', 'return'].includes(body.decision), 400, 'INVALID_DECISION', 'Decisão inválida.');
  const sql = getSql();
  const b = (await sql`select b.* from pgfn_decision_briefs b join pgfn_scenarios s on s.id = b.scenario_id join pgfn_solver_runs r on r.id = s.solver_run_id
    where b.id = ${body.briefId} and b.organization_id = ${ctx.organization.id} and r.pgfn_case_id = ${id}`)[0];
  need(b, 404, 'NOT_FOUND', 'Resumo não encontrado.');
  const status = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'in_review';
  await sql`update pgfn_decision_briefs set status = ${status}, reviewed_by = ${ctx.user.id}, reviewed_at = now(), updated_at = now() where id = ${b.id} and organization_id = ${ctx.organization.id}`;
  await sql`insert into pgfn_review_events (organization_id, scenario_id, decision_brief_id, actor_user_id, decision, audience, reason, decision_snapshot)
    values (${ctx.organization.id}, ${b.scenario_id}, ${b.id}, ${ctx.user.id}, ${body.decision}, ${b.audience}, ${body.reason ? String(body.reason).slice(0, 2000) : null}, ${JSON.stringify(b.content)}::jsonb)`;
  await audit('pgfn.brief.reviewed', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'pgfn_case', entityId: id, metadata: { brief_id: b.id, decision: body.decision } });
  return { ok: true, status };
}

function catalogo() { return { catalogo: Motor.CATALOG, regras: Motor.REGRAS, engineVersion: Motor.ENGINE_VERSION }; }

module.exports = { list, create, get, saveFacts, saveDebts, run, simulate, rating, review, catalogo };
