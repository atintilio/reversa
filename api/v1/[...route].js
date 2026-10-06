// Roteador único do domínio (/api/v1/*) — uma função serverless só, para caber no limite do plano Hobby.
// Toda rota autentica, resolve a organização do usuário e checa o papel no backend (Tech Spec §13).
const { parseBody, json, method } = require('../../lib/http');
const { context, can, permissions, HttpError } = require('../../lib/authz');
const { audit } = require('../../lib/audit');
const members = require('../../lib/domain/members');
const tax = require('../../lib/domain/tax');
const crm = require('../../lib/domain/crm');
const leidobem = require('../../lib/domain/leidobem');

function deny(ctx, permission, action) {
  if (can(ctx, permission)) return;
  audit('authz.denied', { outcome: 'denied', organizationId: ctx.organization.id, actorUserId: ctx.user.id, metadata: { action, role: ctx.role } });
  throw new HttpError(403, 'FORBIDDEN', 'Seu perfil não permite esta ação.');
}

function segments(req) {
  // Rotas de vários níveis chegam reescritas (vercel.json) com o caminho original em ?rvpath=.
  const rv = req.query && req.query.rvpath;
  const path = rv ? String(rv) : String(req.url || '').split('?')[0].replace(/^\/api\/v1\/?/, '');
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

    case 'crm': {
      // /crm/pipeline · /crm/tasks · /crm/members · /crm/clients/:id[/cnpj|/agent] · /crm/contacts[/:id] · /crm/activities[/:id]
      const [, sub, sid, sact] = segments(req);
      if (sub === 'pipeline' && m === 'GET') return json(res, 200, await crm.pipeline(ctx));
      if (sub === 'tasks' && m === 'GET') return json(res, 200, await crm.tasks(ctx, query));
      if (sub === 'members' && m === 'GET') return json(res, 200, await crm.members(ctx));
      if (sub === 'clients' && sid && !sact && m === 'GET') return json(res, 200, await crm.client(ctx, sid));
      if (sub === 'clients' && sid && sact === 'report' && m === 'GET') {
        const r = await crm.report(ctx, sid, query);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.end(r.pdf);
      }
      if (sub === 'clients' && sid && sact === 'cnpj' && m === 'POST') { deny(ctx, 'write', 'crm.cnpj'); return json(res, 200, await crm.refreshCnpj(ctx, sid)); }
      if (sub === 'clients' && sid && sact === 'agent' && m === 'POST') { deny(ctx, 'write', 'crm.agent'); return json(res, 200, await crm.runAgent(ctx, sid, body)); }
      if (sub === 'contacts') {
        deny(ctx, 'write', 'crm.contact');
        if (!sid && m === 'POST') return json(res, 201, await crm.createContact(ctx, body));
        if (sid && m === 'PATCH') { await crm.updateContact(ctx, sid, body); return json(res, 200, { ok: true }); }
        if (sid && m === 'DELETE') { await crm.deleteContact(ctx, sid); return json(res, 200, { ok: true }); }
      }
      if (sub === 'activities') {
        deny(ctx, 'write', 'crm.activity');
        if (!sid && m === 'POST') return json(res, 201, await crm.createActivity(ctx, body));
        if (sid && m === 'PATCH') { await crm.updateActivity(ctx, sid, body); return json(res, 200, { ok: true }); }
        if (sid && m === 'DELETE') { await crm.deleteActivity(ctx, sid); return json(res, 200, { ok: true }); }
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
    }

    case 'leidobem': {
      // /leidobem/casos · /leidobem/casos/:id · /leidobem/casos/:id/revisao · /leidobem/casos/:id/recibo
      const [, sub, sid, sact] = segments(req);
      if (sub !== 'casos') return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
      if (!sid && m === 'GET') return json(res, 200, await leidobem.list(ctx));
      if (!sid && m === 'POST') { deny(ctx, 'write', 'ldb.create'); return json(res, 201, await leidobem.create(ctx, body)); }
      if (sid && !sact && m === 'GET') return json(res, 200, await leidobem.get(ctx, sid));
      if (sid && !sact && m === 'PATCH') { deny(ctx, 'write', 'ldb.save'); return json(res, 200, await leidobem.save(ctx, sid, body)); }
      if (sid && sact === 'revisao' && m === 'POST') { deny(ctx, 'write', 'ldb.review'); return json(res, 200, await leidobem.review(ctx, sid, body)); }
      if (sid && sact === 'recibo' && m === 'POST') { deny(ctx, 'review', 'ldb.receipt'); return json(res, 200, await leidobem.receipt(ctx, sid, body)); }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
    }

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
