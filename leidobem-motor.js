/*
 * Reversa Tax — motor da Lei do Bem (Lei nº 11.196/2005, Capítulo III; Decreto nº 5.798/2006; IN RFB nº 1.187/2011).
 * Lê os arquivos do cliente (ECF, ECD, folha em CSV, NF-e/NFS-e em XML), verifica a elegibilidade, valida os dispêndios,
 * calcula a exclusão adicional e a economia estimada de IRPJ/CSLL, pontua a confiança, monta o rascunho do FORMP&D
 * e preenche os modelos de documentos. Funciona no navegador (window.LeiDoBem) e no Node (module.exports).
 *
 * Regras de produto: diagnóstico não é crédito; tudo passa por revisão humana antes de qualquer envio;
 * o sistema nunca submete o FORMP&D nem transmite declarações — gera rascunhos e planilhas de apoio.
 *
 * Correções em relação à base gerada no chat (Qwen), conferidas no texto legal:
 *  - A exclusão do art. 19 é de 60% dos dispêndios (70% ou 80% conforme o aumento de pesquisadores, art. 19 §1º
 *    e Decreto 5.798/2006 art. 8º §1º) — o dispêndio em si já reduz o lucro como despesa operacional (art. 17, I).
 *    Não se soma "100% + 60%" na exclusão.
 *  - Patente concedida ou cultivar registrado dá exclusão adicional de até 20% (art. 19 §3º), no período da concessão.
 *  - IPI, depreciação integral e amortização acelerada estão no art. 17, incisos II, III e IV (não nos arts. 20/21).
 */
(function (root) {
  'use strict';

  var VERSAO = '1.0.0';

  // ------------------------------------------------------------------ parâmetros por vigência
  // Camada de vigência: cada regra tem a fonte. Se a lei mudar para um ano-calendário, acrescente um bloco aqui.
  var PARAMETROS = {
    padrao: {
      exclusaoBase: 0.60,          // Lei 11.196/2005, art. 19, caput
      exclusaoAte5: 0.70,          // art. 19 §1º; Decreto 5.798/2006, art. 8º §1º, I — aumento de pesquisadores de até 5%
      exclusaoAcima5: 0.80,        // Decreto 5.798/2006, art. 8º §1º, II — aumento acima de 5%
      adicionalPatente: 0.20,      // art. 19 §3º — patente concedida ou cultivar registrado
      irpj: 0.15, irpjAdicional: 0.10, irpjLimiteMes: 20000, // RIR/2018, arts. 623 e 624
      csll: 0.09,                  // Lei 7.689/1988, art. 3º, III (regra geral; parametrizável por empresa)
      prazoFormpd: '07-31'         // Decreto 5.798/2006, art. 14 — 31 de julho do ano seguinte, salvo prorrogação do MCTI
    }
  };
  function params(ano) { return PARAMETROS[ano] || PARAMETROS.padrao; }

  var FONTES = {
    exclusao: 'Lei 11.196/2005, art. 19; Decreto 5.798/2006, art. 8º',
    limite: 'IN RFB 1.187/2011, art. 8º — exclusão limitada ao lucro real e à base da CSLL antes da própria exclusão; sem aproveitamento do excesso em períodos seguintes',
    regularidade: 'Lei 11.196/2005, art. 23 — fruição condicionada à regularidade fiscal federal',
    lucroReal: 'Lei 11.196/2005, art. 19 — exclusão do lucro líquido na determinação do lucro real e da base da CSLL',
    formpd: 'Decreto 5.798/2006, art. 14 — informações ao MCTI até 31 de julho do ano seguinte',
    cpc04: 'CPC 04 (R1), itens 54 a 57 — pesquisa é despesa; desenvolvimento pode ser ativado',
    patente: 'Lei 11.196/2005, art. 19 §3º',
    incentivos: 'Lei 11.196/2005, art. 17, II (IPI), III (depreciação integral), IV (amortização acelerada), VI (remessas)'
  };

  // ------------------------------------------------------------------ utilitários
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[()\-]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s); if (!isFinite(n)) return 0;
    return neg ? -n : n;
  }
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function dataSped(d) { d = soDigitos(d); return d.length === 8 ? d.slice(4, 8) + '-' + d.slice(2, 4) + '-' + d.slice(0, 2) : ''; }
  function linhasSped(txt) {
    return String(txt || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.charAt(0) === '|'; })
      .map(function (l) { return l.split('|'); });
  }
  function uid(p) { return (p || 'x') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function fmt(v) { return 'R$ ' + r2(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cnpjFmt(c) { c = soDigitos(c); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—'); }
  function dataBR(iso) { var p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }

  // ------------------------------------------------------------------ classificação automática de arquivos
  // "Ambiente controlado": ao subir, o Reversa reconhece o tipo e inicia o processamento sozinho.
  function identificarArquivo(nome, texto) {
    var t = String(texto || '').slice(0, 4000);
    var n = semAcento(nome);
    if (/^\s*\|0000\|LECF\|/m.test(t)) return 'ecf';
    if (/^\s*\|0000\|LECD\|/m.test(t)) return 'ecd';
    if (/^\s*\|0000\|/m.test(t) && /\|I010\||\|I050\|/.test(String(texto).slice(0, 200000))) return 'ecd';
    if (/<(\w+:)?(nfeProc|NFe)[\s>]/.test(t) || /<infNFe/.test(t)) return 'nfe';
    if (/<(\w+:)?(CompNfse|Nfse|ConsultarNfse|InfNfse|GerarNfseResposta)[\s>]/i.test(t)) return 'nfse';
    if (/\.(csv|txt)$/.test(n) && /cpf/i.test(t.split(/\r?\n/)[0] || '')) return 'folha';
    if (/\.csv$/.test(n)) return 'folha';
    return 'desconhecido';
  }

  // ------------------------------------------------------------------ ECF (Escrituração Contábil Fiscal)
  var FORMA_TRIB = {
    '1': 'Lucro Real', '2': 'Lucro Real/Arbitrado', '3': 'Lucro Presumido/Real', '4': 'Lucro Presumido/Real/Arbitrado',
    '5': 'Lucro Presumido', '6': 'Lucro Arbitrado', '7': 'Lucro Presumido/Arbitrado', '8': 'Imune do IRPJ', '9': 'Isento do IRPJ'
  };
  // Lucro real em todo o ano só nas formas 1 e 2; 3 e 4 combinam períodos (o benefício vale só nos trimestres no lucro real).
  function regimeDaForma(f) {
    if (f === '1' || f === '2') return 'lucro_real';
    if (f === '3' || f === '4') return 'misto';
    if (f === '5' || f === '7') return 'lucro_presumido';
    if (f === '6') return 'arbitrado';
    if (f === '8' || f === '9') return 'imune_isento';
    return 'desconhecido';
  }
  var RE_LDB = /11\.?196|lei do bem|inova[cç][aã]o tecnol|pesquisa tecnol|p\s*&\s*d|pd&i/i;

  function parseECF(txt) {
    var L = linhasSped(txt);
    var out = { tipo: 'ecf', cnpj: '', nome: '', dtIni: '', dtFin: '', ano: null, retificadora: false, formaTrib: '', formaTribTexto: '',
      regime: 'desconhecido', apuracao: '', periodos: [], exclusaoLeiDoBem: { irpj: 0, csll: 0, linhas: [] }, avisos: [] };
    var per = null;
    function periodo(chave) {
      for (var i = 0; i < out.periodos.length; i++) if (out.periodos[i].per === chave) return out.periodos[i];
      var p = { per: chave, dtIni: '', dtFin: '', lucroRealAntes: null, baseIRPJ: null, baseCSLLAntes: null, baseCSLL: null, linhasIRPJ: [], linhasCSLL: [] };
      out.periodos.push(p); return p;
    }
    L.forEach(function (f) {
      var reg = f[1];
      if (reg === '0000') {
        // |0000|LECF|COD_VER|CNPJ|NOME|IND_SIT_INI_PER|SIT_ESPECIAL|PAT_REMAN_CIS|DT_SIT_ESP|DT_INI|DT_FIN|RETIFICADORA|NUM_REC|...
        out.cnpj = soDigitos(f[4]); out.nome = f[5] || ''; out.dtIni = dataSped(f[10]); out.dtFin = dataSped(f[11]);
        out.retificadora = f[12] === 'S'; out.ano = out.dtFin ? Number(out.dtFin.slice(0, 4)) : null;
      } else if (reg === '0010') {
        // |0010|HASH_ECF_ANTERIOR|OPT_REFIS|OPT_PAES|FORMA_TRIB|FORMA_APUR|...
        // A posição varia entre versões do leiaute (OPT_PAES saiu em versões novas): procura o par FORMA_TRIB (1-9) + FORMA_APUR (A/T).
        var k0 = 5; for (var k = 3; k <= 7; k++) if (/^[1-9]$/.test(f[k] || '') && /^[AT]$/.test(f[k + 1] || '')) { k0 = k; break; }
        out.formaTrib = f[k0] || ''; out.formaTribTexto = FORMA_TRIB[out.formaTrib] || 'não identificada';
        out.regime = regimeDaForma(out.formaTrib); out.apuracao = f[k0 + 1] === 'A' ? 'anual' : f[k0 + 1] === 'T' ? 'trimestral' : '';
      } else if (reg === 'N030' || reg === 'M030' || reg === 'L030' || reg === 'P030' || reg === 'T030' || reg === 'U030') {
        // |N030|DT_INI|DT_FIN|PER_APUR|  (períodos de apuração: A00 anual, T01..T04 trimestres, A01..A12 estimativas)
        var chave = f[4] || (f[2] + '-' + f[3]);
        if (reg === 'N030' || reg === 'M030') { per = periodo(chave); per.dtIni = dataSped(f[2]); per.dtFin = dataSped(f[3]); }
        else per = null;
      } else if (per && (reg === 'N500' || reg === 'N630' || reg === 'N650' || reg === 'N670')) {
        // |Nxxx|CODIGO|DESCRICAO|VALOR|
        var desc = f[3] || '', v = num(f[4]), d = semAcento(desc);
        var item = { reg: reg, codigo: f[2], descricao: desc, valor: v };
        if (reg === 'N500' || reg === 'N630') per.linhasIRPJ.push(item); else per.linhasCSLL.push(item);
        if (reg === 'N500' && /lucro real/.test(d) && /antes/.test(d) && /compensa/.test(d)) per.lucroRealAntes = v;
        if (reg === 'N500' && per.lucroRealAntes == null && /^lucro real/.test(d)) per.lucroRealAntes = v;
        if (reg === 'N630' && /^base de calculo do (irpj|imposto)/.test(d) && per.baseIRPJ == null) per.baseIRPJ = v;
        if (reg === 'N650' && /base de calculo/.test(d) && /antes/.test(d) && /compensa/.test(d)) per.baseCSLLAntes = v;
        if (reg === 'N670' && /^base de calculo da csll/.test(d) && per.baseCSLL == null) per.baseCSLL = v;
      } else if (reg === 'M300' || reg === 'M350') {
        // e-Lalur/e-Lacs Parte A: |M300|CODIGO|DESCRICAO|TIPO_LANCAMENTO|IND_RELACAO|VALOR|HIST_LAN_LAL|
        var hist = (f[3] || '') + ' ' + (f[7] || '');
        if (f[4] === 'E' && RE_LDB.test(hist)) {
          var vv = num(f[6]);
          if (reg === 'M300') out.exclusaoLeiDoBem.irpj += vv; else out.exclusaoLeiDoBem.csll += vv;
          out.exclusaoLeiDoBem.linhas.push({ reg: reg, descricao: (f[3] || '').trim(), valor: vv });
        }
      }
    });
    out.periodos = out.periodos.filter(function (p) { return p.linhasIRPJ.length || p.linhasCSLL.length; });
    out.periodos.forEach(function (p) {
      // Base disponível antes da exclusão: preferimos o lucro real antes da compensação de prejuízos (N500);
      // na falta, a base de cálculo (N630/N670). Valores negativos ficam como estão (sem aproveitamento).
      p.limiteIRPJ = p.lucroRealAntes != null ? p.lucroRealAntes : (p.baseIRPJ != null ? p.baseIRPJ : null);
      p.limiteCSLL = p.baseCSLLAntes != null ? p.baseCSLLAntes : (p.baseCSLL != null ? p.baseCSLL : null);
      p.meses = mesesEntre(p.dtIni, p.dtFin) || (/^T/.test(p.per) ? 3 : 12);
      if (p.limiteIRPJ == null) out.avisos.push('Período ' + p.per + ': lucro real não localizado nos registros N500/N630 — informe manualmente.');
      if (p.limiteCSLL == null) out.avisos.push('Período ' + p.per + ': base da CSLL não localizada nos registros N650/N670 — informe manualmente.');
    });
    if (!out.cnpj) out.avisos.push('Registro 0000 não encontrado: o arquivo não parece ser uma ECF completa.');
    if (!out.formaTrib) out.avisos.push('Registro 0010 não encontrado: forma de tributação não identificada.');
    if (out.regime !== 'lucro_real' && out.regime !== 'misto' && out.formaTrib) out.avisos.push('Forma de tributação: ' + out.formaTribTexto + '. A Lei do Bem só se aplica no lucro real.');
    if (out.exclusaoLeiDoBem.linhas.length) out.avisos.push('A ECF já tem exclusão que parece ser da Lei do Bem: confira para não contar duas vezes.');
    out.exclusaoLeiDoBem.irpj = r2(out.exclusaoLeiDoBem.irpj); out.exclusaoLeiDoBem.csll = r2(out.exclusaoLeiDoBem.csll);
    return out;
  }
  function mesesEntre(a, b) {
    if (!a || !b) return 0;
    var ya = +a.slice(0, 4), ma = +a.slice(5, 7), yb = +b.slice(0, 4), mb = +b.slice(5, 7);
    return (yb - ya) * 12 + (mb - ma) + 1;
  }

  // ------------------------------------------------------------------ ECD (Escrituração Contábil Digital)
  // Lê o plano de contas (I050), centros de custo (I100) e saldos (I150/I155) para localizar contas e centros de P&D
  // e totalizar o movimento a débito das contas de resultado — base da conciliação contabilidade × dispêndios.
  var RE_PD_CONTA = /p\s*&\s*d|pd&i|pesquis|desenvolv(?!imento comercial)|inova[cç]|lei do bem|prototip/i;
  function parseECD(txt) {
    var L = linhasSped(txt), contas = {}, ccus = {}, out = { tipo: 'ecd', cnpj: '', nome: '', dtIni: '', dtFin: '', ano: null,
      contasPD: [], centrosPD: [], totalPD: 0, ativacaoPD: [], avisos: [] };
    var mov = {}, res355 = {}; // conta|ccus -> débito líquido (resultado)
    L.forEach(function (f) {
      var reg = f[1];
      if (reg === '0000') { out.dtIni = dataSped(f[3]); out.dtFin = dataSped(f[4]); out.nome = f[5] || ''; out.cnpj = soDigitos(f[6]); out.ano = out.dtFin ? +out.dtFin.slice(0, 4) : null; }
      else if (reg === 'I050') contas[f[6]] = { cod: f[6], nat: f[3], tipo: f[4], nome: f[8] || '' }; // |I050|DT_ALT|COD_NAT|IND_CTA|NIVEL|COD_CTA|COD_CTA_SUP|CTA|
      else if (reg === 'I100') ccus[f[3]] = f[4] || '';                                              // |I100|DT_ALT|COD_CCUS|CCUS|
      else if (reg === 'I155') {                                                                   // |I155|COD_CTA|COD_CCUS|VL_SLD_INI|IND_DC_INI|VL_DEB|VL_CRED|VL_SLD_FIN|IND_DC_FIN|
        var k = f[2] + '|' + (f[3] || '');
        mov[k] = (mov[k] || 0) + num(f[6]) - num(f[7]);
      } else if (reg === 'I355') {                                                                 // |I355|COD_CTA|COD_CCUS|VL_CTA|IND_DC| saldo de resultado antes do encerramento
        var k2 = f[2] + '|' + (f[3] || '');
        res355[k2] = (res355[k2] || 0) + (f[5] === 'C' ? -num(f[4]) : num(f[4]));
      }
    });
    // Para contas de resultado, o saldo antes do encerramento (I355) é a fonte mais segura; o I155 pode incluir o encerramento.
    Object.keys(res355).forEach(function (k) { var c = contas[k.split('|')[0]]; if (c && c.nat === '04') mov[k] = res355[k]; });
    // ajuste de chaves: COD_CTA vem em f[6] no I050 (DT_ALT=f[2], COD_NAT=f[3], IND_CTA=f[4], NIVEL=f[5], COD_CTA=f[6], SUP=f[7], CTA=f[8])
    var porConta = {};
    Object.keys(mov).forEach(function (k) {
      var p = k.split('|'), c = contas[p[0]], cc = p[1];
      var nomeC = c ? c.nome : '', nomeCC = ccus[cc] || '';
      var ePD = RE_PD_CONTA.test(nomeC) || RE_PD_CONTA.test(nomeCC);
      if (!ePD) return;
      if (c && c.nat === '04') { // contas de resultado
        porConta[p[0]] = porConta[p[0]] || { cod: p[0], nome: nomeC, valor: 0, centros: [] };
        porConta[p[0]].valor += mov[k];
        if (cc) porConta[p[0]].centros.push({ cod: cc, nome: nomeCC, valor: r2(mov[k]) });
      } else if (c && (c.nat === '01') && /intang|imobiliz|diferid/i.test(nomeC)) {
        out.ativacaoPD.push({ cod: p[0], nome: nomeC, valor: r2(mov[k]) });
      }
    });
    out.contasPD = Object.keys(porConta).map(function (k) { porConta[k].valor = r2(porConta[k].valor); return porConta[k]; })
      .filter(function (c) { return c.valor !== 0; });
    out.totalPD = r2(out.contasPD.reduce(function (s, c) { return s + c.valor; }, 0));
    Object.keys(ccus).forEach(function (k) { if (RE_PD_CONTA.test(ccus[k])) out.centrosPD.push({ cod: k, nome: ccus[k] }); });
    if (!Object.keys(contas).length) out.avisos.push('Plano de contas (I050) não encontrado.');
    if (!out.contasPD.length) out.avisos.push('Nenhuma conta de resultado com nome de P&D/pesquisa/inovação: a segregação contábil precisa ser feita (KB §8).');
    if (out.ativacaoPD.length) out.avisos.push('Há contas de ativo intangível/imobilizado ligadas a P&D: gastos ativados só entram no benefício à medida da amortização (CPC 04).');
    return out;
  }

  // ------------------------------------------------------------------ folha de pagamento (CSV)
  var SINONIMOS = {
    cpf: ['cpf'], nome: ['nome', 'funcionario', 'colaborador', 'empregado'], cargo: ['cargo'], funcao: ['funcao', 'função', 'atividade'],
    departamento: ['departamento', 'setor', 'area', 'área'], centroCusto: ['centro de custo', 'centro_custo', 'centrocusto', 'cc'],
    formacao: ['formacao', 'formação', 'escolaridade', 'titulacao', 'titulação', 'ultima formacao'], sexo: ['sexo', 'genero', 'gênero'],
    competencia: ['competencia', 'competência', 'mes', 'mês', 'periodo', 'período'],
    salario: ['salario', 'salário', 'salario base', 'remuneracao', 'remuneração'], encargos: ['encargos', 'inss patronal', 'encargos sociais'],
    fgts: ['fgts'], beneficios: ['beneficios', 'benefícios'], total: ['custo total', 'valor total', 'total', 'custo'],
    horas: ['horas', 'horas trabalhadas', 'horas p&d', 'horas projeto'], dedicacao: ['dedicacao', 'dedicação', 'percentual', '% p&d', 'alocacao', 'alocação'],
    projeto: ['projeto', 'codigo projeto', 'código projeto'], timesheet: ['timesheet', 'apontamento']
  };
  function mapear(cab) {
    var idx = {};
    cab.forEach(function (c, i) {
      var n = semAcento(c).replace(/[_\s]+/g, ' ').trim();
      Object.keys(SINONIMOS).forEach(function (k) {
        if (idx[k] != null) return;
        if (SINONIMOS[k].some(function (s) { s = semAcento(s); return n === s || (s.length > 3 && n.indexOf(s) === 0); })) idx[k] = i;
      });
    });
    return idx;
  }
  function splitCSV(linha, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < linha.length; i++) {
      var ch = linha[i];
      if (ch === '"') { if (q && linha[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(function (s) { return s.trim(); });
  }
  var CARGOS = {
    pesquisador: ['pesquisador', 'cientista', 'engenheiro de pesquisa', 'doutor', 'pos-doc', 'pós-doc', 'mestre'],
    tecnico: ['engenheiro', 'desenvolvedor', 'programador', 'analista de sistemas', 'arquiteto de software', 'cientista de dados', 'data scientist',
      'qa', 'testes', 'tecnico de laboratorio', 'laboratorista', 'projetista', 'devops', 'software', 'pesquisa', 'p&d', 'inovacao'],
    apoio: ['tecnico', 'auxiliar de laboratorio', 'assistente de pesquisa', 'estagiario de p&d', 'bolsista'],
    nao: ['vendedor', 'comercial', 'marketing', 'financeiro', 'contabil', 'contador', 'rh', 'recursos humanos', 'administrativo', 'recepcion',
      'motorista', 'limpeza', 'porteiro', 'atendimento', 'suporte ao cliente', 'faturamento', 'compras', 'juridico', 'producao', 'operador'],
    socio: ['socio', 'pro-labore', 'pro labore', 'diretor presidente', 'administrador']
  };
  var DEPTO_PD = ['p&d', 'pd&i', 'pesquisa', 'desenvolvimento', 'inovacao', 'engenharia', 'laboratorio', 'tecnologia', 'ti'];
  function classificarPessoa(p) {
    var t = semAcento([p.cargo, p.funcao].join(' ')), d = semAcento([p.departamento, p.centroCusto].join(' '));
    function tem(lista, s) { return lista.some(function (k) { return s.indexOf(semAcento(k)) >= 0; }); }
    if (tem(CARGOS.socio, t)) return { tipo: 'socio', elegivel: false, motivo: 'Sócio/pró-labore: só entra com função técnica comprovada (KB §7.4).' };
    if (tem(CARGOS.nao, t) && !tem(DEPTO_PD, d)) return { tipo: 'nao_elegivel', elegivel: false, motivo: 'Cargo administrativo, comercial ou de produção.' };
    if (tem(CARGOS.pesquisador, t)) return { tipo: 'pesquisador', elegivel: true, motivo: 'Cargo de pesquisador.' };
    if (tem(CARGOS.tecnico, t)) return { tipo: 'tecnico', elegivel: true, motivo: tem(DEPTO_PD, d) ? 'Cargo técnico em área de P&D.' : 'Cargo técnico — confirmar alocação em P&D.' };
    if (tem(CARGOS.apoio, t)) return { tipo: 'apoio', elegivel: true, motivo: 'Apoio técnico direto a P&D — confirmar.' };
    if (tem(DEPTO_PD, d)) return { tipo: 'tecnico', elegivel: true, motivo: 'Departamento/centro de custo de P&D — confirmar função.' };
    return { tipo: 'indefinido', elegivel: false, motivo: 'Cargo sem vínculo claro com P&D — revisar.' };
  }
  function parseFolha(txt) {
    var linhas = String(txt || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = { tipo: 'folha', pessoas: [], avisos: [] };
    if (linhas.length < 2) { out.avisos.push('Folha vazia ou sem cabeçalho.'); return out; }
    var sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    var cab = splitCSV(linhas[0], sep), ix = mapear(cab);
    if (ix.cpf == null && ix.nome == null) { out.avisos.push('Não encontrei as colunas CPF ou Nome no cabeçalho.'); return out; }
    var por = {};
    linhas.slice(1).forEach(function (l) {
      var c = splitCSV(l, sep), g = function (k) { return ix[k] == null ? '' : (c[ix[k]] || ''); };
      var cpf = soDigitos(g('cpf')), nome = g('nome');
      if (!cpf && !nome) return;
      var chave = cpf || semAcento(nome);
      var total = ix.total != null ? num(g('total')) : num(g('salario')) + num(g('encargos')) + num(g('fgts')) + num(g('beneficios'));
      var p = por[chave] || (por[chave] = { id: uid('p'), cpf: cpf, nome: nome, cargo: g('cargo'), funcao: g('funcao'), departamento: g('departamento'),
        centroCusto: g('centroCusto'), formacao: g('formacao'), sexo: g('sexo').slice(0, 1).toUpperCase(), custoAnual: 0, horas: 0, meses: [], alocacoes: [],
        timesheet: false });
      p.custoAnual += total; p.horas += num(g('horas'));
      var comp = g('competencia'); if (comp) p.meses.push({ competencia: comp, valor: r2(total) });
      var ded = num(g('dedicacao')), proj = g('projeto');
      if (proj || ded) p.alocacoes.push({ projetoCodigo: proj, percentual: ded > 1 ? ded : ded * 100 });
      if (/^(s|sim|x|1|true)$/i.test(g('timesheet'))) p.timesheet = true;
    });
    out.pessoas = Object.keys(por).map(function (k) {
      var p = por[k]; p.custoAnual = r2(p.custoAnual);
      // consolida alocações repetidas por projeto (média ponderada simples)
      var m = {}; p.alocacoes.forEach(function (a) { var key = a.projetoCodigo || '_'; m[key] = m[key] || []; m[key].push(a.percentual); });
      p.alocacoes = Object.keys(m).map(function (key) { var arr = m[key]; return { projetoCodigo: key === '_' ? '' : key, percentual: r2(arr.reduce(function (s, x) { return s + x; }, 0) / arr.length) }; });
      var cl = classificarPessoa(p); p.classificacao = cl.tipo; p.elegivel = cl.elegivel; p.motivo = cl.motivo;
      if (p.cpf && !cpfValido(p.cpf)) out.avisos.push('CPF inválido para ' + (p.nome || p.cpf) + '.');
      return p;
    });
    if (ix.total == null && ix.salario == null) out.avisos.push('Sem coluna de valor (custo total ou salário): informe o custo de cada pessoa.');
    return out;
  }
  function cpfValido(c) {
    c = soDigitos(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); var d = ((10 * s) % 11) % 10; if (+c[t] !== d) return false; }
    return true;
  }

  // ------------------------------------------------------------------ NF-e / NFS-e (XML)
  // Recebe o texto do XML e um "documento" já parseado (DOMParser no navegador). Sem DOM, usa leitura por expressão regular.
  function tag(xml, nome) { var m = new RegExp('<(?:\\w+:)?' + nome + '[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + nome + '>', 'i').exec(xml); return m ? m[1].trim() : ''; }
  function tags(xml, nome) { var re = new RegExp('<(?:\\w+:)?' + nome + '[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + nome + '>', 'gi'), out = [], m; while ((m = re.exec(xml))) out.push(m[1]); return out; }
  var RE_GENERICA = /^(servi[cç]os?( prestados)?|consultoria|diversos|presta[cç][aã]o de servi[cç]os?|servi[cç]os? t[eé]cnicos?|honor[aá]rios)\.?$/i;
  function parseNFe(xml) {
    var s = String(xml || ''), out = { tipo: 'nfe', notas: [], avisos: [] };
    var blocos = tags(s, 'infNFe'); if (!blocos.length && /<infNFe/.test(s)) blocos = [s];
    var ids = []; var reId = /<(?:\w+:)?infNFe[^>]*Id="NFe(\d{44})"/gi, mm; while ((mm = reId.exec(s))) ids.push(mm[1]);
    blocos.forEach(function (b, i) {
      var emit = tag(b, 'emit'), dest = tag(b, 'dest'), ide = tag(b, 'ide');
      var itens = tags(b, 'det').map(function (d) { var p = tag(d, 'prod'); return { descricao: tag(p, 'xProd'), ncm: tag(p, 'NCM'), cfop: tag(p, 'CFOP'), valor: num(tag(p, 'vProd').replace('.', ',')) }; });
      var total = num((tag(tag(b, 'ICMSTot'), 'vNF') || '0').replace('.', ','));
      var servico = itens.length && itens.every(function (x) { return /^\d?933$/.test(String(x.cfop).slice(-3)) || /^[12]933$/.test(x.cfop); });
      out.notas.push({ chave: ids[i] || '', numero: tag(ide, 'nNF'), data: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).slice(0, 10),
        emitenteCnpj: soDigitos(tag(emit, 'CNPJ')), emitenteNome: tag(emit, 'xNome'), destinatarioCnpj: soDigitos(tag(dest, 'CNPJ')),
        valor: r2(total || itens.reduce(function (t, x) { return t + x.valor; }, 0)), itens: itens, rubrica: servico ? 'servico_pj' : 'material',
        descricao: itens.map(function (x) { return x.descricao; }).join('; ').slice(0, 400) });
    });
    if (!out.notas.length) out.avisos.push('XML sem NF-e reconhecível.');
    return out;
  }
  function parseNFSe(xml) {
    var s = String(xml || ''), out = { tipo: 'nfse', notas: [], avisos: [] };
    var blocos = tags(s, 'InfNfse'); if (!blocos.length) blocos = [s];
    blocos.forEach(function (b) {
      var prest = tag(b, 'PrestadorServico') || tag(b, 'Prestador'), tom = tag(b, 'TomadorServico') || tag(b, 'Tomador');
      var desc = tag(b, 'Discriminacao') || tag(b, 'xDescServ') || '';
      out.notas.push({ chave: tag(b, 'CodigoVerificacao') || '', numero: tag(b, 'Numero'), data: (tag(b, 'DataEmissao') || tag(b, 'dhEmi')).slice(0, 10),
        emitenteCnpj: soDigitos(tag(prest, 'Cnpj') || tag(prest, 'CNPJ')), emitenteNome: tag(prest, 'RazaoSocial') || tag(prest, 'xNome'),
        destinatarioCnpj: soDigitos(tag(tom, 'Cnpj') || tag(tom, 'CNPJ')), valor: r2(num((tag(b, 'ValorServicos') || tag(b, 'vServ') || '0').replace('.', ','))),
        itens: [], rubrica: 'servico_pj', descricao: desc.slice(0, 600) });
    });
    if (!out.notas.length || !out.notas[0].valor) out.avisos.push('NFS-e sem valor de serviço reconhecível (layout municipal diferente?): confira os valores.');
    return out;
  }

  // ------------------------------------------------------------------ catálogo de rubricas
  var RUBRICAS = {
    rh: { nome: 'Recursos humanos', exige: 'timesheet', formpd: '2.10 Recursos Humanos' },
    servico_pf: { nome: 'Serviço de apoio técnico (PF)', exige: 'contrato', formpd: '2.7 Serviços de Apoio Técnico (PF)' },
    servico_pj: { nome: 'Serviço de apoio técnico (PJ)', exige: 'contrato', formpd: '2.8 Serviços de Apoio Técnico (PJ)' },
    ict: { nome: 'Universidade / ICT', exige: 'contrato', formpd: '2.4 Universidades/Instituições de Pesquisa' },
    microempresa: { nome: 'Microempresa/EPP contratada', exige: 'contrato', formpd: '2.6 Microempresa/EPP Contratada' },
    inventor: { nome: 'Inventor independente', exige: 'contrato', formpd: '2.5 Inventor Independente' },
    material: { nome: 'Material de consumo', exige: 'nf', formpd: '2.9 Material de Consumo' },
    depreciacao: { nome: 'Depreciação de equipamento de P&D', exige: 'ativo', formpd: '3.3/3.4 Equipamentos (depreciação)' },
    amortizacao: { nome: 'Amortização de intangível de P&D', exige: 'ativo', formpd: '3.2 Bens Intangíveis' },
    patente: { nome: 'Patentes e registros', exige: 'comprovante', formpd: '3.1 Patentes e Registros' },
    outros: { nome: 'Outros dispêndios operacionais de P&D', exige: 'justificativa', formpd: 'Outros (com justificativa)' }
  };
  var NAO_ELEGIVEIS = [
    'Pesquisa de mercado, marketing e publicidade', 'Treinamento operacional e suporte rotineiro', 'Manutenção corretiva e atualização de versão sem desafio técnico',
    'Customização estética, tradução ou localização', 'Implantação de software de prateleira (ERP)', 'Controle de qualidade rotineiro e produção em escala comercial',
    'Aquisição de terreno, prédio ou equipamento como despesa integral (só a depreciação)', 'Despesas administrativas gerais',
    'Despesas sem vínculo com projeto ou sem documento hábil', 'Despesas já cobertas por subvenção ou outro incentivo (dupla contagem)'
  ];

  // ------------------------------------------------------------------ score técnico do projeto (KB §4.5)
  var CRITERIOS = [
    { id: 'problema', rotulo: 'Existe problema técnico claro', peso: 20 },
    { id: 'incerteza', rotulo: 'Existe incerteza tecnológica', peso: 20 },
    { id: 'novidade', rotulo: 'Existe novidade ou melhoria significativa', peso: 15 },
    { id: 'metodologia', rotulo: 'Existe metodologia sistemática', peso: 10 },
    { id: 'testes', rotulo: 'Existem testes ou experimentos', peso: 15 },
    { id: 'evidencias', rotulo: 'Existem evidências documentais', peso: 10 },
    { id: 'equipe', rotulo: 'Equipe técnica alocada', peso: 5 },
    { id: 'resultado', rotulo: 'Resultado técnico mensurável', peso: 5 }
  ];
  var TERMOS_INELEGIVEIS = /pesquisa de mercado|marketing|publicidade|treinamento|suporte|manuten[cç][aã]o corretiva|atualiza[cç][aã]o de vers[aã]o|implanta[cç][aã]o de (erp|sistema)|layout|tradu[cç][aã]o|customiza[cç][aã]o/i;
  function scoreProjeto(p) {
    var c = (p && p.criterios) || {}, s = 0;
    CRITERIOS.forEach(function (k) { if (c[k.id]) s += k.peso; });
    var alertas = [];
    var texto = [p.titulo, p.objetivo, p.desafio, p.descricao].join(' ');
    if (TERMOS_INELEGIVEIS.test(texto)) alertas.push('Descrição com termo de atividade normalmente inelegível (KB §4.3): confirme o desafio técnico.');
    if (String(p.desafio || '').trim().length < 80) alertas.push('Desafio tecnológico curto ou ausente: o MCTI glosa projetos sem incerteza técnica descrita.');
    if (String(p.metodologia || '').trim().length < 60) alertas.push('Metodologia pouco detalhada.');
    var faixa = s >= 90 ? 'Elegível com alta confiança' : s >= 70 ? 'Elegível com revisão leve' : s >= 50 ? 'Revisão humana obrigatória' : s >= 30 ? 'Alto risco: exigir evidências adicionais' : 'Inelegível';
    return { score: s, faixa: faixa, elegivel: s >= 50, alertas: alertas };
  }

  // ------------------------------------------------------------------ elegibilidade (KB §2.4)
  function elegibilidade(caso, calc) {
    var e = caso.empresa || {}, motivos = [], status = 'ELEGIVEL';
    var reg = e.regime || 'desconhecido';
    if (reg !== 'lucro_real' && reg !== 'misto') { status = 'INELEGIVEL'; motivos.push({ nivel: 'bloqueio', texto: 'Regime tributário: ' + (e.formaTribTexto || reg) + '. A Lei do Bem só se aplica a empresas no lucro real.', fonte: FONTES.lucroReal }); }
    if (reg === 'misto') motivos.push({ nivel: 'alerta', texto: 'Ano com períodos no lucro real e no presumido: o benefício vale só nos períodos do lucro real.', fonte: FONTES.lucroReal });
    var rf = e.regularidade || {};
    if (rf.situacao === 'positiva') { if (status === 'ELEGIVEL') status = 'BLOQUEADO'; motivos.push({ nivel: 'bloqueio', texto: 'Há débitos federais exigíveis: regularize antes de usar o benefício.', fonte: FONTES.regularidade }); }
    else if (rf.situacao !== 'cnd' && rf.situacao !== 'cpen') motivos.push({ nivel: 'alerta', texto: 'Regularidade fiscal não verificada: anexe a CND ou CPEN válida.', fonte: FONTES.regularidade });
    else if (rf.validade && rf.validade < hoje()) motivos.push({ nivel: 'alerta', texto: 'Certidão vencida em ' + dataBR(rf.validade) + ': emita nova certidão.', fonte: FONTES.regularidade });
    var semLucro = calc.periodos.length && calc.periodos.every(function (p) { return !(p.limiteIRPJ > 0) && !(p.limiteCSLL > 0); });
    if (!calc.periodos.length) motivos.push({ nivel: 'alerta', texto: 'Sem a ECF do ano: o lucro real e a base da CSLL precisam ser informados.', fonte: FONTES.limite });
    else if (semLucro) { if (status === 'ELEGIVEL') status = 'SEM_APROVEITAMENTO'; motivos.push({ nivel: 'bloqueio', texto: 'Sem lucro tributável no ano: a exclusão não gera economia e o excesso não passa para os anos seguintes.', fonte: FONTES.limite }); }
    var projetos = (caso.projetos || []).filter(function (p) { return scoreProjeto(p).elegivel; });
    if (!(caso.projetos || []).length) { if (status === 'ELEGIVEL') status = 'INELEGIVEL'; motivos.push({ nivel: 'bloqueio', texto: 'Nenhum projeto de PD&I cadastrado.', fonte: FONTES.exclusao }); }
    else if (!projetos.length) { if (status === 'ELEGIVEL') status = 'INELEGIVEL'; motivos.push({ nivel: 'bloqueio', texto: 'Nenhum projeto atingiu o score técnico mínimo (50).', fonte: FONTES.exclusao }); }
    if (!(calc.dispendios > 0)) { if (status === 'ELEGIVEL') status = 'INELEGIVEL'; motivos.push({ nivel: 'bloqueio', texto: 'Nenhum dispêndio elegível vinculado a projeto.', fonte: FONTES.exclusao }); }
    var rotulo = { ELEGIVEL: 'Elegível', INELEGIVEL: 'Inelegível', BLOQUEADO: 'Bloqueado (irregularidade fiscal)', SEM_APROVEITAMENTO: 'Sem aproveitamento no ano' }[status];
    return { status: status, rotulo: rotulo, motivos: motivos };
  }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ------------------------------------------------------------------ validação de dispêndios (KB §5.3, §7, §9, §6.5)
  function validarDespesas(caso) {
    var projetos = {}; (caso.projetos || []).forEach(function (p) { projetos[p.id] = p; });
    var vistos = {}, porCpf = {}, achados = [];
    function add(nivel, texto, ref) { achados.push({ nivel: nivel, texto: texto, ref: ref || null }); }
    var itens = (caso.despesas || []).map(function (d) {
      var x = { id: d.id, status: 'ELEGIVEL', motivos: [], valorElegivel: 0 };
      var pct = d.percentual == null || d.percentual === '' ? 100 : Number(d.percentual);
      var valor = num(d.valor) * Math.max(0, Math.min(100, pct)) / 100;
      var proj = projetos[d.projetoId], rub = RUBRICAS[d.rubrica];
      function rej(m) { x.status = 'REJEITADA'; x.motivos.push(m); }
      function exc(m) { if (x.status === 'ELEGIVEL') x.status = 'EXCECAO'; x.motivos.push(m); }
      if (!rub) rej('Rubrica não elegível.');
      if (!proj) exc('Sem projeto vinculado.');
      else {
        if (!scoreProjeto(proj).elegivel) exc('Projeto com score técnico abaixo de 50.');
        if (d.data && proj.inicio && d.data < proj.inicio) exc('Despesa anterior ao início do projeto.');
        if (d.data && proj.fim && d.data > proj.fim) exc('Despesa posterior ao término do projeto.');
      }
      if (pct > 100) exc('Percentual de alocação acima de 100%.');
      var ev = d.evidencias || {};
      if (d.rubrica === 'rh' && !ev.timesheet) exc('Pessoal sem timesheet/apontamento de horas.');
      if (rub && rub.exige === 'contrato' && !ev.contrato) exc('Serviço sem contrato e relatório de entrega.');
      if (d.rubrica === 'material' && !ev.nf && !(d.doc && d.doc.chave)) exc('Material sem nota fiscal vinculada.');
      if ((d.rubrica === 'servico_pj' || d.rubrica === 'servico_pf') && RE_GENERICA.test(String(d.descricao || '').trim())) exc('Descrição genérica do serviço: exija escopo técnico detalhado na nota e no contrato.');
      if (d.rubrica === 'outros' && String(d.justificativa || '').trim().length < 20) exc('Outros dispêndios exigem justificativa técnica.');
      if (d.rateio) {
        if (!d.rateio.memorial) exc('Rateio sem memorial de cálculo.');
        if (['horas_homem', 'area', 'consumo', 'uso'].indexOf(d.rateio.criterio) < 0) exc('Critério de rateio não documentado.');
      }
      if (d.ativado) rej('Gasto ativado (intangível/imobilizado): só a amortização/depreciação do período entra no benefício (CPC 04).');
      if (d.capex) rej('Aquisição de equipamento não é dispêndio: lance só a depreciação do período em P&D.');
      if (d.outroIncentivo) rej('Despesa coberta por subvenção ou outro incentivo: dupla contagem.');
      var chave = d.doc && d.doc.chave ? 'nf:' + d.doc.chave : (d.doc && d.doc.cnpj ? 'cv:' + d.doc.cnpj + '|' + r2(d.valor) + '|' + (d.data || '') + '|' + (d.projetoId || '') : null);
      if (chave) { if (vistos[chave]) rej('Duplicidade com outro lançamento (mesmo documento/CNPJ, valor e data).'); vistos[chave] = true; }
      if (d.rubrica === 'rh' && d.doc && d.doc.cpf) porCpf[d.doc.cpf] = (porCpf[d.doc.cpf] || 0) + pct;
      if (x.status !== 'REJEITADA') x.valorElegivel = r2(valor);
      x.valorConsiderado = x.status === 'ELEGIVEL' ? x.valorElegivel : 0;
      return x;
    });
    Object.keys(porCpf).forEach(function (cpf) { if (porCpf[cpf] > 100.0001) add('erro', 'Alocação de horas do CPF ' + mascaraCpf(cpf) + ' soma ' + r2(porCpf[cpf]) + '% entre projetos (máximo 100%).'); });
    return { itens: itens, achados: achados };
  }
  function mascaraCpf(c) { c = soDigitos(c); return c.length === 11 ? '***.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-**' : c; }

  // ------------------------------------------------------------------ cálculo do benefício (KB §3/§12, corrigido)
  function irpjDevido(base, meses, P) {
    if (!(base > 0)) return 0;
    var adicional = Math.max(0, base - P.irpjLimiteMes * (meses || 12)) * P.irpjAdicional;
    return base * P.irpj + adicional;
  }
  function percentualExclusao(caso, P) {
    var pq = caso.pesquisadores || {}, ant = Number(pq.anoAnterior) || 0, atu = Number(pq.anoAtual) || 0;
    if (atu > ant && ant > 0) { var inc = (atu - ant) / ant; return { pct: inc > 0.05 ? P.exclusaoAcima5 : P.exclusaoAte5, motivo: 'Aumento de ' + r2(inc * 100) + '% no número de pesquisadores contratados.' }; }
    if (atu > ant && ant === 0) return { pct: P.exclusaoAcima5, motivo: 'Primeiros pesquisadores contratados no ano (aumento acima de 5%) — confirmar enquadramento no art. 8º §1º do Decreto 5.798/2006.' };
    return { pct: P.exclusaoBase, motivo: 'Sem aumento no número de pesquisadores contratados.' };
  }
  function periodoDaData(data, periodos) {
    if (!data) return -1;
    for (var i = 0; i < periodos.length; i++) if (periodos[i].dtIni && data >= periodos[i].dtIni && data <= periodos[i].dtFin) return i;
    return -1;
  }
  function calcular(caso) {
    var ano = caso.anoBase, P = params(ano);
    var val = validarDespesas(caso);
    var porId = {}; val.itens.forEach(function (x) { porId[x.id] = x; });
    var e = caso.empresa || {};
    var aliqCsll = e.aliquotaCsll != null && e.aliquotaCsll !== '' ? Number(e.aliquotaCsll) / 100 : P.csll;
    // períodos: da ECF, com ajustes manuais (override) do usuário
    var periodos = (e.periodos || []).map(function (p) {
      return { per: p.per, dtIni: p.dtIni, dtFin: p.dtFin, meses: p.meses || mesesEntre(p.dtIni, p.dtFin) || 12,
        limiteIRPJ: p.ajusteIRPJ != null && p.ajusteIRPJ !== '' ? num(p.ajusteIRPJ) : p.limiteIRPJ,
        limiteCSLL: p.ajusteCSLL != null && p.ajusteCSLL !== '' ? num(p.ajusteCSLL) : p.limiteCSLL,
        lucroReal: p.lucroReal !== false, dispendios: 0, patente: 0 };
    });
    if (!periodos.length && (e.lucroManualIRPJ != null || e.lucroManualCSLL != null)) {
      periodos.push({ per: 'A00', dtIni: ano + '-01-01', dtFin: ano + '-12-31', meses: 12, limiteIRPJ: num(e.lucroManualIRPJ), limiteCSLL: num(e.lucroManualCSLL), lucroReal: true, dispendios: 0, patente: 0 });
    }
    var porRubrica = {}, porProjeto = {}, total = 0, semData = 0, avisos = [];
    (caso.despesas || []).forEach(function (d) {
      var x = porId[d.id]; if (!x || !x.valorConsiderado) return;
      total += x.valorConsiderado;
      porRubrica[d.rubrica] = r2((porRubrica[d.rubrica] || 0) + x.valorConsiderado);
      porProjeto[d.projetoId] = r2((porProjeto[d.projetoId] || 0) + x.valorConsiderado);
      var i = periodos.length > 1 ? periodoDaData(d.data, periodos) : 0;
      if (periodos.length && i >= 0) periodos[i].dispendios += x.valorConsiderado;
      else if (periodos.length) semData += x.valorConsiderado;
    });
    // despesas sem data num ano trimestral: rateadas pelos períodos no lucro real, proporcional aos meses (aviso)
    if (semData > 0) {
      var alvo = periodos.filter(function (p) { return p.lucroReal; }), meses = alvo.reduce(function (s, p) { return s + p.meses; }, 0) || 1;
      alvo.forEach(function (p) { p.dispendios += semData * p.meses / meses; });
      avisos.push(fmt(semData) + ' em dispêndios sem data foram distribuídos pelos períodos proporcionalmente aos meses: informe a competência para precisão.');
    }
    var pe = percentualExclusao(caso, P);
    var pat = num(caso.patente && caso.patente.dispendiosVinculados);
    if (pat > 0 && caso.patente && caso.patente.dataConcessao) {
      var ip = periodoDaData(caso.patente.dataConcessao, periodos); if (ip < 0) ip = periodos.length - 1;
      if (ip >= 0) periodos[ip].patente = pat;
    }
    var res = { anoBase: ano, dispendios: r2(total), porRubrica: porRubrica, porProjeto: porProjeto, percentual: pe.pct, motivoPercentual: pe.motivo,
      periodos: [], exclusao: 0, exclusaoPatente: 0, aproveitadaIRPJ: 0, aproveitadaCSLL: 0, perdidaIRPJ: 0, perdidaCSLL: 0,
      economiaIRPJ: 0, economiaCSLL: 0, economia: 0, aliquotaCsll: aliqCsll, avisos: avisos, validacao: val, fontes: FONTES };
    periodos.forEach(function (p) {
      var excl = p.lucroReal ? p.dispendios * pe.pct : 0, exclPat = p.lucroReal ? p.patente * P.adicionalPatente : 0, totalExcl = excl + exclPat;
      var limI = Math.max(0, num(p.limiteIRPJ)), limC = Math.max(0, num(p.limiteCSLL));
      var aI = Math.min(totalExcl, limI), aC = Math.min(totalExcl, limC);
      var ecoI = irpjDevido(limI, p.meses, P) - irpjDevido(limI - aI, p.meses, P), ecoC = aC * aliqCsll;
      res.periodos.push({ per: p.per, dtIni: p.dtIni, dtFin: p.dtFin, meses: p.meses, lucroReal: p.lucroReal, limiteIRPJ: p.limiteIRPJ, limiteCSLL: p.limiteCSLL,
        dispendios: r2(p.dispendios), exclusao: r2(excl), exclusaoPatente: r2(exclPat), aproveitadaIRPJ: r2(aI), aproveitadaCSLL: r2(aC),
        perdidaIRPJ: r2(totalExcl - aI), perdidaCSLL: r2(totalExcl - aC), economiaIRPJ: r2(ecoI), economiaCSLL: r2(ecoC) });
      res.exclusao += excl; res.exclusaoPatente += exclPat; res.aproveitadaIRPJ += aI; res.aproveitadaCSLL += aC;
      res.perdidaIRPJ += totalExcl - aI; res.perdidaCSLL += totalExcl - aC; res.economiaIRPJ += ecoI; res.economiaCSLL += ecoC;
    });
    ['exclusao', 'exclusaoPatente', 'aproveitadaIRPJ', 'aproveitadaCSLL', 'perdidaIRPJ', 'perdidaCSLL', 'economiaIRPJ', 'economiaCSLL'].forEach(function (k) { res[k] = r2(res[k]); });
    res.economia = r2(res.economiaIRPJ + res.economiaCSLL);
    if (e.exclusaoExistente && (e.exclusaoExistente.irpj > 0 || e.exclusaoExistente.csll > 0)) avisos.push('A ECF já registra exclusão de Lei do Bem (' + fmt(e.exclusaoExistente.irpj) + ' no e-Lalur): a economia calculada pode já estar refletida na apuração.');
    res.elegibilidade = elegibilidade(caso, res);
    res.conciliacao = conciliar(caso, res);
    res.confianca = confianca(caso, res);
    res.prazo = prazoFormpd(caso);
    return res;
  }

  // ------------------------------------------------------------------ conciliação contabilidade (ECD) × dispêndios (KB §10.4)
  function conciliar(caso, calc) {
    var c = caso.contabil || {}, ecd = num(c.totalPD), disp = calc.dispendios;
    if (!(ecd > 0)) return { status: 'sem_ecd', texto: 'Sem ECD: a conciliação entre contabilidade e dispêndios não foi feita.', diferenca: null };
    var dif = r2(disp - ecd), tol = Math.max(1, ecd * 0.01);
    if (Math.abs(dif) <= tol) return { status: 'ok', texto: 'Dispêndios conferem com as contas de P&D da ECD (diferença ' + fmt(dif) + ').', diferenca: dif };
    if (dif > 0) return { status: 'erro', texto: 'Dispêndios superam as contas de P&D da ECD em ' + fmt(dif) + ': despesa fora da conta segregada ou valor sem lastro contábil.', diferenca: dif };
    return { status: 'alerta', texto: 'Contas de P&D da ECD têm ' + fmt(-dif) + ' a mais que os dispêndios: verifique despesas não vinculadas a projeto.', diferenca: dif };
  }

  // ------------------------------------------------------------------ score de confiança (KB §14)
  function confianca(caso, calc) {
    var e = caso.empresa || {}, rf = e.regularidade || {};
    var fiscal = rf.situacao === 'positiva' ? 0 : (rf.situacao === 'cnd' || rf.situacao === 'cpen') ? (rf.validade && rf.validade < hoje() ? 50 : 100) : 30;
    var lucro = !calc.periodos.length ? 0 : (calc.aproveitadaIRPJ >= (calc.exclusao + calc.exclusaoPatente) - 0.01 && (calc.exclusao + calc.exclusaoPatente) > 0 ? 100 : calc.aproveitadaIRPJ > 0 ? 60 : 0);
    var regime = e.regime === 'lucro_real' ? 100 : e.regime === 'misto' ? 60 : 0;
    var projs = caso.projetos || [], tecnico = projs.length ? projs.reduce(function (s, p) { return s + scoreProjeto(p).score; }, 0) / projs.length : 0;
    var c = caso.contabil || {};
    var contabil = c.totalPD > 0 ? (calc.conciliacao.status === 'ok' ? 100 : 60) : (c.contasSegregadas ? 50 : 20);
    var itens = calc.validacao.itens, ok = itens.filter(function (x) { return x.status === 'ELEGIVEL'; }).length;
    var evid = itens.length ? 100 * ok / itens.length : 0;
    var concil = calc.conciliacao.status === 'ok' ? 100 : calc.conciliacao.status === 'alerta' ? 60 : calc.conciliacao.status === 'erro' ? 20 : 40;
    var dims = [
      { id: 'fiscal', rotulo: 'Regularidade fiscal', peso: 0.20, valor: fiscal },
      { id: 'lucro', rotulo: 'Lucro tributável suficiente', peso: 0.15, valor: lucro },
      { id: 'regime', rotulo: 'Regime tributário correto', peso: 0.10, valor: regime },
      { id: 'tecnico', rotulo: 'Qualidade técnica dos projetos', peso: 0.25, valor: r2(tecnico) },
      { id: 'contabil', rotulo: 'Segregação contábil', peso: 0.15, valor: contabil },
      { id: 'evidencias', rotulo: 'Evidências documentais', peso: 0.10, valor: r2(evid) },
      { id: 'conciliacao', rotulo: 'Conciliação ECF/ECD/FORMP&D', peso: 0.05, valor: concil }
    ];
    var score = Math.round(dims.reduce(function (s, d) { return s + d.valor * d.peso; }, 0));
    if (calc.elegibilidade && (calc.elegibilidade.status === 'BLOQUEADO' || calc.elegibilidade.status === 'INELEGIVEL')) score = Math.min(score, 49);
    var politica = score >= 95 ? 'Automação quase total: revisão humana formal' : score >= 85 ? 'Geração automática com revisão leve' :
      score >= 70 ? 'Revisão humana obrigatória' : score >= 50 ? 'Exceção severa: exigir documentos adicionais' : 'Benefício bloqueado até resolver as pendências';
    return { score: score, politica: politica, dimensoes: dims };
  }

  function prazoFormpd(caso) {
    var ano = Number(caso.anoBase), P = params(ano);
    var data = (caso.formpd && caso.formpd.prazoInformado) || (ano ? (ano + 1) + '-' + P.prazoFormpd : '');
    if (!data) return null;
    var dias = Math.ceil((new Date(data + 'T23:59:59-03:00') - new Date()) / 86400000);
    var nivel = dias < 0 ? 'vencido' : dias <= 7 ? 'critico' : dias <= 30 ? 'atencao' : dias <= 60 ? 'aviso' : 'ok';
    return { data: data, dias: dias, nivel: nivel, fonte: caso.formpd && caso.formpd.prazoInformado ? 'Prazo informado (prorrogação do MCTI)' : FONTES.formpd };
  }

  // ------------------------------------------------------------------ pendências consolidadas (bloqueios, erros, alertas)
  function pendencias(caso, calc) {
    var out = [];
    calc.elegibilidade.motivos.forEach(function (m) { out.push({ nivel: m.nivel === 'bloqueio' ? 'bloqueio' : 'alerta', area: 'Elegibilidade', texto: m.texto }); });
    calc.validacao.achados.forEach(function (a) { out.push({ nivel: a.nivel, area: 'Dispêndios', texto: a.texto }); });
    var exc = calc.validacao.itens.filter(function (x) { return x.status !== 'ELEGIVEL'; }).length;
    if (exc) out.push({ nivel: 'alerta', area: 'Dispêndios', texto: exc + ' lançamento(s) com exceção ou rejeição: veja a aba Dispêndios.' });
    (caso.projetos || []).forEach(function (p) { scoreProjeto(p).alertas.forEach(function (a) { out.push({ nivel: 'alerta', area: 'Projeto ' + (p.codigo || p.titulo || ''), texto: a }); }); });
    if (calc.conciliacao.status === 'erro') out.push({ nivel: 'erro', area: 'Contábil', texto: calc.conciliacao.texto });
    else if (calc.conciliacao.status !== 'ok') out.push({ nivel: 'alerta', area: 'Contábil', texto: calc.conciliacao.texto });
    var c = caso.contabil || {};
    if (c.ativacao && c.ativacao.length) out.push({ nivel: 'alerta', area: 'Contábil', texto: 'Ativação de P&D detectada na ECD: benefício só sobre a amortização do período (CPC 04). Avalie com a controladoria se os critérios de ativação foram atendidos.' });
    (calc.avisos || []).forEach(function (a) { out.push({ nivel: 'alerta', area: 'Cálculo', texto: a }); });
    if (calc.prazo && (calc.prazo.nivel === 'critico' || calc.prazo.nivel === 'vencido')) out.push({ nivel: calc.prazo.nivel === 'vencido' ? 'erro' : 'alerta', area: 'Prazo', texto: calc.prazo.nivel === 'vencido' ? 'Prazo do FORMP&D vencido em ' + dataBR(calc.prazo.data) + '.' : 'Faltam ' + calc.prazo.dias + ' dia(s) para o prazo do FORMP&D (' + dataBR(calc.prazo.data) + ').' });
    var ordem = { bloqueio: 0, erro: 1, alerta: 2 };
    return out.sort(function (a, b) { return ordem[a.nivel] - ordem[b.nivel]; });
  }

  // ------------------------------------------------------------------ revisão humana (KB §15)
  var ETAPAS = [
    { id: 'fiscal', nome: 'Elegibilidade fiscal', responsavel: 'Contador / Tributário', valida: ['Regime tributário (lucro real)', 'Lucro tributável e base da CSLL por período', 'CND/CPEN válida', 'Limite de aproveitamento e excedente perdido', 'Período e prazo do FORMP&D'] },
    { id: 'tecnica', nome: 'Elegibilidade técnica', responsavel: 'Especialista técnico / P&D', valida: ['Projeto é inovação tecnológica (não rotina)', 'Há risco ou incerteza técnica', 'Há metodologia e evidências', 'Atividades excluídas foram removidas', 'Equipe e dedicação coerentes'] },
    { id: 'contabil', nome: 'Elegibilidade contábil', responsavel: 'Contabilidade', valida: ['Contas de P&D segregadas', 'Conciliação ECD × dispêndios × ECF', 'Rateios com memorial', 'Folha, depreciação e serviços de terceiros', 'Sem ativação indevida (CPC 04) e sem dupla contagem'] },
    { id: 'final', nome: 'Aprovação final', responsavel: 'Diretor / Comitê', valida: ['Rascunho do FORMP&D', 'Memória de cálculo', 'Dossiê de evidências', 'Riscos e parecer final'] }
  ];

  // ------------------------------------------------------------------ FORMP&D: rascunho e planilhas de apoio
  function csv(linhas) {
    return '﻿' + linhas.map(function (l) { return l.map(function (v) { var s = v == null ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';'); }).join('\r\n');
  }
  function br(v) { return r2(v).toFixed(2).replace('.', ','); }
  var TIPO_PESQUISA = { basica: 'Pesquisa Básica', aplicada: 'Pesquisa Aplicada', experimental: 'Desenvolvimento Experimental' };
  function formpd(caso, calc) {
    var e = caso.empresa || {}, projs = caso.projetos || [], desp = caso.despesas || [], pess = caso.pessoas || [];
    var valid = {}; calc.validacao.itens.forEach(function (x) { valid[x.id] = x; });
    var ok = function (d) { return valid[d.id] && valid[d.id].status === 'ELEGIVEL'; };
    var nomeProj = function (id) { var p = projs.filter(function (x) { return x.id === id; })[0]; return p ? (p.codigo ? p.codigo + ' — ' : '') + (p.titulo || '') : ''; };
    var planilhas = {};
    planilhas.recursos_humanos = { nome: 'FORMPD-RH', titulo: '2.10 Recursos Humanos', linhas: [['CPF', 'Nome completo', 'Sexo', 'Última formação', 'Função no projeto', 'Projeto', 'Horas no ano', 'Dedicação (%)', 'Valor total pago (R$)', 'Descrição das atividades']] };
    desp.filter(function (d) { return d.rubrica === 'rh' && ok(d); }).forEach(function (d) {
      var p = pess.filter(function (x) { return d.doc && x.cpf === d.doc.cpf; })[0] || {};
      planilhas.recursos_humanos.linhas.push([cnpjOuCpf(d.doc && d.doc.cpf), p.nome || d.descricao, p.sexo || '', p.formacao || '', d.funcao || p.cargo || '', nomeProj(d.projetoId),
        p.horas ? r2(p.horas * (d.percentual == null ? 100 : d.percentual) / 100) : '', d.percentual == null ? 100 : d.percentual, br(valid[d.id].valorConsiderado), d.atividades || '']);
    });
    var terceiros = [['servico_pj', 'servicos_pj', '2.8 Serviços de Apoio Técnico (PJ)', ['CNPJ', 'Razão social', 'Tipo de serviço', 'Situação', 'Projeto', 'Valor (R$)', 'Descrição técnica', 'Documento']],
      ['servico_pf', 'servicos_pf', '2.7 Serviços de Apoio Técnico (PF)', ['CPF', 'Nome', 'Função', 'Projeto', 'Horas', 'Valor pago (R$)', 'Descrição', 'Documento']],
      ['ict', 'universidades_ict', '2.4 Universidades / Instituições de Pesquisa', ['CNPJ', 'Nome da instituição', 'Unidade Embrapii?', 'Situação', 'Projeto', 'Valor (R$)', 'Descrição', 'Documento']],
      ['microempresa', 'microempresas', '2.6 Microempresa / EPP contratada', ['CNPJ', 'Razão social', 'Situação', 'Projeto', 'Valor (R$)', 'Descrição', 'Documento']],
      ['inventor', 'inventor_independente', '2.5 Inventor independente', ['CPF', 'Nome', 'Contratado/Transferido', 'Projeto', 'Valor (R$)', 'Descrição', 'Documento']],
      ['material', 'materiais', '2.9 Material de consumo', ['Identificação do material', 'Projeto', 'Valor (R$)', 'Vinculação com o projeto', 'Documento']],
      ['depreciacao', 'equipamentos', '3.3/3.4 Equipamentos (depreciação no período)', ['Bem', 'Projeto', 'Uso em P&D (%)', 'Depreciação elegível (R$)', 'Documento']],
      ['amortizacao', 'intangiveis', '3.2 Bens intangíveis (amortização no período)', ['Bem', 'Projeto', 'Amortização elegível (R$)', 'Documento']],
      ['patente', 'patentes', '3.1 Patentes e registros', ['Tipo de direito', 'Número', 'Projeto', 'Gasto (R$)', 'Especificação']],
      ['outros', 'outros', 'Outros dispêndios', ['Descrição', 'Projeto', 'Valor (R$)', 'Justificativa', 'Documento']]];
    terceiros.forEach(function (t) {
      var pl = planilhas[t[1]] = { nome: 'FORMPD-' + t[1].toUpperCase(), titulo: t[2], linhas: [t[3]] };
      desp.filter(function (d) { return d.rubrica === t[0] && ok(d); }).forEach(function (d) {
        var v = br(valid[d.id].valorConsiderado), doc = d.doc || {}, docTxt = doc.chave ? 'NF ' + (doc.numero || '') + ' ' + doc.chave : (doc.numero || '');
        var proj = nomeProj(d.projetoId), desc = d.descricao || '';
        if (t[0] === 'servico_pj') pl.linhas.push([cnpjOuCpf(doc.cnpj), doc.nome || '', d.tipoServico || 'Serviço de apoio técnico', d.situacao || 'Terminado', proj, v, desc, docTxt]);
        else if (t[0] === 'servico_pf') pl.linhas.push([cnpjOuCpf(doc.cpf), doc.nome || '', d.funcao || '', proj, d.horas || '', v, desc, docTxt]);
        else if (t[0] === 'ict') pl.linhas.push([cnpjOuCpf(doc.cnpj), doc.nome || '', d.embrapii ? 'Sim' : 'Não', d.situacao || 'Em execução', proj, v, desc, docTxt]);
        else if (t[0] === 'microempresa') pl.linhas.push([cnpjOuCpf(doc.cnpj), doc.nome || '', d.situacao || 'Terminado', proj, v, desc, docTxt]);
        else if (t[0] === 'inventor') pl.linhas.push([cnpjOuCpf(doc.cpf), doc.nome || '', d.situacao || 'Contratado', proj, v, desc, docTxt]);
        else if (t[0] === 'material') pl.linhas.push([desc, proj, v, d.vinculacao || '', docTxt]);
        else if (t[0] === 'depreciacao') pl.linhas.push([desc, proj, d.percentual == null ? 100 : d.percentual, v, docTxt]);
        else if (t[0] === 'amortizacao') pl.linhas.push([desc, proj, v, docTxt]);
        else if (t[0] === 'patente') pl.linhas.push([d.tipoDireito || 'Patente de invenção', d.numeroRegistro || '', proj, v, desc]);
        else pl.linhas.push([desc, proj, v, d.justificativa || '', docTxt]);
      });
    });
    var secoes = [
      { id: '1', titulo: '1. Identificação da empresa', campos: [['CNPJ', cnpjFmt(e.cnpj)], ['Razão social', e.nome || ''], ['Ano-base', caso.anoBase], ['Forma de tributação (ECF)', e.formaTribTexto || ''],
        ['Prejuízo fiscal no ano?', calc.periodos.length && calc.periodos.every(function (p) { return !(num(p.limiteIRPJ) > 0); }) ? 'Sim' : 'Não'], ['Total de funcionários', e.totalFuncionarios || ''],
        ['Receita operacional bruta', e.receitaBruta ? fmt(e.receitaBruta) : ''], ['Beneficiária da Lei 8.248/1991 (informática)?', e.leiInformatica ? 'Sim' : 'Não']] },
      { id: '2', titulo: '2. Programa / atividades de PD&I', projetos: projs.map(function (p) {
        var sc = scoreProjeto(p);
        return { codigo: p.codigo, titulo: p.titulo, score: sc.score, faixa: sc.faixa, campos: [['Nome da atividade', p.titulo || ''], ['Tipo', TIPO_PESQUISA[p.tipo] || ''], ['Área predominante', p.area || ''],
          ['Elementos tecnologicamente inovadores', p.novidade || ''], ['Desafio / barreira tecnológica', p.desafio || ''], ['Metodologia', p.metodologia || ''], ['Marcos críticos', p.marcos || ''],
          ['Projeto contínuo (plurianual)?', p.continuo ? 'Sim' : 'Não'], ['Início', dataBR(p.inicio)], ['Previsão de término', dataBR(p.fim)], ['Resultados obtidos', p.resultados || ''],
          ['Dispêndio no ano', fmt(calc.porProjeto[p.id] || 0)], ['Parceria com ICT / Embrapii', p.ict || 'Não']] };
      }) },
      { id: '3', titulo: '3. Dispêndios do programa', campos: Object.keys(calc.porRubrica).map(function (k) { return [RUBRICAS[k] ? RUBRICAS[k].nome : k, fmt(calc.porRubrica[k])]; }).concat([['Total', fmt(calc.dispendios)], ['Recursos próprios (%)', caso.formpd && caso.formpd.recursosProprios != null ? caso.formpd.recursosProprios : 100]]) },
      { id: '4', titulo: '4. Pesquisador exclusivo', campos: [['Pesquisadores contratados no ano anterior', (caso.pesquisadores || {}).anoAnterior || 0], ['Pesquisadores contratados no ano-base', (caso.pesquisadores || {}).anoAtual || 0], ['Enquadramento', calc.motivoPercentual]] },
      { id: '6', titulo: '6. Incentivos fiscais do programa (conferência — o formulário calcula sozinho)', campos: [['Percentual de exclusão (art. 19)', r2(calc.percentual * 100) + '%'], ['Exclusão adicional', fmt(calc.exclusao)], ['Exclusão por patente (art. 19 §3º)', fmt(calc.exclusaoPatente)], ['Aproveitada no IRPJ', fmt(calc.aproveitadaIRPJ)], ['Aproveitada na CSLL', fmt(calc.aproveitadaCSLL)], ['Economia estimada', fmt(calc.economia)]] }
    ];
    var anexos = [];
    if (desp.some(function (d) { return d.rubrica === 'rh'; })) anexos.push('Recursos humanos: documentos comprobatórios (timesheets, contratos de trabalho)');
    if (desp.some(function (d) { return d.rubrica === 'ict'; })) anexos.push('Universidades/ICTs: contrato ou convênio');
    if (desp.some(function (d) { return d.rubrica === 'inventor'; })) anexos.push('Inventor independente: contrato');
    if (desp.some(function (d) { return d.rubrica === 'microempresa'; })) anexos.push('Microempresa/EPP: contrato');
    if (desp.some(function (d) { return d.rubrica === 'servico_pj' || d.rubrica === 'servico_pf'; })) anexos.push('Serviços de apoio técnico: contratos e relatórios de entrega');
    var checklist = [
      ['Pelo menos um projeto cadastrado', projs.length > 0],
      ['Dispêndios e incentivos calculados', calc.dispendios > 0],
      ['Descrição técnica completa em todos os projetos', projs.length > 0 && projs.every(function (p) { return String(p.desafio || '').length >= 80 && String(p.metodologia || '').length >= 60; })],
      ['Todos os dispêndios vinculados a projeto', desp.length > 0 && desp.every(function (d) { return d.projetoId; })],
      ['Pessoal de apoio administrativo fora da base', !desp.some(function (d) { var p = pess.filter(function (x) { return d.doc && x.cpf === d.doc.cpf; })[0]; return d.rubrica === 'rh' && p && !p.elegivel && ok(d); })],
      ['Nenhuma pendência bloqueante', !pendencias(caso, calc).some(function (x) { return x.nivel === 'bloqueio' || x.nivel === 'erro'; })],
      ['Score de confiança ≥ 85', calc.confianca.score >= 85],
      ['Revisão humana concluída (4 etapas)', caso.status === 'aprovado' || caso.status === 'enviado']
    ];
    return { secoes: secoes, planilhas: planilhas, anexos: anexos, checklist: checklist,
      aviso: 'Rascunho de apoio ao preenchimento no portal do MCTI. O layout de importação das planilhas muda entre anos: confira o manual do FORMP&D do ano-base antes de importar. O Reversa não submete o formulário.' };
  }
  function cnpjOuCpf(v) { v = soDigitos(v); if (v.length === 14) return cnpjFmt(v); if (v.length === 11) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); return v; }

  // ------------------------------------------------------------------ recuperação retroativa e retificações (KB §16/§17)
  function retroativo(anos) {
    return (anos || []).map(function (a) {
      var P = params(a.ano), out = { ano: a.ano, regime: a.regime, formaTribTexto: a.formaTribTexto, avisos: [], risco: '', acao: '', credito: 0 };
      var lim = num(a.ajusteIRPJ !== '' && a.ajusteIRPJ != null ? a.ajusteIRPJ : a.lucroIRPJ), limC = num(a.ajusteCSLL !== '' && a.ajusteCSLL != null ? a.ajusteCSLL : a.lucroCSLL);
      var disp = num(a.dispendios), pct = a.percentual ? Number(a.percentual) / 100 : P.exclusaoBase;
      if (a.regime !== 'lucro_real' && a.regime !== 'misto') { out.risco = 'Inaplicável'; out.acao = 'Empresa fora do lucro real no ano: sem benefício.'; return out; }
      if (!(lim > 0)) { out.risco = 'Alto'; out.acao = 'Sem lucro tributável: sem benefício; retificar só com parecer jurídico.'; return out; }
      var excl = disp * pct, aI = Math.min(excl, lim), aC = Math.min(excl, Math.max(0, limC));
      out.exclusao = r2(excl); out.aproveitadaIRPJ = r2(aI); out.aproveitadaCSLL = r2(aC);
      out.credito = r2(irpjDevido(lim, 12, P) - irpjDevido(lim - aI, 12, P) + aC * (a.aliquotaCsll ? a.aliquotaCsll / 100 : P.csll));
      var limite = (Number(a.ano) + 6) + '-01-01'; // ECF entregue no ano seguinte; 5 anos (CTN art. 168 para restituição a partir do pagamento)
      out.prazo = 'Até cerca de 31/12/' + (Number(a.ano) + 5) + ' (5 anos do pagamento — CTN art. 168); confirme a data de cada recolhimento.';
      if (hoje() >= limite) { out.risco = 'Prescrito'; out.acao = 'Fora do prazo de 5 anos.'; out.credito = 0; return out; }
      if (a.exclusaoExistente > 0) out.avisos.push('A ECF já tem exclusão de Lei do Bem: a oportunidade é só a diferença.');
      if (!a.formpdNoPrazo) { out.risco = 'Alto'; out.acao = 'Sem FORMP&D entregue no prazo do ano: aproveitamento retroativo exige parecer jurídico antes de retificar a ECF.'; }
      else if (out.credito > 500000) { out.risco = 'Alto'; out.acao = 'Retificar ECF (Lalur/Lacs) e PER/DCOMP com revisão tripla.'; }
      else { out.risco = 'Baixo'; out.acao = 'Retificar ECF incluindo a exclusão no e-Lalur/e-Lacs e, havendo pagamento a maior, PER/DCOMP.'; }
      if (a.fiscalizacao) { out.risco = 'Crítico'; out.acao = 'Ano sob fiscalização: bloquear retificação.'; }
      return out;
    });
  }

  // ------------------------------------------------------------------ modelos de documentos (KB §18)
  var MODELOS = [
    { id: 'projeto', nome: 'Projeto técnico de P&D', porProjeto: true },
    { id: 'rateio', nome: 'Memorial de cálculo de rateio' },
    { id: 'parecer', nome: 'Parecer de elegibilidade' },
    { id: 'evidencias', nome: 'Relatório de evidências técnicas', porProjeto: true },
    { id: 'termo', nome: 'Termo de responsabilidade' },
    { id: 'checklist', nome: 'Checklist de auditoria' },
    { id: 'retroativo', nome: 'Memorando de recuperação retroativa' },
    { id: 'contrato', nome: 'Contrato de prestação de serviços de P&D (minuta)' },
    { id: 'timesheet', nome: 'Timesheet mensal', porPessoa: true },
    { id: 'naodupla', nome: 'Declaração de não dupla contagem' }
  ];
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tabela(cab, linhas) { return '<table><thead><tr>' + cab.map(function (c) { return '<th>' + h(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + (linhas.length ? linhas.map(function (l) { return '<tr>' + l.map(function (c) { return '<td>' + h(c) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + cab.length + '">[preencher]</td></tr>') + '</tbody></table>'; }
  function documento(id, caso, calc, opc) {
    opc = opc || {}; var e = caso.empresa || {}, ano = caso.anoBase, projs = caso.projetos || [];
    var cab = '<p class="id"><b>Empresa:</b> ' + h(e.nome || '[RAZÃO SOCIAL]') + ' · <b>CNPJ:</b> ' + h(cnpjFmt(e.cnpj)) + ' · <b>Ano-calendário:</b> ' + h(ano) + '</p>';
    var ass = function (papeis) { return '<div class="ass">' + papeis.map(function (p) { return '<div><span></span>' + h(p) + '<br>Data: ___/___/______</div>'; }).join('') + '</div>'; };
    var proj = projs.filter(function (p) { return p.id === opc.projetoId; })[0] || projs[0] || {};
    var corpo = '', titulo = (MODELOS.filter(function (m) { return m.id === id; })[0] || {}).nome || id;
    var despProj = function (pid) { return (caso.despesas || []).filter(function (d) { return d.projetoId === pid; }); };
    if (id === 'projeto') {
      var sc = scoreProjeto(proj);
      var eq = (caso.despesas || []).filter(function (d) { return d.projetoId === proj.id && d.rubrica === 'rh'; }).map(function (d) { var p = (caso.pessoas || []).filter(function (x) { return d.doc && x.cpf === d.doc.cpf; })[0] || {}; return [p.nome || d.descricao, p.cargo || '', p.formacao || '', (d.percentual == null ? 100 : d.percentual) + '%']; });
      corpo = '<h2>1. Identificação do projeto</h2>' + tabela(['Campo', 'Conteúdo'], [['Código', proj.codigo || ''], ['Título', proj.titulo || ''], ['Tipo', TIPO_PESQUISA[proj.tipo] || ''], ['Área', proj.area || ''], ['Início', dataBR(proj.inicio)], ['Término (previsto/real)', dataBR(proj.fim)], ['Responsável técnico', proj.responsavel || '']]) +
        '<h2>2. Objetivo tecnológico</h2><p>' + h(proj.objetivo || '[descrever]') + '</p><h2>3. Desafio tecnológico / incerteza</h2><p>' + h(proj.desafio || '[descrever o problema técnico sem solução óbvia]') + '</p>' +
        '<h2>4. Novidade / inovação</h2><p>' + h(proj.novidade || '[novo para a empresa / mercado nacional / internacional; melhoria significativa]') + '</p><h2>5. Metodologia</h2><p>' + h(proj.metodologia || '[fases: pesquisa, desenvolvimento, testes, validação]') + '</p>' +
        '<h2>6. Equipe técnica</h2>' + tabela(['Nome', 'Cargo', 'Formação', 'Dedicação'], eq) + '<h2>7. Resultados obtidos / esperados</h2><p>' + h(proj.resultados || '[resultados técnicos mensuráveis]') + '</p>' +
        '<h2>8. Evidências</h2><p>' + h(proj.evidencias || '[relatórios técnicos, repositório de código, relatórios de teste, fotos de protótipo, atas, contratos com ICTs, pedidos de patente]') + '</p>' +
        '<h2>9. Dispêndios do projeto no ano</h2><p>' + fmt(calc.porProjeto[proj.id] || 0) + '</p><p class="nota">Score técnico do Reversa: ' + sc.score + '/100 — ' + h(sc.faixa) + '.</p>' + ass(['Responsável técnico', 'Diretor da empresa']);
    } else if (id === 'rateio') {
      var rat = (caso.despesas || []).filter(function (d) { return d.rateio; });
      corpo = '<h2>1. Justificativa</h2><p>Rateio de despesas indiretas às atividades de P&D, com critério técnico, documentado e consistente (IN RFB 1.187/2011).</p>' +
        '<h2>2. Despesas rateadas e critério</h2>' + tabela(['Despesa', 'Critério', 'Base total', 'Base P&D', 'Percentual', 'Valor rateado'], rat.map(function (d) { return [d.descricao, d.rateio.criterio, d.rateio.baseTotal || '', d.rateio.baseProjeto || '', (d.percentual == null ? 100 : d.percentual) + '%', fmt(num(d.valor) * (d.percentual == null ? 100 : d.percentual) / 100)]; })) +
        '<h2>3. Memória de cálculo</h2><p>Valor rateado = valor da despesa × (base de P&D ÷ base total). Critérios aceitos: horas-homem (timesheet), área ocupada (planta), consumo/uso (logs, medição).</p>' + ass(['Contador responsável', 'Controller']);
    } else if (id === 'parecer') {
      var el = calc.elegibilidade;
      corpo = '<h2>1. Objetivo</h2><p>Avaliar a elegibilidade de ' + h(e.nome || '') + ' aos incentivos da Lei nº 11.196/2005 no ano-calendário ' + h(ano) + '.</p>' +
        '<h2>2. Requisitos verificados</h2>' + tabela(['Requisito', 'Situação'], [['Regime tributário', e.formaTribTexto || '—'], ['Regularidade fiscal', ({ cnd: 'CND', cpen: 'CPEN', positiva: 'Positiva (débitos exigíveis)' })[(e.regularidade || {}).situacao] || 'Não verificada'], ['Lucro tributável (IRPJ, soma dos períodos)', fmt(calc.periodos.reduce(function (s, p) { return s + Math.max(0, num(p.limiteIRPJ)); }, 0))], ['Projetos analisados', projs.length], ['Conciliação contábil', calc.conciliacao.texto], ['Prazo do FORMP&D', calc.prazo ? dataBR(calc.prazo.data) : '—']]) +
        '<h2>3. Projetos</h2>' + tabela(['Projeto', 'Score técnico', 'Situação'], projs.map(function (p) { var s = scoreProjeto(p); return [(p.codigo || '') + ' ' + (p.titulo || ''), s.score + '/100', s.faixa]; })) +
        '<h2>4. Dispêndios elegíveis</h2>' + tabela(['Rubrica', 'Valor'], Object.keys(calc.porRubrica).map(function (k) { return [RUBRICAS[k] ? RUBRICAS[k].nome : k, fmt(calc.porRubrica[k])]; }).concat([['Total', fmt(calc.dispendios)]])) +
        '<h2>5. Cálculo do benefício</h2>' + tabela(['Item', 'Valor'], [['Percentual de exclusão', r2(calc.percentual * 100) + '%'], ['Exclusão adicional', fmt(calc.exclusao + calc.exclusaoPatente)], ['Aproveitada no IRPJ', fmt(calc.aproveitadaIRPJ)], ['Aproveitada na CSLL', fmt(calc.aproveitadaCSLL)], ['Excedente perdido (IRPJ)', fmt(calc.perdidaIRPJ)], ['Economia estimada', fmt(calc.economia)]]) +
        '<h2>6. Conclusão</h2><p><b>' + h(el.rotulo) + '.</b> ' + h(el.motivos.map(function (m) { return m.texto; }).join(' ')) + '</p><p>Score de confiança: ' + calc.confianca.score + '/100 — ' + h(calc.confianca.politica) + '.</p>' +
        '<p class="nota">Diagnóstico preliminar sujeito à revisão humana e à documentação comprobatória. Não constitui crédito reconhecido.</p>' + ass(['Responsável técnico-tributário', 'Contador']);
    } else if (id === 'evidencias') {
      corpo = '<h2>Projeto</h2><p>' + h((proj.codigo || '') + ' — ' + (proj.titulo || '')) + '</p><h2>Evidências por critério</h2>' +
        tabela(['Critério', 'Atendido', 'Evidência'], CRITERIOS.map(function (c) { return [c.rotulo, (proj.criterios || {})[c.id] ? 'Sim' : 'Não', ((proj.evidenciasPorCriterio || {})[c.id]) || '']; })) +
        '<h2>Documentos de suporte</h2>' + tabela(['Tipo', 'Referência'], despProj(proj.id).filter(function (d) { return d.doc && (d.doc.chave || d.doc.numero); }).map(function (d) { return [RUBRICAS[d.rubrica] ? RUBRICAS[d.rubrica].nome : d.rubrica, (d.doc.numero || '') + ' ' + (d.doc.chave || '')]; })) + ass(['Responsável técnico']);
    } else if (id === 'termo') {
      corpo = '<p>Declaramos, para os fins da Lei nº 11.196/2005, que as informações sobre projetos, equipe e dispêndios de pesquisa e desenvolvimento do ano-calendário ' + h(ano) + ' são verdadeiras, que os dispêndios estão registrados em contas e centros de custo próprios, que não houve dupla contagem com subvenções ou outros incentivos e que a documentação comprobatória ficará disponível pelo prazo legal.</p>' +
        '<p>Reconhecemos que o Reversa Tax gera rascunhos e cálculos de apoio e que a responsabilidade pelo envio do FORMP&D e pela escrituração é da empresa e de seus responsáveis técnicos e contábeis.</p>' + ass(['Representante legal', 'Contador (CRC)', 'Responsável técnico']);
    } else if (id === 'checklist') {
      var f = formpd(caso, calc);
      corpo = tabela(['Item', 'Situação'], f.checklist.map(function (c) { return [c[0], c[1] ? 'OK' : 'Pendente']; }).concat(ETAPAS.map(function (et) { var r = (caso.revisoes || []).filter(function (x) { return x.etapa === et.id; }).slice(-1)[0]; return ['Revisão: ' + et.nome, r ? (r.decisao === 'aprovar' ? 'Aprovada por ' + r.nome + ' em ' + dataBR(r.em) : 'Reprovada: ' + (r.observacao || '')) : 'Pendente']; }))) +
        '<h2>Pendências</h2>' + tabela(['Nível', 'Área', 'Descrição'], pendencias(caso, calc).map(function (p) { return [p.nivel, p.area, p.texto]; })) + ass(['Auditor / revisor']);
    } else if (id === 'retroativo') {
      var r = retroativo(caso.retroativo || []);
      corpo = '<h2>Anos analisados</h2>' + tabela(['Ano', 'Regime', 'Exclusão', 'Aproveitada IRPJ', 'Crédito estimado', 'Risco', 'Ação'], r.map(function (x) { return [x.ano, x.formaTribTexto || x.regime, fmt(x.exclusao || 0), fmt(x.aproveitadaIRPJ || 0), fmt(x.credito), x.risco, x.acao]; })) +
        '<h2>Total estimado</h2><p>' + fmt(r.reduce(function (s, x) { return s + (x.credito || 0); }, 0)) + '</p><h2>Ações necessárias</h2><p>Retificar a ECF incluindo a exclusão no e-Lalur/e-Lacs (Parte A), recalcular IRPJ/CSLL e, havendo pagamento a maior, transmitir PER/DCOMP. Retificar a ECD antes, se a segregação contábil exigir (a retificação da ECD pode exigir nova ECF).</p>' +
        '<p class="nota">Estimativa preliminar. Exige revisão de contador e advogado; não constitui crédito reconhecido.</p>' + ass(['Contador', 'Advogado tributarista', 'Diretor']);
    } else if (id === 'contrato') {
      corpo = '<p><b>CONTRATANTE:</b> ' + h(e.nome || '[RAZÃO SOCIAL]') + ', CNPJ ' + h(cnpjFmt(e.cnpj)) + '. <b>CONTRATADA:</b> [razão social], CNPJ [__.___.___/____-__].</p>' +
        '<h2>Cláusula 1 — Objeto</h2><p>Prestação de serviços técnicos de pesquisa e desenvolvimento no projeto ' + h((proj.codigo || '') + ' ' + (proj.titulo || '[projeto]')) + ', com o escopo técnico detalhado no Anexo I.</p>' +
        '<h2>Cláusula 2 — Entregáveis e aceite</h2><p>A cada entrega, a CONTRATADA emitirá relatório técnico e a CONTRATANTE emitirá termo de aceite. A nota fiscal descreverá o serviço de forma específica, com referência ao projeto.</p>' +
        '<h2>Cláusula 3 — Preço e pagamento</h2><p>[valor, forma e condições].</p><h2>Cláusula 4 — Propriedade intelectual</h2><p>[titularidade dos resultados, patentes e software].</p>' +
        '<h2>Cláusula 5 — Confidencialidade e LGPD</h2><p>[obrigações de sigilo e tratamento de dados pessoais].</p><h2>Cláusula 6 — Vigência</h2><p>[início e término].</p>' + ass(['CONTRATANTE', 'CONTRATADA', 'Testemunha', 'Testemunha']);
    } else if (id === 'timesheet') {
      var pp = (caso.pessoas || []).filter(function (x) { return x.id === opc.pessoaId; })[0] || (caso.pessoas || [])[0] || {};
      var dias = []; for (var i = 1; i <= 31; i++) dias.push([String(i).padStart(2, '0'), '', '', '', '']);
      corpo = '<p><b>Colaborador:</b> ' + h(pp.nome || '[nome]') + ' · <b>CPF:</b> ' + h(mascaraCpf(pp.cpf || '')) + ' · <b>Cargo:</b> ' + h(pp.cargo || '') + ' · <b>Mês:</b> ____/' + h(ano) + '</p>' +
        tabela(['Dia', 'Projeto', 'Atividade técnica', 'Horas P&D', 'Horas outras'], dias) + ass(['Colaborador', 'Gestor do projeto']);
    } else if (id === 'naodupla') {
      corpo = '<p>Declaramos que os dispêndios de pesquisa e desenvolvimento informados para o ano-calendário ' + h(ano) + ', no total de ' + fmt(calc.dispendios) + ', não foram computados em duplicidade, não foram custeados por subvenção econômica ou recursos não reembolsáveis e não foram aproveitados em outro incentivo fiscal, nos termos da Lei nº 11.196/2005.</p>' +
        tabela(['Rubrica', 'Valor declarado'], Object.keys(calc.porRubrica).map(function (k) { return [RUBRICAS[k] ? RUBRICAS[k].nome : k, fmt(calc.porRubrica[k])]; })) + ass(['Representante legal', 'Contador (CRC)']);
    }
    return { titulo: titulo, html: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + h(titulo) + '</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#0E2239;max-width:820px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.5}' +
      'h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #DCE3EA;padding-bottom:3px}.sub{color:#5A6878;margin:0 0 14px}.id{background:#F5F7F9;padding:8px 10px;border-left:3px solid #1E8F88}' +
      'table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #DCE3EA;padding:5px 7px;text-align:left;vertical-align:top}th{background:#F5F7F9}' +
      '.ass{display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:40px}.ass span{display:block;border-top:1px solid #0E2239;margin-bottom:4px}.nota{color:#5A6878;font-size:12px}' +
      '@media print{body{margin:0}}</style></head><body><h1>' + h(titulo) + '</h1><p class="sub">Lei nº 11.196/2005 — Lei do Bem · Reversa Tax · uma ferramenta Argus Prime</p>' + cab + corpo + '</body></html>' };
  }

  var api = {
    VERSAO: VERSAO, PARAMETROS: PARAMETROS, FONTES: FONTES, RUBRICAS: RUBRICAS, CRITERIOS: CRITERIOS, ETAPAS: ETAPAS, MODELOS: MODELOS, NAO_ELEGIVEIS: NAO_ELEGIVEIS,
    TIPO_PESQUISA: TIPO_PESQUISA, FORMA_TRIB: FORMA_TRIB,
    identificarArquivo: identificarArquivo, parseECF: parseECF, parseECD: parseECD, parseFolha: parseFolha, parseNFe: parseNFe, parseNFSe: parseNFSe,
    classificarPessoa: classificarPessoa, cpfValido: cpfValido, scoreProjeto: scoreProjeto, validarDespesas: validarDespesas, calcular: calcular,
    elegibilidade: elegibilidade, confianca: confianca, pendencias: pendencias, formpd: formpd, csv: csv, retroativo: retroativo, documento: documento,
    irpjDevido: irpjDevido, num: num, r2: r2, fmt: fmt, cnpjFmt: cnpjFmt, dataBR: dataBR, mascaraCpf: mascaraCpf, uid: uid, regimeDaForma: regimeDaForma
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeiDoBem = api;
})(typeof window !== 'undefined' ? window : this);
