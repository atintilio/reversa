// Recebe o contexto já autenticado pelo roteador do Reversa e reutiliza seu deny.
const { json, method } = require('../http');
const gov = require('./gov');
const evidence = require('./gov-evidence');
const exemplo = require('./gov-exemplo');

module.exports = async function govRoutes({ ctx, m, query, body, parts, deny }, res) {
  const [, sub, id, action, extra] = parts;
  deny(ctx, 'read', 'gov.read');
  // Caso de exemplo (Tupaciguara/MG): dados do caso e relatórios em PDF.
  if (sub === 'exemplo') {
    if (m !== 'GET') return method(res, ['GET']);
    if (!id) return json(res, 200, exemplo.resumo());
    if (id === 'relatorio') {
      const tipo = query.tipo === 'tecnico' ? 'tecnico' : query.tipo === 'comercial' ? 'comercial' : null;
      if (!tipo) return json(res, 400, { error: { code: 'INVALID_INPUT', message: 'Informe tipo=comercial ou tipo=tecnico.' } });
      const r = await require('./gov-relatorio')[tipo](); // carregado só ao gerar o PDF: uma falha aqui não derruba o restante da API
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(r.pdf);
    }
  }
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
