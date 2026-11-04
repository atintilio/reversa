// Utilitários puros do motor de cálculo do Reversa Gov.
// Arredondamento comercial (meio para cima) imune a ruído de ponto flutuante (ex.: 121,575 -> 121,58).
const arred = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return n;
  const x = Number((Math.abs(n) * 100).toPrecision(12));
  return Math.sign(n) * Math.round(x) / 100;
};
const MS_DIA = 86400000;
// Diferença em dias inteiros (a - b), usando datas civis (UTC) para não depender do fuso.
function diffDias(a, b) {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ua - ub) / MS_DIA);
}
class MotorCalculoError extends Error {
  constructor(message, codigo, detalhes) { super(message); this.name = 'MotorCalculoError'; this.codigo = codigo; this.detalhes = detalhes; }
}
// Validação de entrada numérica: finita e não negativa (a menos que permitido).
function num(valor, nome, { min = 0, max = Infinity, padrao } = {}) {
  if (valor == null && padrao !== undefined) return padrao;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new MotorCalculoError(`${nome} inválido.`, 'ENTRADA_INVALIDA', { campo: nome });
  }
  return valor;
}
function data(valor, nome) {
  const d = valor instanceof Date ? valor : new Date(`${String(valor).slice(0, 10)}T00:00:00Z`);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new MotorCalculoError(`${nome} inválida.`, 'ENTRADA_INVALIDA', { campo: nome });
  return d;
}
module.exports = { arred, diffDias, MotorCalculoError, num, data };
