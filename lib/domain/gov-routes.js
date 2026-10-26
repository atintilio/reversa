// Recebe o contexto já autenticado pelo roteador do Reversa e reutiliza seu deny.
const { json, method } = require('../http');
const gov = require('./gov');
const evidence = require('./gov-evidence');

module.exports = async function govRoutes({ ctx, m, query, body, parts, deny }, res) {
  const [, sub, id, action, extra] = parts;
  deny(ctx, 'read', 'gov.read');
  if (extra) return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota Gov não encontrada.' } });
  if (sub === 'municipios' && !id) {
    if (m === 'GET') return json(res, 200, await gov.listarMunicipios(ctx, query));
    if (m === 'POST') {
      deny(ctx, 'write', 'gov.municipio.create');
      return json(res, 201, await gov.criarMunicipio(ctx, body));
    }
    return method(res, ['GET', 'POST']);
  }
  if (sub === 'candidatos' && !id) {
    if (m === 'GET') return json(res, 200, await gov.listarCandidatos(ctx, query));
    if (m === 'POST') {
      deny(ctx, 'write', 'gov.candidato.create');
      return json(res, 201, await gov.criarCandidato(ctx, body));
    }
    return method(res, ['GET', 'POST']);
  }
  if (sub === 'candidatos' && id && !action) {
    if (m === 'GET') return json(res, 200, await gov.obterCandidato(ctx, id));
    return method(res, ['GET']);
  }
  if (sub === 'candidatos' && id && action === 'evidencias') {
    if (m === 'GET') return json(res, 200, await evidence.listarEvidencias(ctx, id));
    if (m === 'POST') {
      deny(ctx, 'write', 'gov.evidencia.create');
      return json(res, 201, await evidence.vincularEvidencia(ctx, id, body));
    }
    return method(res, ['GET', 'POST']);
  }
  if (sub === 'candidatos' && id && action === 'revisao') {
    if (m !== 'POST') return method(res, ['POST']);
    deny(ctx, 'review', 'gov.candidato.review');
    return json(res, 201, await evidence.registrarRevisao(ctx, id, body));
  }
  if (sub === 'dashboard' && !id) {
    if (m !== 'GET') return method(res, ['GET']);
    return json(res, 200, await gov.dashboard(ctx));
  }
  return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota Gov não encontrada.' } });
};
