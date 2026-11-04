// Reversa Gov — serviço do motor de cálculo: parâmetros (tabela gov_parametros sobre os padrões),
// execução dos cálculos e histórico auditável (gov_calculos). O núcleo puro fica em ./motor.
const { getSql } = require('../db');
const { audit } = require('../audit');
const { HttpError } = require('../authz');
const V = require('./gov-validation');
const motor = require('./motor');
const { MotorCalculoError } = motor.util;

const PADROES = {
  irrf: motor.parametros.IRRF_2026, inss: motor.parametros.INSS_2026,
  previdenciario: motor.parametros.PREVIDENCIARIO_2026, retencao_fornecedor: motor.parametros.RETENCAO_FORNECEDOR
};

// Vigente = vigencia_inicio <= hoje e (vigencia_fim nula ou >= hoje); a mais recente vence. Sem linha: padrão do código.
async function carregarParametros(hoje = new Date()) {
  const dia = hoje.toISOString().slice(0, 10);
  const out = { ...PADROES };
  try {
    const rows = await getSql()`
      select distinct on (chave) chave, valor from gov_parametros
      where vigencia_inicio <= ${dia}::date and (vigencia_fim is null or vigencia_fim >= ${dia}::date)
      order by chave, vigencia_inicio desc`;
    rows.forEach((r) => { if (r.chave in out) out[r.chave] = r.valor; });
  } catch (e) { console.error('gov_parametros_read_error', e.name || 'Error'); }
  return out;
}

// Erros do motor viram 400 com código estável para o front.
async function executar(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof MotorCalculoError) throw new HttpError(400, e.codigo, e.message);
    throw e;
  }
}

async function exigirMunicipio(ibge) {
  const code = V.text(ibge, 'IBGE', 7);
  if (!/^\d{7}$/.test(code)) V.invalid('IBGE inválido.');
  const r = await getSql()`select ibge_code, name, state from gov_catalogo_municipios where ibge_code = ${code}`;
  if (!r.length) throw new HttpError(404, 'MUNICIPALITY_NOT_FOUND', 'Município não encontrado no catálogo.');
  return r[0];
}

async function registrar(ctx, tipo, ibge, entrada, resultado) {
  const row = (await getSql()`
    insert into gov_calculos (organization_id, ibge_code, tipo, entrada, resultado, versao_motor, created_by)
    values (${ctx.organization.id}, ${ibge || null}, ${tipo}, ${JSON.stringify(entrada)}::jsonb, ${JSON.stringify(resultado)}::jsonb, ${motor.VERSAO}, ${ctx.user.id})
    returning id, created_at`)[0];
  await audit('gov.calculo.executado', { organizationId: ctx.organization.id, actorUserId: ctx.user.id, entityType: 'gov_calculo', entityId: row.id, metadata: { tipo, ibge: ibge || null, versaoMotor: motor.VERSAO } });
  return row;
}

const corpo = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : V.invalid('Corpo da requisição inválido.'));

async function calcularIRRPF(ctx, body) {
  const b = corpo(body);
  const p = await carregarParametros();
  const resultado = await executar(() => motor.irrf.calcularIRRFMensal(p.irrf, p.inss, b));
  const reg = await registrar(ctx, 'calculadora.irrpf', null, b, resultado);
  return { ...resultado, calculoId: reg.id, versaoMotor: motor.VERSAO };
}

async function calcularCompensacao(ctx, body) {
  const b = corpo(body);
  const p = await carregarParametros();
  const resultado = await executar(() => motor.previdenciaria.estimarCompensacao(b, p.previdenciario, p.inss.tetoRGPS));
  const reg = await registrar(ctx, 'calculadora.compensacao', null, b, resultado);
  return { ...resultado, calculoId: reg.id, versaoMotor: motor.VERSAO };
}

async function diagnosticoPrevidenciario(ctx, body) {
  const b = corpo(body);
  const mun = await exigirMunicipio(b.ibge);
  const p = await carregarParametros();
  const resultado = await executar(() => motor.diagnostico.diagnosticoPrevidenciario(b, p.previdenciario, { tetoRGPS: p.inss.tetoRGPS }));
  const reg = await registrar(ctx, 'diagnostico.previdenciario', mun.ibge_code, b, resultado);
  return { ibge: mun.ibge_code, municipio: mun.name, uf: mun.state, ...resultado, calculoId: reg.id, versaoMotor: motor.VERSAO };
}

async function diagnosticoIRRF(ctx, body) {
  const b = corpo(body);
  const mun = await exigirMunicipio(b.ibge);
  const p = await carregarParametros();
  const resultado = await executar(() => motor.diagnostico.diagnosticoIRRF(b, { irrf: p.irrf, inss: p.inss, retencao: p.retencao_fornecedor }));
  const reg = await registrar(ctx, 'diagnostico.irrf', mun.ibge_code, b, resultado);
  return { ibge: mun.ibge_code, municipio: mun.name, uf: mun.state, ...resultado, calculoId: reg.id, versaoMotor: motor.VERSAO };
}

// Score consolidado do município: último diagnóstico de cada módulo da organização.
async function score(ctx, ibge) {
  const mun = await exigirMunicipio(ibge);
  const rows = await getSql()`
    select distinct on (tipo) tipo, resultado, created_at from gov_calculos
    where organization_id = ${ctx.organization.id} and ibge_code = ${mun.ibge_code} and tipo in ('diagnostico.previdenciario', 'diagnostico.irrf')
    order by tipo, created_at desc`;
  const prev = rows.find((r) => r.tipo === 'diagnostico.previdenciario');
  const fis = rows.find((r) => r.tipo === 'diagnostico.irrf');
  if (!prev && !fis) throw new HttpError(404, 'NO_DIAGNOSTIC', 'Este município ainda não tem diagnóstico.');
  const s = motor.diagnostico.scoreConsolidado(prev ? prev.resultado.scorePrevidenciario : undefined, fis ? fis.resultado.scoreFiscal : undefined);
  const datas = [prev, fis].filter(Boolean).map((r) => new Date(r.created_at).getTime());
  return { ibge: mun.ibge_code, municipio: mun.name, ...s, ultimoDiagnostico: new Date(Math.max(...datas)).toISOString() };
}

module.exports = { carregarParametros, calcularIRRPF, calcularCompensacao, diagnosticoPrevidenciario, diagnosticoIRRF, score };
