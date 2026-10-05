async function graphAccessToken() {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`MAIL_TOKEN_${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('MAIL_TOKEN_EMPTY');
  return data.access_token;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendPasswordReset({ to, token, name }) {
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM;
  const graphUser = process.env.MS_GRAPH_USER_ID || from;
  const baseUrl = process.env.APP_BASE_URL || 'https://reversa.argusprime.com.br';
  if (!from || !graphUser || !baseUrl) throw new Error('MAIL_SENDER_NOT_CONFIGURED');
  const accessToken = await graphAccessToken();
  const link = `${baseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(token)}`;
  const html = `<p>Olá${name ? `, ${escapeHtml(name)}` : ''}.</p><p>Recebemos uma solicitação para redefinir a senha da sua conta Reversa Tax.</p><p><a href="${escapeHtml(link)}">Criar nova senha</a></p><p>O link expira em 30 minutos e pode ser usado uma única vez.</p><p>Se você não solicitou esta alteração, ignore esta mensagem. Nunca envie sua senha por e-mail.</p>`;
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graphUser)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: 'Redefinição de senha — Reversa Tax',
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        replyTo: process.env.MAIL_REPLY_TO ? [{ emailAddress: { address: process.env.MAIL_REPLY_TO } }] : undefined
      },
      saveToSentItems: true
    })
  });
  if (!response.ok) throw new Error(`MAIL_SEND_${response.status}`);
  return { accepted: true };
}

async function sendGraphMail({ to, subject, html }) {
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM;
  const graphUser = process.env.MS_GRAPH_USER_ID || from;
  if (!from || !graphUser) throw new Error('MAIL_SENDER_NOT_CONFIGURED');
  const accessToken = await graphAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graphUser)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        replyTo: process.env.MAIL_REPLY_TO ? [{ emailAddress: { address: process.env.MAIL_REPLY_TO } }] : undefined
      },
      saveToSentItems: true
    })
  });
  if (!response.ok) throw new Error(`MAIL_SEND_${response.status}`);
  return { accepted: true };
}

// Convite de novo usuário: mesmo mecanismo de token do reset (hash, uso único), com validade de 48 horas.
async function sendInvite({ to, token, name, inviterName, organizationName }) {
  const baseUrl = (process.env.APP_BASE_URL || 'https://reversa.argusprime.com.br').replace(/\/$/, '');
  const link = `${baseUrl}/reset-password.html?convite=1&token=${encodeURIComponent(token)}`;
  const html = `<p>Olá${name ? `, ${escapeHtml(name)}` : ''}.</p><p>${escapeHtml(inviterName || 'A Argus Prime')} convidou você para acessar a Reversa Tax${organizationName ? ` (${escapeHtml(organizationName)})` : ''}.</p><p><a href="${escapeHtml(link)}">Criar minha senha</a></p><p>O link expira em 48 horas e pode ser usado uma única vez. A senha deve ter pelo menos 12 caracteres.</p><p>Se você não esperava este convite, ignore esta mensagem.</p><p>Reversa Tax — Diagnóstico preciso. Recuperação inteligente.</p>`;
  return sendGraphMail({ to, subject: 'Convite de acesso — Reversa Tax', html });
}

module.exports = { sendPasswordReset, sendInvite };
