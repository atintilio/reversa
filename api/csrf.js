const { randomToken } = require('../lib/security');
const { json, method } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return method(res, ['GET']);
  const token = randomToken(32);
  res.setHeader('Set-Cookie', `rv_csrf=${token}; Path=/; Max-Age=3600; Secure; SameSite=Strict`);
  return json(res, 200, { token });
};
