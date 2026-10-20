// Cron semanal (vercel.json: quarta 23:00 UTC = 20h Brasília). Protegido por CRON_SECRET (Authorization: Bearer).
const crypto = require('node:crypto');
const { json, method } = require('../lib/http');
const { gerar, destinatarios } = require('../lib/relatorio-semanal');
const { sendRelatorioSemanal } = require('../lib/mailer');

const igual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return method(res, ['GET']);
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return json(res, 503, { error: { code: 'CRON_NOT_CONFIGURED', message: 'CRON_SECRET não configurado.' } });
  const auth = String((req.headers && req.headers.authorization) || '');
  if (!igual(auth, `Bearer ${segredo}`)) return json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } });
  try {
    const rel = await gerar(new Date());
    const q = req.query || {};
    if (String(q.dry || '') === '1') return json(res, 200, { dry: true, assunto: rel.assunto, destinatarios: destinatarios(), totais: rel.totais, top: rel.top, pendencias: rel.pendencias, html: rel.html });
    const envios = [];
    for (const to of destinatarios()) {
      try { await sendRelatorioSemanal({ to, subject: rel.assunto, html: rel.html }); envios.push({ to, ok: true }); }
      catch (e) { envios.push({ to, ok: false, erro: e.message }); }
    }
    return json(res, envios.every((e) => e.ok) ? 200 : 502, { enviado: envios.every((e) => e.ok), envios, totais: rel.totais });
  } catch (e) {
    console.error('cron_semanal_error', e.name || 'Error');
    return json(res, 500, { error: { code: 'REPORT_FAILED', message: 'Falha ao gerar o relatório semanal.' } });
  }
};
