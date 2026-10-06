// Motor da Lei do Bem: parsers (ECF, ECD, folha, NF-e, NFS-e), cálculo conforme o art. 19 da Lei 11.196/2005,
// limites do art. 8º da IN RFB 1.187/2011, validações de dispêndios, FORMP&D e documentos.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../leidobem-motor.js');

const ECF = [
  '|0000|LECF|0010|11222333000181|EMPRESA TESTE LTDA|0|0|||01012025|31122025|N||0||',
  '|0010||N|N|1|A|01|||||||||',
  '|M030|01012025|31122025|A00|',
  '|M300|93.01|Exclusão diversa|E|1|1000,00|ajuste|',
  '|N030|01012025|31122025|A00|',
  '|N500|1|LUCRO LÍQUIDO ANTES DO IRPJ|900000,00|',
  '|N500|175|LUCRO REAL ANTES DA COMPENSAÇÃO DE PREJUÍZOS DO PRÓPRIO PERÍODO|800000,00|',
  '|N630|1|BASE DE CÁLCULO DO IRPJ|800000,00|',
  '|N650|1|BASE DE CÁLCULO DA CSLL ANTES DA COMPENSAÇÃO DE BASE DE CÁLCULO NEGATIVA|750000,00|',
  '|N670|1|BASE DE CÁLCULO DA CSLL|750000,00|',
  '|9999|12|'
].join('\n');

function caso(extra) {
  const ecf = L.parseECF(ECF);
  return Object.assign({
    anoBase: 2025,
    empresa: { cnpj: ecf.cnpj, nome: ecf.nome, regime: ecf.regime, formaTribTexto: ecf.formaTribTexto, periodos: ecf.periodos, regularidade: { situacao: 'cnd', validade: '2099-12-31' } },
    projetos: [{ id: 'p1', codigo: 'PRJ-1', titulo: 'Motor de otimização', inicio: '2025-01-01', fim: '2025-12-31',
      desafio: 'Não havia algoritmo conhecido que resolvesse o roteamento com restrições dinâmicas em tempo real para a frota da empresa.',
      metodologia: 'Pesquisa bibliográfica, protótipos iterativos, testes de carga e validação com dados reais.',
      criterios: { problema: 1, incerteza: 1, novidade: 1, metodologia: 1, testes: 1, evidencias: 1, equipe: 1, resultado: 1 } }],
    despesas: [{ id: 'd1', rubrica: 'rh', projetoId: 'p1', valor: 1000000, percentual: 100, doc: { cpf: '52998224725' }, evidencias: { timesheet: true } }],
    pesquisadores: { anoAnterior: 0, anoAtual: 0 }
  }, extra || {});
}

test('LDB-001 ECF: identifica lucro real, apuração anual, lucro e base da CSLL', () => {
  const e = L.parseECF(ECF);
  assert.equal(e.cnpj, '11222333000181');
  assert.equal(e.regime, 'lucro_real');
  assert.equal(e.apuracao, 'anual');
  assert.equal(e.ano, 2025);
  assert.equal(e.periodos.length, 1);
  assert.equal(e.periodos[0].limiteIRPJ, 800000);
  assert.equal(e.periodos[0].limiteCSLL, 750000);
  assert.equal(L.identificarArquivo('x.txt', ECF), 'ecf');
});

test('LDB-002 cálculo: 60% de exclusão (não 160%), limitada ao lucro, sem carry-forward', () => {
  const c = L.calcular(caso());
  assert.equal(c.dispendios, 1000000);
  assert.equal(c.percentual, 0.6);
  assert.equal(c.exclusao, 600000);           // art. 19: 60% dos dispêndios (o dispêndio em si já é despesa)
  assert.equal(c.aproveitadaIRPJ, 600000);    // cabe no lucro de 800 mil
  assert.equal(c.aproveitadaCSLL, 600000);
  assert.equal(c.perdidaIRPJ, 0);
  assert.equal(c.economiaIRPJ, 146000);       // 600 mil × 15% + adicional de 10% só sobre o que excedia 240 mil/ano (560 mil)
  assert.equal(c.economiaCSLL, 54000);        // 600 mil × 9%
  assert.equal(c.economia, 200000);
  assert.equal(c.elegibilidade.status, 'ELEGIVEL');
});

test('LDB-003 limite: exclusão acima do lucro é perdida; aumento de pesquisadores eleva para 70%/80%', () => {
  const c1 = L.calcular(caso({ despesas: [{ id: 'd1', rubrica: 'rh', projetoId: 'p1', valor: 2000000, doc: { cpf: '52998224725' }, evidencias: { timesheet: true } }] }));
  assert.equal(c1.exclusao, 1200000);
  assert.equal(c1.aproveitadaIRPJ, 800000);
  assert.equal(c1.perdidaIRPJ, 400000);
  assert.equal(c1.aproveitadaCSLL, 750000);
  assert.equal(L.calcular(caso({ pesquisadores: { anoAnterior: 100, anoAtual: 104 } })).percentual, 0.7);
  assert.equal(L.calcular(caso({ pesquisadores: { anoAnterior: 100, anoAtual: 110 } })).percentual, 0.8);
  const pat = L.calcular(caso({ patente: { dispendiosVinculados: 100000, dataConcessao: '2025-06-10' } }));
  assert.equal(pat.exclusaoPatente, 20000);   // art. 19 §3º
});

test('LDB-004 sem lucro, irregularidade ou presumido: bloqueia', () => {
  const s = caso(); s.empresa.periodos = [{ per: 'A00', dtIni: '2025-01-01', dtFin: '2025-12-31', meses: 12, limiteIRPJ: -379338.9, limiteCSLL: -379338.9 }];
  const c = L.calcular(s);
  assert.equal(c.elegibilidade.status, 'SEM_APROVEITAMENTO');
  assert.equal(c.economia, 0);
  const r = caso(); r.empresa.regularidade = { situacao: 'positiva' };
  assert.equal(L.calcular(r).elegibilidade.status, 'BLOQUEADO');
  const p = caso(); p.empresa.regime = 'lucro_presumido';
  assert.equal(L.calcular(p).elegibilidade.status, 'INELEGIVEL');
  assert.ok(L.calcular(p).confianca.score <= 49);
});

test('LDB-005 validações: duplicidade, ativação, sem timesheet, alocação > 100%', () => {
  const c = L.calcular(caso({ despesas: [
    { id: 'a', rubrica: 'material', projetoId: 'p1', valor: 100, doc: { chave: 'K1' } },
    { id: 'b', rubrica: 'material', projetoId: 'p1', valor: 100, doc: { chave: 'K1' } },
    { id: 'c', rubrica: 'rh', projetoId: 'p1', valor: 100, ativado: true, doc: { cpf: '1' }, evidencias: { timesheet: true } },
    { id: 'd', rubrica: 'rh', projetoId: 'p1', valor: 100, percentual: 70, doc: { cpf: '9' } },
    { id: 'e', rubrica: 'rh', projetoId: 'p1', valor: 100, percentual: 50, doc: { cpf: '9' }, evidencias: { timesheet: true } },
    { id: 'f', rubrica: 'servico_pj', projetoId: 'p1', valor: 100, descricao: 'Serviços prestados', evidencias: { contrato: true } }
  ] }));
  const st = Object.fromEntries(c.validacao.itens.map((x) => [x.id, x.status]));
  assert.equal(st.a, 'ELEGIVEL');
  assert.equal(st.b, 'REJEITADA');
  assert.equal(st.c, 'REJEITADA');
  assert.equal(st.d, 'EXCECAO');
  assert.equal(st.f, 'EXCECAO');
  assert.ok(c.validacao.achados.some((x) => /soma 120%/.test(x.texto)));
  assert.equal(c.dispendios, 150);            // a (100) + e (50% de 100)
});

test('LDB-006 folha CSV, NF-e e NFS-e', () => {
  const folha = 'CPF;Nome;Cargo;Departamento;Custo total;Horas;Projeto;Dedicação\n529.982.247-25;Ana Souza;Engenheira de Software;P&D;120.000,00;1800;PRJ-1;80\n111.444.777-35;Bruno;Vendedor;Comercial;50.000,00;1800;;';
  const f = L.parseFolha(folha);
  assert.equal(f.pessoas.length, 2);
  assert.equal(f.pessoas[0].custoAnual, 120000);
  assert.equal(f.pessoas[0].elegivel, true);
  assert.equal(f.pessoas[0].alocacoes[0].percentual, 80);
  assert.equal(f.pessoas[1].elegivel, false);
  const nfe = '<nfeProc><NFe><infNFe Id="NFe35250111222333000181550010000001231000001234"><ide><nNF>123</nNF><dhEmi>2025-03-10T10:00:00-03:00</dhEmi></ide><emit><CNPJ>99888777000166</CNPJ><xNome>FORNECEDOR</xNome></emit><dest><CNPJ>11222333000181</CNPJ></dest><det><prod><xProd>Sensor</xProd><NCM>90318099</NCM><CFOP>1102</CFOP><vProd>1500.50</vProd></prod></det><total><ICMSTot><vNF>1500.50</vNF></ICMSTot></total></infNFe></NFe></nfeProc>';
  assert.equal(L.identificarArquivo('n.xml', nfe), 'nfe');
  const n = L.parseNFe(nfe).notas[0];
  assert.equal(n.valor, 1500.5);
  assert.equal(n.chave.length, 44);
  assert.equal(n.rubrica, 'material');
  const nfse = '<CompNfse><Nfse><InfNfse><Numero>9</Numero><DataEmissao>2025-04-01</DataEmissao><Servico><Valores><ValorServicos>2000.00</ValorServicos></Valores><Discriminacao>Testes de carga do motor</Discriminacao></Servico><PrestadorServico><IdentificacaoPrestador><Cnpj>12345678000195</Cnpj></IdentificacaoPrestador><RazaoSocial>LAB</RazaoSocial></PrestadorServico></InfNfse></Nfse></CompNfse>';
  const s = L.parseNFSe(nfse).notas[0];
  assert.equal(s.valor, 2000);
  assert.equal(s.rubrica, 'servico_pj');
});

test('LDB-007 ECD: contas de P&D e conciliação', () => {
  const ecd = ['|0000|LECD|01012025|31122025|EMPRESA TESTE LTDA|11222333000181|SP|',
    '|I050|01012025|04|A|5|3.1.01.01.001|3.1.01.01|Salários equipe P&D|',
    '|I050|01012025|04|A|5|3.1.02.01.001|3.1.02.01|Salários administrativos|',
    '|I150|01012025|31122025|',
    '|I155|3.1.01.01.001||0|D|1000000,00|0|1000000,00|D|',
    '|I155|3.1.02.01.001||0|D|500000,00|0|500000,00|D|'].join('\n');
  const e = L.parseECD(ecd);
  assert.equal(e.totalPD, 1000000);
  assert.equal(e.contasPD.length, 1);
  const c = L.calcular(caso({ contabil: { totalPD: e.totalPD } }));
  assert.equal(c.conciliacao.status, 'ok');
});

test('LDB-008 FORMP&D, retroativo e documentos', () => {
  const k = caso({ pessoas: [{ id: 'x', cpf: '52998224725', nome: 'Ana', cargo: 'Engenheira', elegivel: true, horas: 1800 }] });
  const c = L.calcular(k);
  const f = L.formpd(k, c);
  assert.equal(f.planilhas.recursos_humanos.linhas.length, 2);
  assert.match(L.csv(f.planilhas.recursos_humanos.linhas), /529\.982\.247-25;Ana/);
  const r = L.retroativo([{ ano: 2023, regime: 'lucro_real', lucroIRPJ: 563341.58, lucroCSLL: 563341.58, dispendios: 100000, formpdNoPrazo: true }]);
  assert.equal(r[0].exclusao, 60000);
  assert.ok(r[0].credito > 0);
  const semForm = L.retroativo([{ ano: 2023, regime: 'lucro_real', lucroIRPJ: 100000, lucroCSLL: 100000, dispendios: 10000, formpdNoPrazo: false }]);
  assert.equal(semForm[0].risco, 'Alto');
  for (const m of L.MODELOS) assert.match(L.documento(m.id, k, c).html, /<h1>/);
});
