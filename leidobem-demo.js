// Caso fictício de Lei do Bem para a área de demonstração. Roda só no navegador: nunca é enviado à API.
(function (root) {
  function cpf(base) { // gera CPF com dígitos verificadores válidos a partir de 9 dígitos
    var d = String(base).split('').map(Number);
    for (var k = 0; k < 2; k++) { var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * (d.length + 1 - i); var r = (s * 10) % 11; d.push(r === 10 ? 0 : r); }
    return d.join('');
  }
  var equipe = [
    ['Mariana Duarte Couto', 'F', 'Doutorado', 'Pesquisadora sênior — engenharia de materiais', 'p1', 100, 486000],
    ['Rafael Nunes Prado', 'M', 'Mestrado', 'Engenheiro de P&D — metalurgia', 'p1', 100, 398000],
    ['Camila Freitas Lobo', 'F', 'Mestrado', 'Pesquisadora — tratamento térmico', 'p1', 80, 312000],
    ['Thiago Martins Rocha', 'M', 'Graduação', 'Técnico de laboratório de P&D', 'p1', 100, 168000],
    ['Bruno Azevedo Lima', 'M', 'Doutorado', 'Pesquisador — visão computacional', 'p2', 100, 512000],
    ['Larissa Campos Reis', 'F', 'Mestrado', 'Cientista de dados — P&D', 'p2', 100, 421000],
    ['Felipe Andrade Sá', 'M', 'Graduação', 'Engenheiro de software de P&D', 'p2', 100, 356000],
    ['Juliana Prates Viana', 'F', 'Graduação', 'Engenheira de automação — P&D', 'p2', 70, 254000],
    ['Gustavo Leal Barros', 'M', 'Doutorado', 'Pesquisador — eletroquímica', 'p3', 100, 498000],
    ['Patrícia Moura Sales', 'F', 'Mestrado', 'Engenheira química de P&D', 'p3', 100, 384000],
    ['Diego Fontes Teixeira', 'M', 'Graduação', 'Técnico em química — P&D', 'p3', 100, 176000],
    ['Aline Ribeiro Matos', 'F', 'Mestrado', 'Coordenadora técnica de P&D', 'p1', 40, 216000]
  ];
  function demo() {
    var pessoas = [], despesas = [];
    equipe.forEach(function (e, i) {
      var c = cpf(String(123456700 + i * 37).slice(0, 9));
      pessoas.push({ id: 'pe' + i, nome: e[0], sexo: e[1], formacao: e[2], cargo: e[3], cpf: c, horas: 1760, departamento: 'P&D' });
      despesas.push({ id: 'rh' + i, rubrica: 'rh', projetoId: e[4], valor: e[6], percentual: e[5], data: '2025-12-31', descricao: e[0], funcao: e[3],
        atividades: 'Atividades de pesquisa e experimentação registradas em apontamento de horas por projeto.', doc: { cpf: c }, evidencias: { timesheet: true } });
    });
    var extra = [
      ['ict1', 'ict', 'p1', 1800000, '2025-06-30', 'Ensaios de fadiga e microscopia eletrônica em parceria com universidade federal', { cnpj: '00000000000191' }],
      ['ict2', 'ict', 'p3', 980000, '2025-09-30', 'Desenvolvimento conjunto de eletrólito sólido com instituto de pesquisa', { cnpj: '00000000000272' }],
      ['pj1', 'servico_pj', 'p2', 760000, '2025-08-15', 'Rotulagem técnica de 180 mil imagens de defeitos de solda e validação cruzada do modelo', { cnpj: '11444777000161' }],
      ['pj2', 'servico_pj', 'p3', 420000, '2025-10-20', 'Caracterização eletroquímica de 40 protótipos de célula em câmara climática', { cnpj: '11222333000181' }],
      ['mt1', 'material', 'p1', 690000, '2025-05-10', 'Ligas e insumos para corpos de prova de ensaio', { chave: '42250511444777000161550010000123451000123456' }],
      ['mt2', 'material', 'p3', 548000, '2025-07-22', 'Reagentes, precursores e células-protótipo', { chave: '42250711444777000161550010000234561000234567' }],
      ['mt3', 'material', 'p2', 214000, '2025-04-03', 'Sensores e câmeras de teste para a bancada de inspeção', { chave: '42250411444777000161550010000345671000345678' }],
      ['dp1', 'depreciacao', 'p1', 312000, '2025-12-31', 'Depreciação do forno de tratamento térmico a vácuo (uso integral em P&D)', null],
      ['dp2', 'depreciacao', 'p2', 158000, '2025-12-31', 'Depreciação dos servidores com GPU do laboratório de visão', null]
    ];
    extra.forEach(function (x) {
      despesas.push({ id: x[0], rubrica: x[1], projetoId: x[2], valor: x[3], data: x[4], descricao: x[5], doc: x[6] || undefined,
        evidencias: { contrato: true, nf: true, timesheet: true } });
    });
    var total = despesas.reduce(function (s, d) { return s + d.valor * (d.percentual == null ? 100 : d.percentual) / 100; }, 0);
    var crit = { problema: 1, incerteza: 1, novidade: 1, metodologia: 1, testes: 1, evidencias: 1, equipe: 1, resultado: 1 };
    return {
      id: 'demo', legalName: 'Metalúrgica Horizonte Tecnologia Ltda (fictícia)', cnpj: '11444777000161', anoBase: 2025, status: 'enviado',
      recibo: 'FORMPD-2025-DEMO-0001', enviadoEm: '2026-07-18', podeRevisar: false, demo: true,
      revisoes: { aprovadas: ['fiscal', 'tecnica', 'contabil', 'final'], proxima: null, log: [
        { etapa: 'fiscal', decisao: 'aprovar', nome: 'Analista fiscal (demo)', em: '2026-06-22T14:10:00-03:00', observacao: 'Lucro real anual, CND válida, base suficiente para a exclusão integral.' },
        { etapa: 'tecnica', decisao: 'aprovar', nome: 'Especialista técnico (demo)', em: '2026-06-30T10:25:00-03:00', observacao: 'Três projetos com incerteza tecnológica e evidências de experimentação.' },
        { etapa: 'contabil', decisao: 'aprovar', nome: 'Contabilidade (demo)', em: '2026-07-08T16:40:00-03:00', observacao: 'Contas de P&D segregadas e conciliadas com a ECD.' },
        { etapa: 'final', decisao: 'aprovar', nome: 'Diretoria (demo)', em: '2026-07-15T09:05:00-03:00', observacao: 'Aprovado para envio do FORMP&D.' }
      ] },
      dados: {
        empresa: { cnpj: '11444777000161', nome: 'Metalúrgica Horizonte Tecnologia Ltda (fictícia)', regime: 'lucro_real', formaTribTexto: 'Lucro Real', apuracao: 'anual',
          regularidade: { situacao: 'cnd', validade: '2026-12-31' },
          periodos: [{ per: 'A00', dtIni: '2025-01-01', dtFin: '2025-12-31', meses: 12, limiteIRPJ: 21500000, limiteCSLL: 21500000 }] },
        projetos: [
          { id: 'p1', codigo: 'PD-01', titulo: 'Liga de aço de alta resistência para componentes leves', tipo: 'aplicada', inicio: '2024-03-01', fim: '2026-06-30', criterios: crit,
            desafio: 'Não havia composição e rota de tratamento térmico conhecidas que reduzissem 18% do peso do componente mantendo a resistência à fadiga exigida pelo cliente automotivo.',
            metodologia: 'Planejamento de experimentos, fusão de corpos de prova, ensaios de fadiga e microscopia, iteração da composição a cada ciclo.' },
          { id: 'p2', codigo: 'PD-02', titulo: 'Inspeção de solda por visão computacional em linha', tipo: 'experimental', inicio: '2025-01-15', fim: '2026-12-31', criterios: crit,
            desafio: 'Os modelos existentes não detectavam microtrincas abaixo de 0,2 mm em superfícies reflexivas e em velocidade de linha, com taxa de falso positivo aceitável.',
            metodologia: 'Coleta e rotulagem de imagens, treinamento de redes convolucionais, testes em bancada e piloto controlado na linha.' },
          { id: 'p3', codigo: 'PD-03', titulo: 'Célula de bateria com eletrólito sólido para empilhadeiras', tipo: 'aplicada', inicio: '2025-02-01', fim: '2027-01-31', criterios: crit,
            desafio: 'Não se sabia se um eletrólito sólido de baixo custo manteria condutividade iônica estável em ciclos de carga rápida e temperatura de câmara fria.',
            metodologia: 'Síntese de eletrólitos, montagem de protótipos, ciclagem em câmara climática e análise de degradação.' }
        ],
        pessoas: pessoas, despesas: despesas,
        contabil: { totalPD: Math.round(total * 100) / 100, contasSegregadas: true },
        pesquisadores: { anoAnterior: 12, anoAtual: 12 },
        patente: {}, formpd: {}, retroativo: []
      }
    };
  }
  root.LDB_DEMO = demo;
})(typeof window !== 'undefined' ? window : globalThis);
