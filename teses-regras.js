/*
 * Reversa Tax — regras de aplicabilidade das 60 teses do catálogo (triagem, não cálculo).
 * Cruza o PERFIL do cliente (regime + características da operação) com o que cada tese exige.
 * Resultado por tese: "provavel" (perfil atende), "verificar" (falta informação) ou "nao" (perfil exclui).
 * Oportunidade não é crédito (RB-09): o cruzamento só indica onde olhar; o valor sai do motor e da revisão humana.
 * Funciona no navegador (window.TesesRegras) e no Node (module.exports).
 */
(function (root) {
  'use strict';

  var VERSAO = '1.0.0';

  // Perfil do cliente. true = sim, false = não, ausente/null = não informado.
  var PERFIL = [
    { id: 'comercio', rotulo: 'Comércio (revenda de mercadorias)', grupo: 'Atividade' },
    { id: 'industria', rotulo: 'Indústria (fabricação/industrialização)', grupo: 'Atividade' },
    { id: 'servicos', rotulo: 'Prestação de serviços (ISS)', grupo: 'Atividade' },
    { id: 'transporte', rotulo: 'Transporte / logística', grupo: 'Atividade' },
    { id: 'agro', rotulo: 'Agronegócio / produção rural', grupo: 'Atividade' },
    { id: 'saude', rotulo: 'Serviços hospitalares / saúde', grupo: 'Atividade' },
    { id: 'st', rotulo: 'Opera mercadorias com ICMS-ST', grupo: 'Operação' },
    { id: 'monofasico', rotulo: 'Vende produtos monofásicos (farma, perfumaria, autopeças, combustíveis, bebidas)', grupo: 'Operação' },
    { id: 'folha', rotulo: 'Folha de pagamento relevante (CLT)', grupo: 'Operação' },
    { id: 'imobilizado', rotulo: 'Ativo imobilizado relevante (máquinas, frota, instalações)', grupo: 'Operação' },
    { id: 'energia', rotulo: 'Consumo relevante de energia elétrica / telecom', grupo: 'Operação' },
    { id: 'multiuf', rotulo: 'Filiais ou operações em mais de uma UF', grupo: 'Operação' },
    { id: 'ecommerce', rotulo: 'Vende a consumidor final de outra UF (e-commerce)', grupo: 'Operação' },
    { id: 'importador', rotulo: 'Importa mercadorias', grupo: 'Comércio exterior' },
    { id: 'exportador', rotulo: 'Exporta produtos manufaturados', grupo: 'Comércio exterior' },
    { id: 'exterior', rotulo: 'Remessas ao exterior (royalties, serviços técnicos)', grupo: 'Comércio exterior' },
    { id: 'controladas_exterior', rotulo: 'Controladas ou coligadas no exterior', grupo: 'Comércio exterior' },
    { id: 'incentivo_icms', rotulo: 'Tem benefício/incentivo fiscal de ICMS', grupo: 'Situação fiscal' },
    { id: 'jcp', rotulo: 'Distribui ou poderia distribuir JCP', grupo: 'Situação fiscal' },
    { id: 'indebito', rotulo: 'Recebeu restituição/compensação com Selic', grupo: 'Situação fiscal' }
  ];
  var REGIMES = { real: 'Lucro Real', presumido: 'Lucro Presumido', simples: 'Simples Nacional' };
  var RP = ['real', 'presumido'], R = ['real'], P = ['presumido'], TODOS = ['real', 'presumido', 'simples'];

  // tributo · via (do catálogo) · risco (do catálogo) · regimes · algum (basta um) · todos (exige todos) · motor (id no motor de cálculo)
  var TESES = [
    { id: 'T001', nome: 'Exclusão do ICMS da base do PIS/COFINS', tributo: 'PIS/COFINS', via: 'judicial', risco: 'baixo', regimes: RP, algum: ['comercio', 'industria'], motor: 'tema69' },
    { id: 'T002', nome: 'Exclusão do ICMS-ST da base do PIS/COFINS', tributo: 'PIS/COFINS', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['st'], motor: 'icmsSt' },
    { id: 'T003', nome: 'PIS/COFINS monofásico não segregado no Simples Nacional', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'baixo', regimes: ['simples'], todos: ['monofasico'] },
    { id: 'T004', nome: 'Contribuição previdenciária sobre salário-maternidade', tributo: 'Previdenciário', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T005', nome: 'Contribuição previdenciária sobre aviso-prévio indenizado', tributo: 'Previdenciário', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T006', nome: 'Contribuição previdenciária sobre primeiros 15 dias de afastamento', tributo: 'Previdenciário', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T007', nome: 'Terço constitucional de férias — tratamento conforme situação jurídica', tributo: 'Previdenciário', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T008', nome: 'Limitação da base das contribuições destinadas a terceiros', tributo: 'Previdenciário', via: 'judicial', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T009', nome: 'Revisão do FAP', tributo: 'Previdenciário', via: 'administrativa', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T010', nome: 'Revisão do RAT/GILRAT', tributo: 'Previdenciário', via: 'administrativa', risco: 'baixo', regimes: RP, todos: ['folha'] },
    { id: 'T011', nome: 'Créditos de PIS/COFINS não utilizados', tributo: 'PIS/COFINS', via: 'operacional', risco: 'baixo', regimes: R },
    { id: 'T012', nome: 'Créditos extemporâneos de PIS/COFINS', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'baixo', regimes: R },
    { id: 'T013', nome: 'Créditos de ICMS sobre ativo imobilizado', tributo: 'ICMS', via: 'operacional', risco: 'baixo', regimes: RP, algum: ['comercio', 'industria'], todos: ['imobilizado'] },
    { id: 'T014', nome: 'Créditos de ICMS sobre energia elétrica em hipóteses legais', tributo: 'ICMS', via: 'operacional', risco: 'baixo', regimes: RP, todos: ['industria', 'energia'] },
    { id: 'T015', nome: 'Créditos de ICMS sobre ativos/insumos com apropriação incorreta', tributo: 'ICMS', via: 'operacional', risco: 'baixo', regimes: RP, algum: ['comercio', 'industria'] },
    { id: 'T016', nome: 'Insumos de PIS/COFINS — essencialidade e relevância', tributo: 'PIS/COFINS', via: 'judicial_administrativa', risco: 'medio', regimes: R, algum: ['industria', 'servicos', 'transporte', 'agro'], motor: 'insumos' },
    { id: 'T017', nome: 'Créditos de PIS/COFINS sobre fretes e armazenagem', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, algum: ['comercio', 'industria', 'transporte'] },
    { id: 'T018', nome: 'Créditos de PIS/COFINS sobre energia elétrica', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, todos: ['energia'] },
    { id: 'T019', nome: 'Créditos de PIS/COFINS sobre depreciação', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, todos: ['imobilizado'] },
    { id: 'T020', nome: 'Créditos de PIS/COFINS sobre serviços essenciais', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, algum: ['industria', 'servicos', 'transporte'] },
    { id: 'T021', nome: 'ICMS-ST pago indevidamente por erro de apuração', tributo: 'ICMS', via: 'administrativa', risco: 'medio', regimes: TODOS, todos: ['st'] },
    { id: 'T022', nome: 'ICMS-ST — diferença entre base presumida e efetiva', tributo: 'ICMS', via: 'judicial_administrativa', risco: 'medio', regimes: TODOS, todos: ['st', 'comercio'] },
    { id: 'T023', nome: 'Créditos relacionados ao ICMS-ST no PIS/COFINS', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, todos: ['st'] },
    { id: 'T024', nome: 'Créditos de ICMS sobre fretes', tributo: 'ICMS', via: 'operacional', risco: 'medio', regimes: RP, algum: ['comercio', 'industria', 'transporte'] },
    { id: 'T025', nome: 'Créditos de ICMS sobre produtos intermediários', tributo: 'ICMS', via: 'operacional', risco: 'medio', regimes: RP, todos: ['industria'] },
    { id: 'T026', nome: 'Revisão de NCM/classificação fiscal com impacto tributário', tributo: 'Indiretos', via: 'operacional', risco: 'medio', regimes: TODOS, algum: ['comercio', 'industria', 'importador'] },
    { id: 'T027', nome: 'Retenções federais indevidas ou excessivas', tributo: 'Federais diversos', via: 'administrativa', risco: 'medio', regimes: TODOS, todos: ['servicos'] },
    { id: 'T028', nome: 'INSS sobre verbas de natureza indenizatória', tributo: 'Previdenciário', via: 'judicial_administrativa', risco: 'medio', regimes: RP, todos: ['folha'] },
    { id: 'T029', nome: 'IRPJ/CSLL sobre Selic recebida em repetição de indébito', tributo: 'IRPJ/CSLL', via: 'judicial', risco: 'medio', regimes: RP, todos: ['indebito'] },
    { id: 'T030', nome: 'IRPJ/CSLL — serviços hospitalares em condições legalmente previstas', tributo: 'IRPJ/CSLL', via: 'judicial_administrativa', risco: 'medio', regimes: P, todos: ['saude'] },
    { id: 'T031', nome: 'ISS na base do PIS/COFINS', tributo: 'PIS/COFINS', via: 'judicial', risco: 'alto', regimes: RP, todos: ['servicos'], motor: 'tema118' },
    { id: 'T032', nome: 'PIS/COFINS sobre a própria base', tributo: 'PIS/COFINS', via: 'judicial', risco: 'alto', regimes: RP, motor: 'tema1067' },
    { id: 'T033', nome: 'Créditos presumidos de ICMS e PIS/COFINS', tributo: 'PIS/COFINS', via: 'judicial', risco: 'alto', regimes: R, todos: ['incentivo_icms'] },
    { id: 'T034', nome: 'Incentivos fiscais de ICMS na base do IRPJ/CSLL', tributo: 'IRPJ/CSLL', via: 'judicial', risco: 'alto', regimes: R, todos: ['incentivo_icms'] },
    { id: 'T035', nome: 'Incentivos de ICMS — efeitos no Lucro Presumido', tributo: 'IRPJ/CSLL', via: 'judicial', risco: 'alto', regimes: P, todos: ['incentivo_icms'] },
    { id: 'T036', nome: 'ISS no IRPJ/CSLL — Lucro Presumido', tributo: 'IRPJ/CSLL', via: 'judicial', risco: 'alto', regimes: P, todos: ['servicos'] },
    { id: 'T037', nome: 'TUSD/TUST e ICMS sobre energia elétrica', tributo: 'ICMS', via: 'judicial', risco: 'alto', regimes: TODOS, todos: ['energia'] },
    { id: 'T038', nome: 'Alíquotas majoradas de ICMS sobre energia/telecom', tributo: 'ICMS', via: 'judicial', risco: 'alto', regimes: TODOS, todos: ['energia'] },
    { id: 'T039', nome: 'FUNCEP e adicionais estaduais na carga tributária', tributo: 'ICMS', via: 'judicial_administrativa', risco: 'alto', regimes: TODOS, todos: ['energia'] },
    { id: 'T040', nome: 'Dedutibilidade extemporânea de JCP', tributo: 'IRPJ/CSLL', via: 'judicial', risco: 'alto', regimes: R, todos: ['jcp'] },
    { id: 'T041', nome: 'Funrural', tributo: 'Previdenciário', via: 'judicial', risco: 'alto', regimes: TODOS, todos: ['agro'] },
    { id: 'T042', nome: 'PIS/COFINS-Importação — base e adicionais', tributo: 'PIS/COFINS', via: 'judicial_administrativa', risco: 'alto', regimes: RP, todos: ['importador'] },
    { id: 'T043', nome: 'REINTEGRA', tributo: 'Federais diversos', via: 'administrativa_judicial', risco: 'alto', regimes: RP, todos: ['exportador', 'industria'] },
    { id: 'T044', nome: 'CIDE sobre remessas ao exterior', tributo: 'Federais diversos', via: 'judicial_administrativa', risco: 'alto', regimes: RP, todos: ['exterior'] },
    { id: 'T045', nome: 'Tributação de lucros de controladas/coligadas no exterior', tributo: 'IRPJ/CSLL', via: 'judicial_administrativa', risco: 'alto', regimes: R, todos: ['controladas_exterior'] },
    { id: 'T046', nome: 'PIS/COFINS monofásico — segregação por produto/NCM', tributo: 'PIS/COFINS', via: 'operacional', risco: 'medio', regimes: RP, todos: ['monofasico'], motor: 'monofasico' },
    { id: 'T047', nome: 'ICMS-ST — ressarcimento e complementação por operações subsequentes', tributo: 'ICMS', via: 'administrativa', risco: 'medio', regimes: TODOS, todos: ['st'] },
    { id: 'T048', nome: 'Créditos de IPI sobre insumos e produtos tributados', tributo: 'IPI', via: 'operacional', risco: 'medio', regimes: RP, todos: ['industria'] },
    { id: 'T049', nome: 'IPI — classificação, alíquota e enquadramento fiscal', tributo: 'IPI', via: 'operacional', risco: 'medio', regimes: TODOS, algum: ['industria', 'importador'] },
    { id: 'T050', nome: 'IPI — créditos decorrentes de devoluções e ajustes', tributo: 'IPI', via: 'operacional', risco: 'medio', regimes: RP, todos: ['industria'] },
    { id: 'T051', nome: 'ICMS — benefícios fiscais, créditos outorgados e subvenções', tributo: 'ICMS', via: 'administrativa_judicial', risco: 'alto', regimes: RP, todos: ['incentivo_icms'] },
    { id: 'T052', nome: 'ICMS — diferencial de alíquotas (DIFAL) em operações aplicáveis', tributo: 'ICMS', via: 'judicial_administrativa', risco: 'alto', regimes: TODOS, algum: ['comercio', 'industria'], todos: ['multiuf'] },
    { id: 'T053', nome: 'ICMS — diferencial de alíquotas para consumidor final não contribuinte', tributo: 'ICMS', via: 'judicial_administrativa', risco: 'alto', regimes: TODOS, todos: ['ecommerce'] },
    { id: 'T054', nome: 'ICMS — transferências entre estabelecimentos e manutenção de créditos', tributo: 'ICMS', via: 'judicial_administrativa', risco: 'alto', regimes: TODOS, todos: ['multiuf'] },
    { id: 'T055', nome: 'PIS/COFINS — créditos sobre bens e serviços utilizados na atividade', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R },
    { id: 'T056', nome: 'PIS/COFINS — créditos sobre embalagens e materiais de acondicionamento', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, algum: ['industria', 'comercio'] },
    { id: 'T057', nome: 'PIS/COFINS — créditos sobre manutenção e conservação de ativos', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, todos: ['imobilizado'] },
    { id: 'T058', nome: 'PIS/COFINS — créditos sobre combustíveis em hipóteses legalmente admitidas', tributo: 'PIS/COFINS', via: 'administrativa', risco: 'medio', regimes: R, algum: ['transporte', 'industria', 'agro'] },
    { id: 'T059', nome: 'Contribuições previdenciárias — revisão de rubricas e incidências', tributo: 'Previdenciário', via: 'operacional', risco: 'medio', regimes: RP, todos: ['folha'] },
    { id: 'T060', nome: 'Tributação indireta — revisão integrada de NCM, ICMS, IPI, PIS/COFINS e regime fiscal', tributo: 'Indiretos', via: 'operacional', risco: 'medio', regimes: RP, algum: ['comercio', 'industria'] }
  ];

  var ROTULO = {}; PERFIL.forEach(function (p) { ROTULO[p.id] = p.rotulo; });
  var PESO_RISCO = { baixo: 3, medio: 2, alto: 1 };

  /** Normaliza o regime do cadastro ("Lucro Real", "Não cumulativo", "Presumido", "Simples") para real/presumido/simples. */
  function regimeDe(txt) {
    var s = String(txt || '').toLowerCase();
    if (/simples/.test(s)) return 'simples';
    if (/presumid|cumulativo/.test(s) && !/n[ãa]o\s*cumulativo/.test(s)) return 'presumido';
    if (/real|n[ãa]o\s*cumulativo|misto/.test(s)) return 'real';
    return null;
  }

  function valor(perfil, k) { var v = perfil ? perfil[k] : undefined; return v === true ? true : v === false ? false : null; }
  function curto(k) { return (ROTULO[k] || k).split(' (')[0]; }

  /**
   * Avalia uma tese para um cliente.
   * @param {{regime?: string, perfil?: object}} cliente  regime: real|presumido|simples (ou texto do cadastro)
   * @returns {{estado: 'provavel'|'verificar'|'nao', motivos: string[], faltam: string[]}}
   */
  function avaliar(tese, cliente) {
    var perfil = (cliente && cliente.perfil) || {};
    var regime = cliente && (REGIMES[cliente.regime] ? cliente.regime : regimeDe(cliente.regime));
    var motivos = [], faltam = [], nao = false;
    if (!regime) faltam.push('regime tributário');
    else if (tese.regimes.indexOf(regime) < 0) { nao = true; motivos.push('Não se aplica ao ' + REGIMES[regime] + ' (vale para ' + tese.regimes.map(function (r) { return REGIMES[r]; }).join(', ') + ')'); }
    (tese.todos || []).forEach(function (k) {
      var v = valor(perfil, k);
      if (v === false) { nao = true; motivos.push('Exige: ' + curto(k)); }
      else if (v === null) faltam.push(curto(k));
      else motivos.push(curto(k));
    });
    if (tese.algum && tese.algum.length) {
      var vs = tese.algum.map(function (k) { return valor(perfil, k); });
      if (vs.indexOf(true) >= 0) motivos.push(tese.algum.filter(function (k, i) { return vs[i] === true; }).map(curto).join(' / '));
      else if (vs.every(function (v) { return v === false; })) { nao = true; motivos.push('Exige: ' + tese.algum.map(curto).join(' ou ')); }
      else faltam.push(tese.algum.map(curto).join(' ou '));
    }
    if (regime && !nao) motivos.unshift(REGIMES[regime]);
    return { estado: nao ? 'nao' : faltam.length ? 'verificar' : 'provavel', motivos: motivos, faltam: faltam };
  }

  /**
   * Cruza todos os clientes com todas as teses.
   * @param {Array<{id, nome, regime, perfil}>} clientes
   */
  function cruzar(clientes, teses) {
    teses = teses || TESES;
    var matriz = clientes.map(function (c) {
      var linha = teses.map(function (t) { return avaliar(t, c); });
      var cont = { provavel: 0, verificar: 0, nao: 0 }, score = 0;
      linha.forEach(function (r, i) { cont[r.estado]++; if (r.estado === 'provavel') score += PESO_RISCO[teses[i].risco] || 1; });
      return { cliente: c, resultados: linha, contagem: cont, score: score };
    });
    var porTese = teses.map(function (t, i) {
      var cont = { provavel: 0, verificar: 0, nao: 0 };
      matriz.forEach(function (m) { cont[m.resultados[i].estado]++; });
      return { tese: t, contagem: cont };
    });
    return { matriz: matriz, porTese: porTese };
  }

  var api = { VERSAO: VERSAO, PERFIL: PERFIL, REGIMES: REGIMES, TESES: TESES, PESO_RISCO: PESO_RISCO, regimeDe: regimeDe, avaliar: avaliar, cruzar: cruzar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TesesRegras = api;
})(typeof window !== 'undefined' ? window : this);
