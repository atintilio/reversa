const { HttpError } = require('../authz');
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
function invalid(message, code = 'INVALID_INPUT') { throw new HttpError(400, code, message); }
function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) invalid('Identificador inválido.');
  return value;
}
function text(value, name, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${name} inválido.`);
  return value.trim();
}
function amount(value, fallback = 0) {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) invalid('Valores monetários devem ser inteiros não negativos em centavos.');
  return value;
}
function choice(value, allowed, name) {
  if (value != null && !allowed.includes(value)) invalid(`${name} inválido.`);
  return value ?? null;
}
function period(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid('Período inválido.');
  return value;
}
module.exports = { uuid, text, amount, choice, period, invalid, UFS };
