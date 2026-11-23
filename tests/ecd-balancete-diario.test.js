const test = require('node:test');
const assert = require('node:assert');
const M = require('../motor-ecd.js');

// ECD tipo B (Livro Balancetes Diários) fictícia, com anexo J800 em várias linhas e assinatura após o 9999.
const ECD = ['|0000|LECD|01012025|31122025|EMPRESA TESTE LTDA|11222333000181|SC|||||0|0|0||0|0||N|N|0|0||',
  '|I010|B|9.00|',
  '|I050|01012025|01|S|1|1||ATIVO|', '|I050|01012025|01|A|2|1.1|1|CAIXA|', '|I050|01012025|04|A|2|4.1|1|DESPESAS|',
  '|I300|02012025|', '|I310|1.1||0|150,00|', '|I310|4.1||150,00|0|',
  '|I300|03012025|', '|I310|1.1||0|50,50|', '|I310|4.1||50,50|0|',
  '|J800|099|Balanço|ABC|e1xydGYx', 'YXJzZXQwXGZw', 'cnEyIEFyaWFs|J800FIM|',
  '|9999|13|', 'SBRCAAEPDR0 assinatura', 'ICP-Brasil'].join('\r\n');

test('ECD tipo B: I300/I310 viram lançamentos diários, anexo J800 e assinatura não geram aviso', () => {
  const l = M.lerEcd(ECD, 'b.txt');
  const r = M.resumo(l);
  assert.strictEqual(r.lancamentos, 2);
  assert.strictEqual(r.partidas, 4);
  assert.strictEqual(r.totalDebitos, 200.5);
  assert.strictEqual(r.partidasDobradasOk, true);
  assert.deepStrictEqual(r.avisos, []);
});
