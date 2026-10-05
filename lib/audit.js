const { getSql } = require('./db');

// Eventos de produto/segurança em audit_events (PRD §12). Nunca grava e-mail, senha, token, cookie ou IP em claro.
// Falha de auditoria não interrompe o fluxo do usuário; registra apenas o tipo do erro.
async function audit(eventType, { outcome = 'success', actorUserId = null, organizationId = null, entityType = null, entityId = null, metadata = {} } = {}) {
  try {
    const sql = getSql();
    await sql`
      insert into audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, outcome, metadata, created_at)
      values (${organizationId}, ${actorUserId}, ${eventType}, ${entityType}, ${entityId}, ${outcome}, ${JSON.stringify(metadata)}::jsonb, now())`;
  } catch (error) {
    console.error('audit_write_error', error.name || 'Error');
  }
}

module.exports = { audit };
