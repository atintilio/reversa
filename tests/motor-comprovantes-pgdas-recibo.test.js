const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../motor-comprovantes.js');

test('recibo PGDAS-D é reconhecido e fica disponível para cruzamento', () => {
  const texto = `RECIBO DE ENTREGA DA APURAÇÃO NO PGDAS-D
Nome Empresarial CNPJ da Matriz
PERSONAL DESIGN PECAS AUTOMOTIVAS LTDA 05.875.580/0001-84
Período de
Apuração
01/2024
Total do
Débito
Exigível
R$ 449,84
Número do Recibo
01.07.26251.0192194-1`;
  const r = M.lerPdfTexto(texto, 'PGDASD-RECIBO.pdf');
  assert.equal(r.tipo, 'PGDAS-RECIBO');
  assert.equal(r.cnpj, '05875580000184');
  assert.equal(r.competencia, '2024-01');
  assert.equal(r.valorTotal, 449.84);
  assert.deepEqual(r.erros, []);
});
