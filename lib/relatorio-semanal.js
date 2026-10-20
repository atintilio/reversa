// Relatório semanal de gestão (quarta 20h, Brasília): top 10 parceiros, totais da semana vs. semana anterior e pendências de cadastro.
// SQL próprio e independente (lê diagnostics, tax_cases, audit_events e crm_activities). Só leitura.
const { getSql } = require('./db');

const num = (v) => (v == null ? 0 : Number(v));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Janela: [agora-7d, agora) = semana atual; [agora-14d, agora-7d) = semana anterior.
async function coletar(agora = new Date()) {
  const sql = getSql();
  const t1 = agora.toISOString();
  const t0 = new Date(agora.getTime() - 7 * 864e5).toISOString();
  const tm = new Date(agora.getTime() - 14 * 864e5).toISOString();

  const parceiros = await sql`
    select o.id, o.name,
      (select count(*) from diagnostics d where d.organization_id = o.id and d.created_at >= ${t0}::timestamptz and d.created_at < ${t1}::timestamptz)::int as diag_sem,
      (select count(*) from diagnostics d where d.organization_id = o.id and d.created_at >= ${tm}::timestamptz and d.created_at < ${t0}::timestamptz)::int as diag_ant,
      (select count(*) from tax_cases c where c.organization_id = o.id and c.status <> 'archived' and c.created_at >= ${t0}::timestamptz and c.created_at < ${t1}::timestamptz)::int as oport_sem,
      (select count(*) from tax_cases c where c.organization_id = o.id and c.status <> 'archived' and c.created_at >= ${tm}::timestamptz and c.created_at < ${t0}::timestamptz)::int as oport_ant,
      (select coalesce(sum(d.valor_no_prazo), 0) from diagnostics d where d.organization_id = o.id and d.status = 'vigente' and not exists (select 1 from tax_cases xc where xc.id = d.tax_case_id and xc.status = 'archived')) as creditos,
      (select count(*) from audit_events a where a.organization_id = o.id and a.event_type = 'case.stage_changed' and a.metadata->>'to' = 'contrato'
         and a.created_at >= ${t0}::timestamptz and a.created_at < ${t1}::timestamptz)::int as contr_sem,
      (select count(*) from audit_events a where a.organization_id = o.id and a.event_type = 'case.stage_changed' and a.metadata->>'to' = 'contrato'
         and a.created_at >= ${tm}::timestamptz and a.created_at < ${t0}::timestamptz)::int as contr_ant,
      (select coalesce(sum(c.estimated_value), 0) from audit_events a join tax_cases c on c.id = a.entity_id
         where a.organization_id = o.id and a.event_type = 'case.stage_changed' and a.metadata->>'to' = 'contrato' and c.status <> 'archived'
           and a.created_at >= ${t0}::timestamptz and a.created_at < ${t1}::timestamptz) as contr_valor_sem
    from organizations o
    where o.kind <> 'plataforma' or exists (select 1 from diagnostics d where d.organization_id = o.id)
    order by lower(o.name)`;

  const linhas = parceiros.map((r) => ({
    id: r.id, nome: r.name, diagnosticos: r.diag_sem, diagnosticosAnt: r.diag_ant, oportunidades: r.oport_sem, oportunidadesAnt: r.oport_ant,
    creditos: num(r.creditos), contratos: r.contr_sem, contratosAnt: r.contr_ant, valorContratos: num(r.contr_valor_sem)
  }));
  // Ranking: contratos fechados na semana, depois créditos vigentes em R$ (os dois lado a lado).
  const top = linhas.slice().sort((a, b) => b.contratos - a.contratos || b.creditos - a.creditos || b.diagnosticos - a.diagnosticos).slice(0, 10);
  const soma = (k) => linhas.reduce((s, p) => s + p[k], 0);
  const totais = {
    diagnosticos: soma('diagnosticos'), diagnosticosAnt: soma('diagnosticosAnt'), oportunidades: soma('oportunidades'), oportunidadesAnt: soma('oportunidadesAnt'),
    contratos: soma('contratos'), contratosAnt: soma('contratosAnt'), valorContratos: soma('valorContratos'), creditos: soma('creditos')
  };

  const pend = await sql`
    select a.id, a.subject, a.created_at, o.name as parceiro, t.legal_name as cliente, t.cnpj_normalized as cnpj
    from crm_activities a join organizations o on o.id = a.organization_id join taxpayers t on t.id = a.taxpayer_id
    where a.type = 'task' and a.done_at is null and a.meta->>'pendencia' = 'true'
    order by a.created_at limit 200`;
  const pendencias = pend.map((p) => ({ id: p.id, descricao: p.subject, parceiro: p.parceiro, cliente: p.cliente, cnpj: p.cnpj, desde: p.created_at }));

  let acoes = [];
  try { acoes = await require('./alertas').alertas(sql, { agora: t1 }); } catch (e) { acoes = []; }

  return { geradoEm: t1, periodo: { de: t0, ate: t1 }, totais, top, pendencias, acoes };
}

function variacao(atual, anterior) {
  const d = atual - anterior;
  if (anterior === 0) return d === 0 ? '—' : `+${d} (novo)`;
  return `${d >= 0 ? '+' : ''}${d} (${d >= 0 ? '+' : ''}${Math.round((d / anterior) * 100)}%)`;
}

const BR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function renderHtml(r) {
  const V = '#0e7a5f', O = '#a8863d', N = '#0e2239';
  const th = `style="text-align:left;padding:8px;background:${N};color:#fff;font-size:12px"`;
  const td = 'style="padding:7px 8px;border-bottom:1px solid #e5e5e5;font-size:13px"';
  const t = r.totais;
  const kpi = (rot, val, sub) => `<td style="padding:10px 14px;border:1px solid #e5e5e5;border-top:3px solid ${V}"><div style="font-size:11px;color:#666">${esc(rot)}</div><div style="font-size:20px;font-weight:700;color:${N}">${esc(val)}</div><div style="font-size:11px;color:${O}">${esc(sub)}</div></td>`;
  const linhas = r.top.map((p, i) => `<tr><td ${td}>${i + 1}</td><td ${td}><b>${esc(p.nome)}</b></td><td ${td}>${p.diagnosticos}</td><td ${td}>${p.oportunidades}</td><td ${td}>${p.contratos}</td><td ${td}>${brl(p.valorContratos)}</td><td ${td}>${brl(p.creditos)}</td></tr>`).join('') ||
    `<tr><td ${td} colspan="7">Sem atividade de parceiros no período.</td></tr>`;
  const pend = r.pendencias.length
    ? `<h3 style="color:${V}">Pendências de cadastro (${r.pendencias.length})</h3><table cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th ${th}>Parceiro</th><th ${th}>Cliente</th><th ${th}>Pendência</th><th ${th}>Desde</th></tr>` +
      r.pendencias.map((p) => `<tr><td ${td}>${esc(p.parceiro)}</td><td ${td}>${esc(p.cliente)}</td><td ${td}>${esc(p.descricao)}</td><td ${td}>${BR(p.desde)}</td></tr>`).join('') + '</table>'
    : `<h3 style="color:${V}">Pendências de cadastro</h3><p style="font-size:13px">Nenhuma pendência em aberto.</p>`;
  const acoesL = r.acoes || [];
  const ROT = { card_parado: 'Card parado', diagnostico_sem_avanco: 'Diagnóstico sem avanço', contrato_nao_assinado: 'Contrato não assinado', pendencia_vencida: 'Pendência vencida' };
  const acoes = acoesL.length
    ? `<h3 style="color:${V}">Precisa de ação (${acoesL.length})</h3><table cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th ${th}>Parceiro</th><th ${th}>Cliente</th><th ${th}>Situação</th><th ${th}>Dias</th></tr>` +
      acoesL.slice(0, 40).map((x) => `<tr><td ${td}>${esc(x.parceiro)}</td><td ${td}>${esc(x.cliente)}</td><td ${td}><b>${esc(ROT[x.tipo] || x.tipo)}</b> — ${esc(x.motivo)}</td><td ${td}>${x.dias}</td></tr>`).join('') +
      (acoesL.length > 40 ? `<tr><td ${td} colspan="4">… e mais ${acoesL.length - 40} no painel Master.</td></tr>` : '') + '</table>'
    : `<h3 style="color:${V}">Precisa de ação</h3><p style="font-size:13px">Nada parado: nenhum card, diagnóstico ou contrato aguardando ação.</p>`;
  return `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;color:#222">
<div style="border-left:6px solid ${V};padding:6px 14px;margin-bottom:14px"><div style="font-size:18px;font-weight:700;color:${N}">Reversa Tax — Relatório semanal</div><div style="font-size:12px;color:${O}">${BR(r.periodo.de)} a ${BR(r.periodo.ate)} · comparado à semana anterior</div></div>
<table cellspacing="6" style="width:100%"><tr>
${kpi('Diagnósticos', t.diagnosticos, variacao(t.diagnosticos, t.diagnosticosAnt))}${kpi('Oportunidades (casos)', t.oportunidades, variacao(t.oportunidades, t.oportunidadesAnt))}
${kpi('Contratos fechados', t.contratos, variacao(t.contratos, t.contratosAnt))}${kpi('Créditos em carteira', brl(t.creditos), 'diagnósticos vigentes')}</tr></table>
<h3 style="color:${V}">Top 10 parceiros</h3>
<table cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th ${th}>#</th><th ${th}>Parceiro</th><th ${th}>Diagnósticos</th><th ${th}>Oportunidades</th><th ${th}>Contratos</th><th ${th}>Valor contratado</th><th ${th}>Créditos vigentes</th></tr>${linhas}</table>
<p style="font-size:11px;color:#777">Ranking por contratos fechados na semana e, em empate, créditos vigentes em R$. Valores são estimativas do diagnóstico, sujeitas a revisão técnica.</p>
${acoes}
${pend}
</div>`;
}

async function gerar(agora) {
  const dados = await coletar(agora);
  return { ...dados, html: renderHtml(dados), assunto: `Reversa Tax — Relatório semanal (${BR(dados.periodo.de)} a ${BR(dados.periodo.ate)})` };
}

const destinatarios = () => String(process.env.RELATORIO_DESTINATARIOS || 'atintilio@argusprime.com.br').split(',').map((s) => s.trim()).filter(Boolean);

module.exports = { coletar, renderHtml, gerar, destinatarios, variacao };
