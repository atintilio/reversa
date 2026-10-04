function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : '';
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw || '{}'); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
  res.statusCode = 303;
  Object.entries({ Location: location, 'Cache-Control': 'no-store', ...headers }).forEach(([k, v]) => res.setHeader(k, v));
  res.end();
}

function method(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } });
}

module.exports = { parseBody, json, redirect, method };
