// Reversa Gov — casos (CRM/funil por município): criação com diagnóstico, etapas, histórico e numeração atômica.
const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError } = require('../authz');
const V = require('./gov-validation');
const motor = require('./gov-motor');

const TIPOS = ['fiscal', 'previdenciario', 'consolidado'];
const ETAPAS = ['a_apresentar', 'apresentado', 'em_analise_municipio', 'validacao_tecnica', 'proposta_contrato', 'em_execucao', 'concluido', 'perdido_pausado'];
const IBGE_TUPACIGUARA = '3169604';
const VALOR_TUPACIGUARA = 1830000; // cenário Referência de gov-exemplo.js

const COLS = `c.id, c.numero, c.ibge_code, c.tipo, c.etapa, c.valor_estimado, c.periodo_anos, c.entrada, c.resultado,
  c.calculo_ids, c.responsavel_id, c.motivo_perda, c.created_by, c.created_at, c.updated_at,
  m.name as municipio, m.state as uf, u.name as responsavel_nome`;

function dto(r) {
  return {
    id: r.id, numero: r.numero, ibge: r.ibge_code, municipio: r.municipio, uf: r.uf, tipo: r.tipo, etapa: r.etapa,
    valorEstimado: r.valor_estimado == null ? null : Number(r.valor_estimado),
    periodoAnos: r.periodo_anos, entrada: r.entrada, resultado: r.resultado, calculoIds: r.calculo_ids || [],
    responsavelId: r.responsavel_id, responsavelNome: r.responsavel_nome || null, motivoPerda: r.motivo_perda,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at
  };
}

const objeto = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : V.invalid('Corpo da requisição inválido.'));

function valorOuNulo(v) {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 9999999999999) V.invalid('Valor estimado inválido.');
  return Math.round(v * 100) / 100;
}

async function proximoNumero(orgId) {
  const ano = new Date().getFullYear();
  const r = (await getSql()`
    insert into gov_numeracao (organization_id, ano, ultimo) values (${orgId}, ${ano}, 1)
    on conflict (organization_id, ano) do update set ultimo = gov_numeracao.ultimo + 1
    returning ultimo`)[0];
  return `RGV-${ano}-${String(r.ultimo).padStart(4, '0')}`;
}

async function executarMotor(ctx, ibge, tipo, entrada) {
  const comIbge = (e) => ({ ...e, ibge });
  const ePrev = tipo === 'consolidado' && entrada.previdenciario ? entrada.previdenciario : entrada;
  const eFis = tipo === 'consolidado' && entrada.fiscal ? entrada.fiscal : entrada;
  const resultado = { previdenciario: null, fiscal: null, score: null };
  const ids = [];
  if (tipo !== 'fiscal') {
    resultado.previdenciario = await motor.diagnosticoPrevidenciario(ctx, comIbge(objeto(ePrev)));
    ids.push(resultado.previdenciario.calculoId);
  }
  if (tipo !== 'previdenciario') {
    resultado.fiscal = await motor.diagnosticoIRRF(ctx, comIbge(objeto(eFis)));
    ids.push(resultado.fiscal.calculoId);
  }
  resultado.score = await motor.score(ctx, ibge);
  return { resultado, ids };
}

async function inserirCaso(ctx, { ibge, tipo, entrada, resultado, ids, valor, extraHistorico }) {
  const sql = getSql();
  const numero = await proximoNumero(ctx.organization.id);
  const row = (await sql`
    insert into gov_casos (organization_id, numero, ibge_code, tipo, etapa, valor_estimado, entrada, resultado, calculo_ids, created_by)
    values (${ctx.organization.id}, ${numero}, ${ibge}, ${tipo}, 'a_apresentar', ${valor},
      ${entrada == null ? null : JSON.stringify(entrada)}::jsonb, ${resultado == null ? null : JSON.stringify(resultado)}::jsonb,
      ${JSON.stringify(ids || [])}::jsonb, ${ctx.user.id})
    returning id, numero`)[0];
  await sql`insert into gov_caso_historico (caso_id, de, para, nota, por) values (${row.id}, null, 'a_apresentar', ${extraHistorico || 'Caso criado'}, ${ctx.user.id})`;
  await audit('gov.caso.criado', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'gov_caso', entityId: row.id, metadata: { numero: row.numero, ibge, tipo } });
  return obterCaso(ctx, row.id);
}

async function exigirMunicipio(ibge) {
  if (typeof ibge !== 'string' || !/^\d{7}$/.test(ibge.trim())) V.invalid('IBGE inválido.');
  const code = ibge.trim();
  const r = await getSql()`select ibge_code from gov_catalogo_municipios where ibge_code = ${code}`;
  if (!r.length) throw new HttpError(404, 'MUNICIPALITY_NOT_FOUND', 'Município não encontrado no catálogo.');
  return code;
}

async function criarCaso(ctx, body) {
  const b = objeto(body);
  const ibge = await exigirMunicipio(b.ibge);
  if (!TIPOS.includes(b.tipo)) V.invalid('Tipo inválido: use fiscal, previdenciario ou consolidado.');
  const entrada = b.entrada == null ? null : objeto(b.entrada);
  let valor = entrada ? valorOuNulo(entrada.valorEstimado) : null;
  if (valor == null && ibge === IBGE_TUPACIGUARA) valor = VALOR_TUPACIGUARA;
  let resultado = null; let ids = [];
  if (entrada) ({ resultado, ids } = await executarMotor(ctx, ibge, b.tipo, entrada));
  return inserirCaso(ctx, { ibge, tipo: b.tipo, entrada, resultado, ids, valor });
}

// Cria o caso de exemplo (Tupaciguara) se a organização ainda não tiver um.
async function criarCasoExemplo(ctx) {
  const ja = await getSql()`select id from gov_casos where organization_id = ${ctx.organization.id} and ibge_code = ${IBGE_TUPACIGUARA} and entrada->>'exemplo' = 'true' order by created_at limit 1`;
  if (ja.length) return { criado: false, caso: await obterCaso(ctx, ja[0].id) };
  await exigirMunicipio(IBGE_TUPACIGUARA);
  const caso = await inserirCaso(ctx, { ibge: IBGE_TUPACIGUARA, tipo: 'consolidado', entrada: { exemplo: true }, resultado: null, ids: [], valor: VALOR_TUPACIGUARA, extraHistorico: 'Caso de exemplo criado' });
  return { criado: true, caso };
}

async function listarCasos(ctx, query = {}) {
  const etapa = query.etapa ? (ETAPAS.includes(query.etapa) ? query.etapa : V.invalid('Etapa inválida.')) : null;
  const ibge = query.ibge ? V.text(String(query.ibge), 'IBGE', 7) : null;
  const q = query.q ? V.text(String(query.q), 'Busca', 80).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : null;
  const like = q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const rows = await getSql()`
    select c.id, c.numero, c.ibge_code, c.tipo, c.etapa, c.valor_estimado, c.periodo_anos, c.entrada, c.resultado,
      c.calculo_ids, c.responsavel_id, c.motivo_perda, c.created_by, c.created_at, c.updated_at,
      m.name as municipio, m.state as uf, u.name as responsavel_nome
    from gov_casos c
    join gov_catalogo_municipios m on m.ibge_code = c.ibge_code
    left join users u on u.id = c.responsavel_id
    where c.organization_id = ${ctx.organization.id}
      and (${etapa}::text is null or c.etapa = ${etapa})
      and (${ibge}::text is null or c.ibge_code = ${ibge})
      and (${like}::text is null or lower(c.numero) like ${like} or m.name_search like ${like})
    order by c.created_at desc, c.numero desc`;
  const casos = rows.map(dto);
  const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, { total: 0, valorEstimado: 0, casos: [] }]));
  for (const c of casos) {
    const g = porEtapa[c.etapa];
    g.total += 1; g.valorEstimado += c.valorEstimado || 0; g.casos.push(c);
  }
  return { casos, porEtapa, etapas: ETAPAS, total: casos.length };
}

async function obterCaso(ctx, id) {
  V.uuid(id);
  const sql = getSql();
  const rows = await sql`
    select c.id, c.numero, c.ibge_code, c.tipo, c.etapa, c.valor_estimado, c.periodo_anos, c.entrada, c.resultado,
      c.calculo_ids, c.responsavel_id, c.motivo_perda, c.created_by, c.created_at, c.updated_at,
      m.name as municipio, m.state as uf, u.name as responsavel_nome
    from gov_casos c
    join gov_catalogo_municipios m on m.ibge_code = c.ibge_code
    left join users u on u.id = c.responsavel_id
    where c.id = ${id} and c.organization_id = ${ctx.organization.id}`;
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'Caso não encontrado.');
  const hist = await sql`
    select h.id, h.de, h.para, h.nota, h.por, h.em, u.name as por_nome
    from gov_caso_historico h left join users u on u.id = h.por
    where h.caso_id = ${id} order by h.em, h.id`;
  return { ...dto(rows[0]), historico: hist.map((h) => ({ id: h.id, de: h.de, para: h.para, nota: h.nota, por: h.por, porNome: h.por_nome || null, em: h.em })) };
}

async function moverEtapa(ctx, id, body) {
  const b = objeto(body);
  V.uuid(id);
  if (!ETAPAS.includes(b.etapa)) V.invalid('Etapa inválida.');
  const nota = b.nota == null || b.nota === '' ? null : V.text(b.nota, 'Nota', 2000);
  if (b.etapa === 'perdido_pausado' && !nota) V.invalid('Informe o motivo ao marcar o caso como perdido/pausado.');
  const sql = getSql();
  const atual = (await sql`select etapa from gov_casos where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  if (!atual) throw new HttpError(404, 'NOT_FOUND', 'Caso não encontrado.');
  if (atual.etapa === b.etapa) V.invalid('O caso já está nesta etapa.');
  const motivo = b.etapa === 'perdido_pausado' ? nota : null;
  await sql`update gov_casos set etapa = ${b.etapa}, motivo_perda = ${motivo}, updated_at = now() where id = ${id} and organization_id = ${ctx.organization.id}`;
  await sql`insert into gov_caso_historico (caso_id, de, para, nota, por) values (${id}, ${atual.etapa}, ${b.etapa}, ${nota}, ${ctx.user.id})`;
  await audit('gov.caso.etapa', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'gov_caso', entityId: id, metadata: { de: atual.etapa, para: b.etapa } });
  return obterCaso(ctx, id);
}

async function atualizarCaso(ctx, id, body) {
  const b = objeto(body);
  V.uuid(id);
  const sql = getSql();
  const atual = (await sql`select id, responsavel_id, valor_estimado from gov_casos where id = ${id} and organization_id = ${ctx.organization.id}`)[0];
  if (!atual) throw new HttpError(404, 'NOT_FOUND', 'Caso não encontrado.');
  let responsavel = atual.responsavel_id;
  let valor = atual.valor_estimado;
  const mudou = {};
  if ('responsavelId' in b) {
    if (b.responsavelId == null) responsavel = null;
    else {
      V.uuid(b.responsavelId);
      const mem = await sql`select 1 from organization_members where organization_id = ${ctx.organization.id} and user_id = ${b.responsavelId} and status = 'active'`;
      if (!mem.length) V.invalid('Responsável não pertence à organização.');
      responsavel = b.responsavelId;
    }
    mudou.responsavelId = responsavel;
  }
  if ('valorEstimado' in b) { valor = valorOuNulo(b.valorEstimado); mudou.valorEstimado = valor; }
  if (!Object.keys(mudou).length) V.invalid('Nada para atualizar: informe responsavelId ou valorEstimado.');
  await sql`update gov_casos set responsavel_id = ${responsavel}, valor_estimado = ${valor}, updated_at = now() where id = ${id} and organization_id = ${ctx.organization.id}`;
  await audit('gov.caso.atualizado', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'gov_caso', entityId: id, metadata: mudou });
  return obterCaso(ctx, id);
}

module.exports = { TIPOS, ETAPAS, IBGE_TUPACIGUARA, criarCaso, criarCasoExemplo, listarCasos, obterCaso, moverEtapa, atualizarCaso };
