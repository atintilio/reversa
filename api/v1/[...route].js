// Roteador único do domínio (/api/v1/*) — uma função serverless só, para caber no limite do plano Hobby.
// Toda rota autentica, resolve a organização do usuário e checa o papel no backend (Tech Spec §13).
const { parseBody, json, method } = require('../../lib/http');
const { context, can, permissions, HttpError } = require('../../lib/authz');
const { audit } = require('../../lib/audit');
const members = require('../../lib/domain/members');
const tax = require('../../lib/domain/tax');

function deny(ctx, permission, action) {
  if (can(ctx, permission)) return;
  audit('authz.denied', { outcome: 'denied', organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { action, role: ctx.role } });
  throw new HttpError(403, 'FORBIDDEN', 'Seu perfil não permite esta ação.');
}

function segments(req) {
  const path = String(req.url || '').split('?')[0].replace(/^\/api\/v1\/?/, '');
  return path.split('/').filter(Boolean).map(decodeURIComponent);
}

async function route(req, res) {
  const [resource, id, action] = segments(req);
  const m = req.method;
  const query = req.query || {};
  const body = ['POST', 'PATCH', 'PUT'].includes(m) ? parseBody(req) : {};
  const ctx = await context(req);

  switch (resource) {
    case 'me':
      if (m !== 'GET') return method(res, ['GET']);
      return json(res, 200, { user: { name: ctx.user.name, email: ctx.user.email, legacy: ctx.user.legacy }, organization: ctx.organization, role: ctx.role, permissions: permissions(ctx) });

    case 'members':
      deny(ctx, 'manageMembers', 'members');
      if (!id) {
        if (m === 'GET') return json(res, 200, { members: await members.list(ctx), mailConfigured: Boolean(process.env.MS_CLIENT_SECRET) });
        if (m === 'POST') return json(res, 201, await members.invite(ctx, body));
        return method(res, ['GET', 'POST']);
      }
      if (action === 'resend' && m === 'POST') return json(res, 200, await members.resend(ctx, id));
      if (!action && m === 'PATCH') { await members.update(ctx, id, body); return json(res, 200, { ok: true }); }
      if (!action && m === 'DELETE') { await members.remove(ctx, id); return json(res, 200, { ok: true }); }
      return method(res, ['PATCH', 'DELETE', 'POST']);

    case 'taxpayers':
      if (!id) {
        if (m === 'GET') return json(res, 200, { taxpayers: await tax.listTaxpayers(ctx, query) });
        if (m === 'POST') { deny(ctx, 'write', 'taxpayer.create'); return json(res, 201, await tax.createTaxpayer(ctx, body)); }
        return method(res, ['GET', 'POST']);
      }
      if (m === 'GET') return json(res, 200, await tax.getTaxpayer(ctx, id));
      if (m === 'PATCH') { deny(ctx, 'write', 'taxpayer.update'); await tax.updateTaxpayer(ctx, id, body); return json(res, 200, { ok: true }); }
      return method(res, ['GET', 'PATCH']);

    case 'cases':
      if (!id) {
        if (m === 'GET') return json(res, 200, await tax.listCases(ctx, query));
        if (m === 'POST') { deny(ctx, 'write', 'case.create'); return json(res, 201, await tax.createCase(ctx, body)); }
        return method(res, ['GET', 'POST']);
      }
      if (m === 'PATCH') { deny(ctx, 'write', 'case.update'); await tax.updateCase(ctx, id, body); return json(res, 200, { ok: true }); }
      return method(res, ['PATCH']);

    case 'analyses':
      if (!id && m === 'POST') { deny(ctx, 'write', 'analysis.create'); return json(res, 201, await tax.saveAnalyses(ctx, body)); }
      if (id && action === 'review' && m === 'POST') { deny(ctx, 'review', 'analysis.review'); return json(res, 200, await tax.review(ctx, id, body)); }
      return method(res, ['POST']);

    case 'dashboard':
      if (m !== 'GET') return method(res, ['GET']);
      return json(res, 200, await tax.dashboard(ctx));

    default:
      return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  }
}

module.exports = async function handler(req, res) {
  try {
    await route(req, res);
  } catch (error) {
    if (error instanceof HttpError) return json(res, error.status, { error: { code: error.code, message: error.message } });
    console.error('api_v1_error', error.name || 'Error', String(error.code || ''));
    return json(res, 500, { error: { code: 'INTERNAL', message: 'Erro interno. Tente novamente.' } });
  }
};
