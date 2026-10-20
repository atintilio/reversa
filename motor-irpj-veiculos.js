/*
 * Reversa Tax — REV-IRPJ-CSLL-VEICULOS-001 (catálogo T099): IRPJ e CSLL na revenda de veículos usados e seminovos.
 * FASE 1 (MVP): cadastro da tese e dos fundamentos, triagem de elegibilidade, leitura mínima da ECF do Lucro Presumido (P030/P200/P300/P400/P500),
 * cálculo trimestral com aritmética decimal exata (centavos inteiros, BigInt nas multiplicações) e relatório preliminar.
 *
 * É tese JUDICIAL em disputa. A saída é sempre "oportunidade estimada": nunca crédito disponível, nunca compensação pronta, nunca PER/DCOMP.
 * Não soma com a T098 (PIS/COFINS sobre veículos usados) nem com ICMS: cada uma é tese separada, com motor próprio.
 *
 * Entradas (valores em REAIS nas entradas; centavos inteiros nas saídas):
 *   analisar({ ecfs, ecds, contribuinte, trimestres }, opts)
 *   trimestres: { 'AAAA-Tn': { margem | {venda, custo}, outrasBases: {irpj, csll}, receitaBruta, retencoes: {irpj, csll},
 *                              recolhido: {irpj, csll, data 'AAAA-MM-DD'}, coefOriginal: {irpj, csll} (em %, padrão 32) } }
 *   contribuinte: { simples, regime ('presumido'|'real'), objetoSocialVeiculos (bool), operacoesDocumentadas (bool), vendasNovasSegregadas,
 *                   acaoJudicialAnterior, compensacaoRealizada, decisaoDesfavoravel }
 *   opts: { hoje, dataAjuizamento, lc224: { limiteTrimestre (reais, PARÂMETRO A CONFERIR) } }
 * Limitações da Fase 1: sem NF-e/chassi (Fase 2), sem Selic (Fase 3), sem parecer automatizado (Fase 3), sem gestão processual (Fase 4).
 * Funciona no navegador (window.MotorIrpjVeiculos) e no Node (module.exports).
 */
(function (root) {
  'use strict';
  var VERSAO = '0.1.0';
  var TESE_ID = 'REV-IRPJ-CSLL-VEICULOS-001', ID_CATALOGO = 'T099';

  // ---------- aritmética exata ----------
  var cent = function (reais) { return Math.round(Number(reais) * 100) || 0; };
  // a * bp / 10000, arredondado (meio para cima em módulo), sem ponto flutuante
  function pct(c, bp) {
    var n = BigInt(Math.round(c)) * BigInt(Math.round(bp)), neg = n < 0n; if (neg) n = -n;
    var r = (n + 5000n) / 10000n; return Number(neg ? -r : r);
  }
  // a * num / den (inteiros), arredondado
  function mulDiv(a, num, den) {
    if (!den) return 0;
    var n = BigInt(Math.round(a)) * BigInt(Math.round(num)), d = BigInt(Math.round(den)), neg = n < 0n; if (neg) n = -n;
    var r = (n + d / 2n) / d; return Number(neg ? -r : r);
  }
  var ALIQ_IRPJ_BP = 1500, ADIC_IRPJ_BP = 1000, ALIQ_CSLL_BP = 900, LIMITE_ADIC_TRI = 6000000; // R$ 60 mil por trimestre completo, em centavos
  var COEF_ORIGINAL_BP = { irpj: 3200, csll: 3200 }, COEF_TESE_BP = { irpj: 800, csll: 1200 };
  var irpjDevido = function (base) { return base > 0 ? pct(base, ALIQ_IRPJ_BP) + pct(Math.max(0, base - LIMITE_ADIC_TRI), ADIC_IRPJ_BP) : 0; };
  var csllDevida = function (base) { return base > 0 ? pct(base, ALIQ_CSLL_BP) : 0; };

  // ---------- regras versionadas por competência (LC 224/2025) ----------
  // Majoração de 10% sobre o coeficiente de presunção da parcela da receita que excede o limite. O limite NÃO está fixado aqui:
  // vem de opts.lc224.limiteTrimestre (reais por trimestre) e deve ser conferido com o texto da lei.
  var REGRAS_LC224 = [
    { id: 'LC224-IRPJ-2026', tributo: 'irpj', desde: { ano: 2026, tri: 1 }, acrescimoBp: 1000, base: 'LC 224/2025, art. 4º, §§ 4º e 5º', conferir: 'limite proporcional por trimestre' },
    { id: 'LC224-CSLL-2026', tributo: 'csll', desde: { ano: 2026, tri: 2 }, acrescimoBp: 1000, base: 'LC 224/2025, art. 4º, §§ 4º e 5º', conferir: 'limite proporcional da CSLL no ano de transição' }
  ];
  function regraLc224(tributo, ano, tri) {
    var a = null;
    REGRAS_LC224.forEach(function (r) { if (r.tributo === tributo && (ano > r.desde.ano || (ano === r.desde.ano && tri >= r.desde.tri))) a = r; });
    return a;
  }

  // ---------- cadastro da tese ----------
  var FUNDAMENTOS = [
    { norma: 'Lei 9.716/1998, art. 5º e parágrafo único', papel: 'Equiparação da venda de veículos usados à consignação; requisitos de documentação fiscal de entrada e saída.', fonte: 'https://www.planalto.gov.br/ccivil_03/leis/l9716.htm' },
    { norma: 'Lei 9.249/1995, arts. 3º, 15 e 20', papel: 'IRPJ 15% + adicional de 10%; presunção geral de 8% (IRPJ) e 12% (CSLL) na atividade comercial.', fonte: 'https://www2.camara.leg.br/legin/fed/lei/1995/lei-9249-26-dezembro-1995-349062-normaatualizada-pl.html' },
    { norma: 'LC 224/2025, art. 4º, §§ 4º e 5º', papel: 'Majoração de 10% dos coeficientes de presunção sobre a parcela da receita acima do limite, a partir de 2026.', fonte: '', conferir: true },
    { norma: 'Lei 9.430/1996, arts. 25 e 74', papel: 'Apuração trimestral do lucro presumido; compensação.', fonte: '' },
    { norma: 'CTN, arts. 165, 168 e 170-A', papel: 'Restituição, prazo de 5 anos e vedação de compensação antes do trânsito em julgado.', fonte: '' },
    { norma: 'Lei 9.250/1995, art. 39, § 4º', papel: 'Atualização do indébito pela Selic.', fonte: '' },
    { norma: 'IN RFB 2.055/2021, arts. 102 a 105', papel: 'Habilitação de crédito decorrente de decisão judicial (observar alterações posteriores).', fonte: '', conferir: true },
    { norma: 'Súmula STJ 213', papel: 'Cabimento do mandado de segurança para declarar o direito à compensação.', fonte: '' }
  ];
  var PRECEDENTES = [
    { id: 'A', processo: 'AREsp 3.169.515/RS', tribunal: 'STJ', orgao: 'Segunda Turma', relator: 'Min. Teodoro Silva Santos', julgamento: '2026-06', publicacao: '2026-07-02', resultado: 'favorável (coeficientes de 8% e 12%)', link: 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?dt_publicacao=02/07/2026&num_registro=202600374366' },
    { id: 'B', processo: 'AgInt no REsp 2.167.469/RS', tribunal: 'STJ', orgao: 'Segunda Turma', relator: 'Min. Marco Aurélio Bellizze', julgamento: '', publicacao: '2025-10-20', resultado: 'favorável (recurso da Fazenda Nacional desprovido)', link: 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?dt_publicacao=20/10/2025&num_registro=202403284800' },
    { id: 'C', processo: 'AgInt no REsp 2.167.214/RS', tribunal: 'STJ', orgao: 'Primeira Turma', relator: 'Min. Benedito Gonçalves', julgamento: '2025-02-24', publicacao: '2025-03-05', resultado: 'favorável', link: '' }
  ].map(function (p) { p.situacao = 'registrado como informado pelo solicitante — conferir nos links oficiais'; p.vinculante = false; p.repetitivo = false; return p; });
  var DIVERGENCIA = [
    { ato: 'Súmula CARF nº 85', conteudo: 'Coeficiente de 32% sobre a margem das operações do art. 5º da Lei 9.716/1998.' },
    { ato: 'Solução de Consulta Cosit nº 398/2017', conteudo: 'Mantém 32% para IRPJ e CSLL.' }
  ];
  var RISCO = { grau: 'alto', classe: 'em disputa', texto: 'Tese judicial. A interpretação administrativa (CARF e Receita) diverge dos julgados favoráveis do STJ, que não são repetitivos nem vinculantes. Não é crédito administrativo incontroverso.' };

  // ---------- fluxo jurídico (seção 8) ----------
  var ESTADOS = ['identificada', 'em_analise_documental', 'calculo_concluido', 'pendente_aprovacao_tributaria', 'aprovada_avaliacao_judicial', 'judicializada',
    'decisao_favoravel', 'transito_julgado_confirmado', 'habilitacao_solicitada', 'habilitacao_deferida', 'credito_disponivel_compensacao', 'compensacao_transmitida', 'compensacao_homologada_ou_fiscalizacao'];
  // requisitos de evidência para entrar em cada estado a partir de decisão judicial
  var EXIGE = {
    decisao_favoravel: ['decisaoFavoravel'], transito_julgado_confirmado: ['decisaoFavoravel', 'transitoJulgado'],
    habilitacao_solicitada: ['transitoJulgado'], habilitacao_deferida: ['transitoJulgado', 'habilitacaoSolicitada'],
    credito_disponivel_compensacao: ['transitoJulgado', 'habilitacaoDeferida', 'validacaoHumana'],
    compensacao_transmitida: ['transitoJulgado', 'habilitacaoDeferida', 'validacaoHumana', 'autorizacaoResponsavel'],
    compensacao_homologada_ou_fiscalizacao: ['compensacaoTransmitida']
  };
  function validarTransicao(de, para, evid) {
    evid = evid || {};
    var i = ESTADOS.indexOf(de), j = ESTADOS.indexOf(para);
    if (i < 0 || j < 0) return { ok: false, motivo: 'Estado desconhecido.' };
    if (j !== i + 1) return { ok: false, motivo: 'Transição fora de ordem: de "' + de + '" só se avança para "' + ESTADOS[Math.min(i + 1, ESTADOS.length - 1)] + '".' };
    var falta = (EXIGE[para] || []).filter(function (k) { return !evid[k]; });
    if (j >= ESTADOS.indexOf('aprovada_avaliacao_judicial') && !evid.validacaoHumana && para === 'aprovada_avaliacao_judicial') falta.push('validacaoHumana');
    if (falta.length) return { ok: false, motivo: 'Faltam evidências para "' + para + '": ' + falta.join(', ') + '.' };
    return { ok: true, motivo: '' };
  }
  // Fase 1: a geração de arquivo PER/DCOMP é bloqueada por desenho (etapa separada do diagnóstico, exige responsável habilitado).
  function gerarPerdcomp() { return { ok: false, bloqueado: true, motivo: 'Bloqueado na Fase 1: a compensação exige trânsito em julgado, habilitação do crédito e autorização de responsável habilitado, em etapa separada do diagnóstico.' }; }

  // ---------- leitura mínima da ECF do Lucro Presumido ----------
  function num(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return NaN;
    if (/,/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
    return Number(s);
  }
  // Layout dos registros P200/P300/P400/P500 lido de forma genérica (REG|CODIGO|DESCRICAO|VALOR) — A CONFERIR com o leiaute oficial da ECF.
  function lerEcfPresumido(texto, nome) {
    var out = { arquivo: nome || '', tipo: 'ecf-presumido', cnpj: '', empresa: '', ano: null, formaTrib: '', periodos: [], p: { P200: [], P300: [], P400: [], P500: [] }, temReal: false, avisos: [] };
    var per = null;
    String(texto || '').split(/\r?\n/).forEach(function (ln) {
      var f = ln.split('|'); if (f.length < 3 || f[0] !== '') return;
      var reg = f[1];
      if (reg === '0000') { out.empresa = f[5] || ''; out.cnpj = (f[6] || '').replace(/\D/g, ''); out.ano = +String(f[4] || '').slice(4) || null; if (f[2] !== 'LECF') out.avisos.push('O arquivo não é uma ECF (0000 sem LECF).'); }
      else if (reg === '0010') out.formaTrib = f[5] || '';
      else if (reg === 'P030') { per = { cod: f[2] || '', ini: f[3] || '', fin: f[4] || '', tri: 0 }; var m = +String(f[4] || '').slice(2, 4); per.tri = m ? Math.ceil(m / 3) : 0; out.periodos.push(per); }
      else if (/^P(200|300|400|500)$/.test(reg)) out.p[reg].push({ periodo: per ? per.cod : '', tri: per ? per.tri : 0, cod: f[2], descricao: f[3] || '', valor: num(f[4]) });
      else if (/^(M300|M350|N500|N630|N650|N670)$/.test(reg)) out.temReal = true;
    });
    if (!out.cnpj) out.avisos.push('Registro 0000 não encontrado ou sem CNPJ.');
    var n = out.p.P200.length + out.p.P300.length + out.p.P400.length + out.p.P500.length;
    if (!n) out.avisos.push('Nenhum registro P200/P300/P400/P500: a ECF pode não ser do Lucro Presumido.');
    out.avisos.push('Leiaute dos registros P200 a P500 lido de forma genérica (código, descrição, valor): conferir com o manual oficial da ECF.');
    return out;
  }
  // coeficientes de presunção encontrados nas linhas da ECF (descrição com PERCENTUAL/COEFICIENTE), por tributo
  function coeficientesEcf(ecf) {
    var r = { irpj: [], csll: [] };
    var pega = function (arr, dest) { arr.forEach(function (l) { if (/PERCENTUAL|COEFICIENTE|ALIQUOTA DE PRESUN/i.test(String(l.descricao).normalize('NFD').replace(/[̀-ͯ]/g, '')) && isFinite(l.valor)) dest.push({ tri: l.tri, pct: l.valor }); }); };
    pega(ecf.p.P200, r.irpj); pega(ecf.p.P400, r.csll);
    return r;
  }

  // ---------- ECD -> margem por trimestre ----------
  function margemDeEcd(ecds) {
    var out = {}, avisos = [];
    var M = (typeof root !== 'undefined' && root.MotorEcd) || (function () { try { return require('./motor-ecd.js'); } catch (e) { return null; } })();
    (ecds || []).forEach(function (ecd) {
      if (!M || !M.veiculosUsados) return;
      var rr = M.veiculosUsados(ecd);
      (rr.avisos || []).forEach(function (m) { avisos.push('ECD ' + (ecd.arquivo || '') + ': ' + m); });
      Object.keys(rr.porCompetencia || {}).forEach(function (comp) {
        var p = comp.split('-'), k = p[0] + '-T' + Math.ceil(+p[1] / 3), x = rr.porCompetencia[comp];
        var t = out[k] = out[k] || { venda: 0, custo: 0, origem: 'ECD' };
        t.venda += cent(x.venda); t.custo += cent(x.custo);
      });
    });
    return { porTrimestre: out, avisos: avisos };
  }

  // ---------- triagem ----------
  var CLASSIF = { ELEGIVEL: 'Elegível', POTENCIAL: 'Potencialmente elegível', PENDENTE: 'Pendente de documentação', NAO: 'Não elegível' };
  function triagem(c, ecfs, trimestres) {
    c = c || {}; var motivos = [], alertas = [], pend = [];
    var temP = (ecfs || []).some(function (e) { return e.p.P200.length || e.p.P300.length || e.p.P400.length || e.p.P500.length; });
    var soReal = (ecfs || []).length && !temP && (ecfs || []).some(function (e) { return e.temReal; });
    if (c.simples) motivos.push('Simples Nacional: fora do escopo desta tese enquanto não houver módulo específico.');
    if (c.regime === 'real' || soReal) motivos.push('Lucro Real: fora do escopo desta tese enquanto não houver módulo específico.');
    if (c.acaoJudicialAnterior) alertas.push('Existe ação judicial anterior: revisão jurídica antes de qualquer cálculo.');
    if (c.compensacaoRealizada) alertas.push('Há compensação já realizada: revisão jurídica obrigatória.');
    if (c.decisaoDesfavoravel) alertas.push('Há decisão desfavorável: revisão jurídica obrigatória.');
    if (c.vendasNovasSegregadas === false) alertas.push('Vendas de veículos novos precisam ser segregadas da margem de usados.');
    var ks = Object.keys(trimestres || {});
    var comMargem = ks.filter(function (k) { return trimestres[k].margemC !== null && trimestres[k].margemC !== undefined; });
    if (!comMargem.length) pend.push('Valores de aquisição e alienação dos veículos usados (margem por trimestre).');
    if (c.objetoSocialVeiculos == null) pend.push('Objeto social compatível com compra e venda de veículos (atos constitutivos).');
    else if (c.objetoSocialVeiculos === false) motivos.push('Objeto social não inclui compra e venda de veículos automotores.');
    if (c.operacoesDocumentadas == null) pend.push('Operações de aquisição e revenda documentadas (NF-e de entrada e de saída; controle de estoque).');
    else if (c.operacoesDocumentadas === false) pend.push('Documentação fiscal das operações insuficiente.');
    var coefAlto = comMargem.some(function (k) { return trimestres[k].coefOriginalBp.irpj > COEF_TESE_BP.irpj || trimestres[k].coefOriginalBp.csll > COEF_TESE_BP.csll; });
    var classe;
    if (motivos.length) classe = CLASSIF.NAO;
    else if (pend.length) classe = CLASSIF.PENDENTE;
    else if (!temP && !(ecfs || []).length) classe = CLASSIF.POTENCIAL;
    else if (coefAlto) classe = CLASSIF.ELEGIVEL;
    else classe = CLASSIF.POTENCIAL;
    if (classe === CLASSIF.ELEGIVEL && alertas.length) classe = CLASSIF.POTENCIAL;
    if (!(ecfs || []).length) pend.push('ECF do Lucro Presumido (P200/P300/P400/P500) para conferir coeficientes e bases.');
    return { classe: classe, motivos: motivos, pendencias: pend, alertas: alertas };
  }

  // ---------- cálculo trimestral ----------
  function cincoAnos(ref) { var d = new Date(ref); d.setUTCFullYear(d.getUTCFullYear() - 5); return d.toISOString().slice(0, 10); }
  function vencimentoEstimado(ano, tri) { var d = new Date(Date.UTC(ano, tri * 3 + 1, 0)); return d.toISOString().slice(0, 10); } // último dia do mês seguinte ao fim do trimestre
  function normTri(k, v, ecfsCoef, ecdMargem) {
    var m = /^(\d{4})-T([1-4])$/.exec(k); if (!m) return null;
    var t = { chave: k, ano: +m[1], tri: +m[2], origemMargem: null, margemC: null, vendaC: null, custoC: null, outrasC: { irpj: 0, csll: 0 }, receitaC: null, retC: { irpj: 0, csll: 0 }, recC: null, recData: null, coefOriginalBp: { irpj: COEF_ORIGINAL_BP.irpj, csll: COEF_ORIGINAL_BP.csll }, origemCoef: 'padrão 32% (a confirmar na ECF)' };
    v = v || {};
    if (v.margem != null) { t.margemC = cent(v.margem); t.origemMargem = 'manual'; }
    else if (v.venda != null || v.custo != null) { t.vendaC = cent(v.venda); t.custoC = cent(v.custo); t.margemC = t.vendaC - t.custoC; t.origemMargem = 'manual'; }
    else if (ecdMargem) { t.vendaC = ecdMargem.venda; t.custoC = ecdMargem.custo; t.margemC = ecdMargem.venda - ecdMargem.custo; t.origemMargem = 'ECD'; }
    if (v.outrasBases) t.outrasC = { irpj: cent(v.outrasBases.irpj), csll: cent(v.outrasBases.csll) };
    if (v.receitaBruta != null) t.receitaC = cent(v.receitaBruta);
    if (v.retencoes) t.retC = { irpj: cent(v.retencoes.irpj), csll: cent(v.retencoes.csll) };
    if (v.recolhido) { t.recC = { irpj: cent(v.recolhido.irpj), csll: cent(v.recolhido.csll) }; t.recData = v.recolhido.data || null; }
    if (v.coefOriginal) { t.coefOriginalBp = { irpj: Math.round(Number(v.coefOriginal.irpj) * 100), csll: Math.round(Number(v.coefOriginal.csll) * 100) }; t.origemCoef = 'informado'; }
    else if (ecfsCoef) {
      var ci = ecfsCoef.irpj.filter(function (x) { return x.tri === t.tri; })[0], cc = ecfsCoef.csll.filter(function (x) { return x.tri === t.tri; })[0];
      if (ci || cc) { if (ci) t.coefOriginalBp.irpj = Math.round(ci.pct * 100); if (cc) t.coefOriginalBp.csll = Math.round(cc.pct * 100); t.origemCoef = 'ECF'; }
    }
    return t;
  }
  // base presumida da margem com a majoração da LC 224/2025 (se a regra vigora na competência e o limite foi informado)
  function basePresumida(margem, coefBp, tributo, t, lc, avisos) {
    var base = pct(margem, coefBp), regra = regraLc224(tributo, t.ano, t.tri), maj = null;
    if (regra && margem > 0) {
      if (lc && lc.limiteTrimestre != null && t.receitaC) {
        var lim = cent(lc.limiteTrimestre), exc = Math.max(0, t.receitaC - lim), frac = mulDiv(exc, 10000, t.receitaC);
        var extra = pct(pct(base, regra.acrescimoBp), frac);
        base += extra; maj = { regra: regra.id, fracaoExcessoBp: frac, acrescimo: extra };
      } else {
        avisos.push(t.chave + ' (' + tributo.toUpperCase() + '): a ' + regra.base + ' já vale nesta competência, mas a majoração não foi aplicada — informe o limite (opts.lc224.limiteTrimestre) e a receita bruta total do trimestre. Parâmetro a conferir: ' + regra.conferir + '.');
      }
    }
    return { base: base, majoracao: maj };
  }
  function analisar(entrada, opts) {
    entrada = entrada || {}; opts = opts || {};
    var hoje = opts.hoje ? new Date(opts.hoje) : new Date();
    var refPrazo = opts.dataAjuizamento ? new Date(opts.dataAjuizamento) : hoje, limitePrazo = cincoAnos(refPrazo);
    var avisos = [], ecfs = entrada.ecfs || [], ecdM = margemDeEcd(entrada.ecds);
    avisos = avisos.concat(ecdM.avisos);
    var coefs = { irpj: [], csll: [] };
    ecfs.forEach(function (e) { var c = coeficientesEcf(e); coefs.irpj = coefs.irpj.concat(c.irpj); coefs.csll = coefs.csll.concat(c.csll); (e.avisos || []).forEach(function (m) { avisos.push((e.arquivo ? e.arquivo + ': ' : '') + m); }); });
    var chaves = {}; Object.keys(entrada.trimestres || {}).forEach(function (k) { chaves[k] = 1; }); Object.keys(ecdM.porTrimestre).forEach(function (k) { chaves[k] = 1; });
    var tris = {}, quarters = [];
    Object.keys(chaves).sort().forEach(function (k) {
      var t = normTri(k, (entrada.trimestres || {})[k], coefs, ecdM.porTrimestre[k]); if (t) { tris[k] = t; quarters.push(t); }
    });
    var tri = triagem(entrada.contribuinte, ecfs, tris);
    var linhas = [], tot = { margem: 0, orig: 0, tese: 0, dif: 0, noPrazo: 0, prescrito: 0, difConfirmada: 0 };
    quarters.forEach(function (t) {
      var l = { chave: t.chave, ano: t.ano, tri: t.tri, origemMargem: t.origemMargem, origemCoef: t.origemCoef, coefOriginalBp: t.coefOriginalBp, alertas: [] };
      if (t.margemC === null) { l.status = 'sem margem'; l.alertas.push('Sem margem informada para o trimestre.'); linhas.push(l); return; }
      var margem = t.margemC;
      if (margem <= 0) { l.status = 'margem não positiva'; l.margem = margem; l.alertas.push('Margem não positiva: sem base presumida e sem diferença; a compensação entre veículos não é feita automaticamente.'); l.diferencaNominal = 0; linhas.push(l); return; }
      var av = [];
      var bo_i = basePresumida(margem, t.coefOriginalBp.irpj, 'irpj', t, (opts.lc224 || null), av), bo_c = basePresumida(margem, t.coefOriginalBp.csll, 'csll', t, (opts.lc224 || null), av);
      var bt_i = basePresumida(margem, COEF_TESE_BP.irpj, 'irpj', t, (opts.lc224 || null), []), bt_c = basePresumida(margem, COEF_TESE_BP.csll, 'csll', t, (opts.lc224 || null), []);
      avisos = avisos.concat(av);
      var baseOrigI = bo_i.base + t.outrasC.irpj, baseOrigC = bo_c.base + t.outrasC.csll, baseTeseI = bt_i.base + t.outrasC.irpj, baseTeseC = bt_c.base + t.outrasC.csll;
      var origI = Math.max(0, irpjDevido(baseOrigI) - t.retC.irpj), origC = Math.max(0, csllDevida(baseOrigC) - t.retC.csll);
      var teseI = Math.max(0, irpjDevido(baseTeseI) - t.retC.irpj), teseC = Math.max(0, csllDevida(baseTeseC) - t.retC.csll);
      var difI = Math.max(0, origI - teseI), difC = Math.max(0, origC - teseC), dif = difI + difC;
      var confirmado = null;
      if (t.recC) { // pagamento informado: nunca mais que o efetivamente recolhido
        confirmado = { irpj: Math.max(0, Math.min(t.recC.irpj, origI) - teseI), csll: Math.max(0, Math.min(t.recC.csll, origC) - teseC) };
        confirmado.total = confirmado.irpj + confirmado.csll;
      }
      var venc = t.recData || vencimentoEstimado(t.ano, t.tri), noPrazo = venc >= limitePrazo;
      var valorConsiderado = confirmado ? confirmado.total : dif;
      Object.assign(l, { margem: margem, origemMargem: t.origemMargem, outrasBases: t.outrasC,
        original: { baseIrpj: baseOrigI, baseCsll: baseOrigC, irpj: origI, csll: origC, total: origI + origC },
        tese: { baseIrpj: baseTeseI, baseCsll: baseTeseC, irpj: teseI, csll: teseC, total: teseI + teseC },
        diferencaNominal: dif, diferencaIrpj: difI, diferencaCsll: difC, pagamento: confirmado ? 'informado' : 'não confirmado', confirmado: confirmado,
        majoracaoLc224: { original: { irpj: bo_i.majoracao, csll: bo_c.majoracao }, tese: { irpj: bt_i.majoracao, csll: bt_c.majoracao } },
        vencimento: venc, noPrazo: noPrazo, status: noPrazo ? (confirmado ? 'estimada, com pagamento informado' : 'estimada, pagamento não confirmado') : 'fora do prazo de 5 anos' });
      if (t.origemCoef !== 'ECF' && t.origemCoef !== 'informado') l.alertas.push('Coeficiente original assumido em 32%: confirmar na ECF.');
      if (t.coefOriginalBp.irpj <= COEF_TESE_BP.irpj && t.coefOriginalBp.csll <= COEF_TESE_BP.csll) l.alertas.push('O contribuinte já usou os coeficientes da tese: sem diferença.');
      tot.margem += margem; tot.orig += origI + origC; tot.tese += teseI + teseC; tot.dif += dif;
      if (noPrazo) tot.noPrazo += valorConsiderado; else tot.prescrito += valorConsiderado;
      if (confirmado) tot.difConfirmada += confirmado.total;
      linhas.push(l);
    });
    if (!quarters.length) avisos.push('Nenhum trimestre com margem: informe venda e custo (ou margem) por trimestre, ou envie a ECD com as contas de veículos usados.');
    avisos.push('Fase 1: sem NF-e/chassi (Fase 2), sem atualização pela Selic (Fase 3) e sem gestão processual (Fase 4).');
    avisos.push('Outras bases informadas (outrasBases) devem já refletir a majoração da LC 224/2025, quando devida.');
    return {
      versao: VERSAO, tese: TESE_ID, idCatalogo: ID_CATALOGO, geradoEm: hoje.toISOString(),
      natureza: 'oportunidade tributária judicial em disputa', risco: RISCO,
      fundamentos: FUNDAMENTOS, precedentes: PRECEDENTES, divergenciaAdministrativa: DIVERGENCIA,
      regrasVersionadas: REGRAS_LC224.map(function (r) { return { id: r.id, tributo: r.tributo, desde: r.desde, acrescimoBp: r.acrescimoBp, base: r.base, conferir: r.conferir }; }),
      triagem: tri, estados: ESTADOS, estadoAtual: tri.classe === CLASSIF.NAO ? 'identificada' : (quarters.length ? 'calculo_concluido' : 'em_analise_documental'),
      limitePrazo: limitePrazo, trimestres: linhas,
      total: { margem: tot.margem, apuradoOriginal: tot.orig, recalculadoTese: tot.tese, diferencaNominal: tot.dif, noPrazo: tot.noPrazo, foraDoPrazo: tot.prescrito, comPagamentoInformado: tot.difConfirmada },
      classificacao: { oportunidadeEstimada: tot.noPrazo, creditoJudicialmenteReconhecido: 0, efetivamenteCompensavel: 0 },
      atualizacaoSelic: { disponivel: false, motivo: 'Fase 3: série oficial e critério legal ainda não implementados para esta tese.' },
      pendencias: tri.pendencias, alertas: tri.alertas,
      avisos: avisos.filter(function (a, i, arr) { return arr.indexOf(a) === i; }),
      foraDoRecuperavel: true, pagamento: 'nao-confirmado'
    };
  }

  var api = { VERSAO: VERSAO, TESE_ID: TESE_ID, ID_CATALOGO: ID_CATALOGO, FUNDAMENTOS: FUNDAMENTOS, PRECEDENTES: PRECEDENTES, DIVERGENCIA: DIVERGENCIA, RISCO: RISCO, ESTADOS: ESTADOS, CLASSIF: CLASSIF,
    REGRAS_LC224: REGRAS_LC224, lerEcfPresumido: lerEcfPresumido, coeficientesEcf: coeficientesEcf, margemDeEcd: margemDeEcd, triagem: triagem, analisar: analisar,
    validarTransicao: validarTransicao, gerarPerdcomp: gerarPerdcomp, pct: pct, mulDiv: mulDiv, irpjDevido: irpjDevido, csllDevida: csllDevida };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MotorIrpjVeiculos = api;
})(typeof self !== 'undefined' ? self : this);
