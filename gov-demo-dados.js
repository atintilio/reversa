// Reversa Gov: gerador DETERMINÍSTICO de notas fiscais SIMULADAS para a Demonstração.
// Tudo aqui é fictício: emitentes, CNPJs (com dígito verificador propositalmente inválido), chaves e valores.
// Seed fixa e só operações aritméticas básicas (sem Math.exp/log), para os números serem sempre os mesmos em qualquer navegador.
// Valores monetários em CENTAVOS (inteiros). Expõe window.GovDemo.
(function () {
  'use strict';

  var AVISO = 'DADOS SIMULADOS PARA DEMONSTRAÇÃO. Notas, emitentes e valores são fictícios.';
  var MUNICIPIO = 'Prefeitura Municipal de Tupaciguara/MG (exemplo)';
  var SEED = 20260611;
  var ALVO_TOTAL = 200000000; // R$ 2.000.000,00 de potencial de IRRF (soma das diferenças)
  var ANOS = [2021, 2022, 2023, 2024, 2025];
  var QTD_ANO = { 2021: 330, 2022: 350, 2023: 365, 2024: 380, 2025: 375 }; // 1.800 notas
  var ALVO_ANO = { 2021: 36000000, 2022: 38000000, 2023: 40000000, 2024: 42000000, 2025: 44000000 }; // soma = 200000000
  var ALIQ = { servico: 0.048, bem: 0.012 };
  var ALIQ_INSS = 0.11;

  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  (function () {
    var C = window.GovDemoCfg; if (!C) return;
    SEED = C.seed; ALVO_TOTAL = C.alvoIrrf; MUNICIPIO = 'Prefeitura Municipal de ' + C.nome;
    var s = ALVO_TOTAL / 200000000, pesos = [0.18, 0.19, 0.20, 0.21, 0.22], tot = 0;
    ANOS.forEach(function (a, k) { QTD_ANO[a] = Math.max(15, Math.round(QTD_ANO[a] * s)); ALVO_ANO[a] = Math.round(ALVO_TOTAL * pesos[k] / 100) * 100; tot += ALVO_ANO[a]; });
    ALVO_ANO[2025] += ALVO_TOTAL - tot;
  })();
  var R = rng(SEED);
  function inteiro(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function digitos(w) { var s = ''; for (var q = 0; q < w; q++) s += Math.floor(R() * 10); return s; }
  function escolhe(arr) { return arr[Math.floor(R() * arr.length)]; }

  // ---------- naturezas ----------
  // lo/hi em reais; valor = lo + (hi - lo) * u^3 (concentra nos valores menores, com cauda de notas grandes)
  var NAT = {
    manut_veic: { nome: 'Manutenção e conservação de veículos', tipo: 'servico', elem: '3.3.90.39', inss: false, lo: 900, hi: 19000 },
    manut_pred: { nome: 'Manutenção predial e reparos', tipo: 'servico', elem: '3.3.90.39', inss: true, lo: 1500, hi: 32000 },
    consult: { nome: 'Consultoria e assessoria técnica', tipo: 'servico', elem: '3.3.90.39', inss: false, lo: 2500, hi: 38000 },
    limpeza: { nome: 'Limpeza e conservação (mão de obra)', tipo: 'servico', elem: '3.3.90.39', inss: true, lo: 6000, hi: 46000 },
    vigil: { nome: 'Vigilância e portaria', tipo: 'servico', elem: '3.3.90.39', inss: true, lo: 7000, hi: 52000 },
    loc_veic: { nome: 'Locação de veículos', tipo: 'servico', elem: '3.3.90.39', inss: false, lo: 3000, hi: 30000 },
    loc_equip: { nome: 'Locação de equipamentos', tipo: 'servico', elem: '3.3.90.39', inss: false, lo: 1200, hi: 15000 },
    grafico: { nome: 'Serviços gráficos e de comunicação', tipo: 'servico', elem: '3.3.90.39', inss: false, lo: 800, hi: 12000 },
    ti: { nome: 'Serviços de tecnologia da informação', tipo: 'servico', elem: '3.3.90.40', inss: false, lo: 2000, hi: 34000 },
    expediente: { nome: 'Material de consumo (expediente)', tipo: 'bem', elem: '3.3.90.30', inss: false, lo: 400, hi: 9000 },
    limp_mat: { nome: 'Material de limpeza e higiene', tipo: 'bem', elem: '3.3.90.30', inss: false, lo: 500, hi: 8000 },
    pecas: { nome: 'Peças e acessórios para a frota', tipo: 'bem', elem: '3.3.90.30', inss: false, lo: 600, hi: 14000 },
    equip: { nome: 'Equipamentos e material permanente', tipo: 'bem', elem: '4.4.90.52', inss: false, lo: 3500, hi: 60000 }
  };
  var CATEGORIAS = [
    { nome: 'Manutenção Exemplo', nats: ['manut_veic', 'manut_pred'] },
    { nome: 'Consultoria Exemplo', nats: ['consult', 'ti'] },
    { nome: 'Limpeza Exemplo', nats: ['limpeza'] },
    { nome: 'Segurança Exemplo', nats: ['vigil'] },
    { nome: 'Locações Exemplo', nats: ['loc_veic', 'loc_equip'] },
    { nome: 'Gráfica Exemplo', nats: ['grafico'] },
    { nome: 'Comércio Exemplo', nats: ['expediente', 'limp_mat'] },
    { nome: 'Distribuidora Exemplo', nats: ['pecas', 'expediente'] },
    { nome: 'Equipamentos Exemplo', nats: ['equip'] },
    { nome: 'Tecnologia Exemplo', nats: ['ti', 'consult'] }
  ];
  var LETRAS = ['Alfa', 'Beta', 'Gama', 'Delta', 'Ômega', 'Sigma', 'Kappa', 'Lambda', 'Zeta', 'Épsilon', 'Teta', 'Íota', 'Mu', 'Ni', 'Ômicron'];
  var SUFIXOS = ['Ltda', 'Ltda', 'Ltda', 'ME', 'EIRELI', 'S.A.'];

  // CNPJ fictício: raiz iniciada em 9, filial 0001 e dígito verificador propositalmente ERRADO (nunca é um CNPJ válido).
  function dvCnpj(base12) {
    var p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], j, s = 0, d1, d2;
    for (j = 0; j < 12; j++) s += +base12[j] * p1[j];
    d1 = s % 11 < 2 ? 0 : 11 - (s % 11);
    var b13 = base12 + d1; s = 0;
    for (j = 0; j < 13; j++) s += +b13[j] * p2[j];
    d2 = s % 11 < 2 ? 0 : 11 - (s % 11);
    return [d1, d2];
  }
  function cnpjFicticio() {
    var base = '9' + digitos(7) + '0001', d = dvCnpj(base);
    return base + ((d[0] + 1) % 10) + d[1]; // 1º dígito deslocado: inválido de propósito
  }

  // ---------- fornecedores ----------
  var usados = {}, FORN = [], pesoTotal = 0;
  while (FORN.length < 56) {
    var cat = escolhe(CATEGORIAS), letra = escolhe(LETRAS), nome = cat.nome + ' ' + letra;
    if (usados[nome]) continue;
    usados[nome] = 1;
    var rp = R(), perfil = rp < 0.40 ? 'bom' : rp < 0.75 ? 'misto' : 'ruim';
    var simples = R() < 0.26;
    var peso = 1 / Math.pow(FORN.length + 1.6, 0.9) * (0.7 + R() * 0.6);
    pesoTotal += peso;
    FORN.push({ razao: nome + ' ' + escolhe(SUFIXOS), cnpj: cnpjFicticio(), regime: simples ? 'Simples' : 'Normal', perfil: perfil, nats: cat.nats, peso: peso, seq: inteiro(20, 900) });
  }
  var acum = 0;
  FORN.forEach(function (f) { acum += f.peso / pesoTotal; f.acum = acum; });
  function sorteiaForn() { var u = R(); for (var j = 0; j < FORN.length; j++) if (u <= FORN[j].acum) return FORN[j]; return FORN[FORN.length - 1]; }

  // ---------- situações ----------
  var PERFIL = {
    bom: [['OK', 0.86], ['C', 0.06], ['D', 0.06], ['E', 0.02]],
    misto: [['OK', 0.60], ['C', 0.12], ['D', 0.18], ['E', 0.10]],
    ruim: [['OK', 0.22], ['C', 0.12], ['D', 0.30], ['E', 0.36]]
  };
  function sorteiaSit(perfil) { var u = R(), a = 0, t = PERFIL[perfil]; for (var j = 0; j < t.length; j++) { a += t[j][1]; if (u <= a) return t[j][0]; } return 'OK'; }

  var COR = {
    verde: { id: 'verde', nome: 'Verde', cls: 'ok', texto: 'Retenção, repasse e prova consistentes. Pode ser apresentada ao município.' },
    amarelo: { id: 'amarelo', nome: 'Amarelo', cls: 'warn', texto: 'Depende de prova. Só entra na proposta depois de conferir os documentos listados em "O que falta provar".' },
    vermelho: { id: 'vermelho', nome: 'Vermelho', cls: 'bad', texto: 'Sem retenção comprovada. Não oferecer sem nova análise documental e jurídica.' }
  };
  var LEGAL_IRRF = 'IN RFB 1.234/2012 (retenção de IRRF por órgãos públicos). Receita do município: CF, art. 158, I.';
  var LEGAL_INSS = 'Lei 8.212/91, art. 31 (retenção de 11% na cessão de mão de obra). Regra a confirmar.';
  var FALTA = {
    S: ['Nenhuma pendência relevante para o IRRF. Rotina: conferir o enquadramento no Simples Nacional na data do pagamento.'],
    OK: ['Nenhuma pendência: retenção, registro da receita e prova estão consistentes.'],
    C: ['Revisão jurídica do enquadramento da natureza do serviço no anexo da IN (rotina).'],
    D: ['Extrato do razão com o registro da receita de IRRF retido.', 'Nota de empenho e liquidação mostrando o desconto efetivamente aplicado.', 'Ordem de pagamento com o valor líquido.'],
    E: ['Ordem de pagamento que comprove o pagamento sem desconto de IRRF.', 'Declaração ou enquadramento do fornecedor (Simples, imunidade, isenção).', 'Conferir se a natureza está no campo de incidência da IN 1.234/2012.']
  };
  var MOTIVO = {
    S: 'Fornecedor optante pelo Simples Nacional: sem IRRF a reter nesta regra de triagem.',
    OK: 'IRRF retido igual ao devido. Sem diferença.',
    Cs: 'Retenção feita com alíquota de bens (1,2%) sobre um serviço (4,8%). Retido a menor.',
    Cb: 'Retenção parcial: o valor retido é metade do devido.',
    D: 'Retenção lançada a menor e registro da receita ainda não conferido.',
    E: 'Nenhuma retenção de IRRF lançada neste pagamento.'
  };

  // ---------- notas brutas ----------
  var DIA = 86400000;
  function dataIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  var brutas = [];
  ANOS.forEach(function (ano) {
    for (var q = 0; q < QTD_ANO[ano]; q++) {
      var f = sorteiaForn(), natId = escolhe(f.nats), nat = NAT[natId];
      var u = R(), bruto0 = Math.round((nat.lo + (nat.hi - nat.lo) * u * u * u) * 100);
      var sit = f.regime === 'Simples' ? 'S' : sorteiaSit(f.perfil);
      var devRate = f.regime === 'Simples' ? 0 : ALIQ[nat.tipo], retRate = 0, motivo = MOTIVO[sit];
      if (sit === 'OK') retRate = devRate;
      else if (sit === 'C') { if (nat.tipo === 'servico') { retRate = ALIQ.bem; motivo = MOTIVO.Cs; } else { retRate = devRate * 0.5; motivo = MOTIVO.Cb; } }
      else if (sit === 'D') retRate = devRate * escolhe([0.25, 0.5, 0.75]);
      var pagoFrac = R() < 0.08 ? (85 + Math.floor(R() * 14)) / 100 : 1;
      // INSS (cessão de mão de obra): regra a confirmar; fornecedor do Simples fica de fora
      var inssAplica = nat.inss && f.regime !== 'Simples', inssRet = 0;
      if (inssAplica) { var ui = R(); inssRet = ui < 0.80 ? 1 : ui < 0.90 ? 0 : 0.5; }
      var emis = Date.UTC(ano, 0, 1) + Math.floor(R() * 365) * DIA;
      var pag = Math.min(emis + inteiro(5, 35) * DIA, Date.UTC(ano, 11, 31));
      var liq = Math.max(emis, pag - inteiro(2, 12) * DIA);
      var emp = emis - inteiro(6, 70) * DIA;
      var modelo = null, tipo;
      if (nat.tipo === 'servico') { tipo = R() < 0.92 ? 'NFS-e' : 'NF-e'; modelo = tipo === 'NF-e' ? 55 : null; }
      else { tipo = 'NF-e'; modelo = (natId === 'expediente' || natId === 'limp_mat') && R() < 0.15 ? 65 : 55; }
      var fonte = escolhe(['Recursos ordinários (livres)', 'Recursos ordinários (livres)', 'FUNDEB', 'Transferências de saúde', 'Transferências da União']);
      var cNF = digitos(8), cod = '';
      for (var c = 0; c < 8; c++) cod += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(R() * 32));
      brutas.push({
        ano: ano, f: f, nat: nat, bruto0: bruto0, bruto: bruto0, sit: sit, devRate: devRate, retRate: retRate, motivo: motivo, pagoFrac: pagoFrac,
        inssAplica: inssAplica, inssRet: inssRet, emis: emis, pag: pag, liq: liq, emp: emp, modelo: modelo, tipo: tipo, fonte: fonte, cNF: cNF,
        cod: cod.slice(0, 4) + '-' + cod.slice(4), evid: R(), ajuste: 0
      });
    }
  });
  brutas.sort(function (a, b) { return a.emis - b.emis || (a.f.cnpj < b.f.cnpj ? -1 : 1); });

  function calcula(n) {
    n.pago = Math.round(n.bruto * n.pagoFrac);
    n.devido = Math.round(n.pago * n.devRate);
    n.retido = Math.round(n.pago * n.retRate) + n.ajuste;
    n.diff = n.devido - n.retido;
    n.inssDevido = n.inssAplica ? Math.round(n.pago * ALIQ_INSS) : 0;
    n.inssRetido = n.inssAplica ? Math.round(n.inssDevido * n.inssRet) : 0;
    n.inssDiff = n.inssDevido - n.inssRetido;
  }
  // calibra por ano: escala os valores para o potencial do ano e fecha o centavo numa nota amarela
  ANOS.forEach(function (ano) {
    var g = brutas.filter(function (n) { return n.ano === ano; }), soma = 0;
    g.forEach(function (n) { calcula(n); soma += n.diff; });
    var fator = ALVO_ANO[ano] / soma;
    soma = 0;
    g.forEach(function (n) { n.bruto = Math.round(n.bruto0 * fator); calcula(n); soma += n.diff; });
    var delta = soma - ALVO_ANO[ano], alvo = null;
    for (var j = g.length - 1; j >= 0; j--) if (g[j].sit === 'D' && g[j].diff > 20000) { alvo = g[j]; break; }
    if (!alvo) { g.forEach(function (n) { if (!alvo || n.diff > alvo.diff) alvo = n; }); }
    alvo.ajuste += delta; calcula(alvo);
  });

  // ---------- notas finais ----------
  var contNum = {};
  function dvChave(c43) {
    var s = 0, p = 2;
    for (var j = 42; j >= 0; j--) { s += +c43[j] * p; p = p === 9 ? 2 : p + 1; }
    var r = s % 11; return r < 2 ? 0 : 11 - r;
  }
  var NOTAS = brutas.map(function (n, idx) {
    var f = n.f, d = new Date(n.emis);
    contNum[f.cnpj] = (contNum[f.cnpj] || f.seq) + inteiro(1, 18);
    var numero = contNum[f.cnpj], chave, chaveTipo;
    var aamm = String(d.getUTCFullYear()).slice(2) + pad(d.getUTCMonth() + 1, 2);
    if (n.tipo === 'NF-e') {
      var c43 = '31' + aamm + f.cnpj + pad(n.modelo, 2) + '001' + pad(numero, 9) + '1' + n.cNF;
      chave = c43 + dvChave(c43); chaveTipo = 'chave44';
    } else { chave = 'NFS-e ' + pad(numero, 6) + ' · cód. ' + n.cod; chaveTipo = 'codigo'; }
    var cor = n.sit === 'D' ? 'amarelo' : n.sit === 'E' ? 'vermelho' : 'verde';
    var evid = n.sit === 'E' ? 'estimada' : n.sit === 'D' ? (n.evid < 0.2 ? 'documentada' : 'estimada') : 'documentada';
    var anoN = String(d.getUTCFullYear());
    return {
      id: idx + 1, ano: n.ano, chave: chave, chaveTipo: chaveTipo, tipo: n.tipo, modelo: n.modelo, numero: numero,
      emissao: dataIso(n.emis),
      emitente: { razao: f.razao, cnpj: f.cnpj, regime: f.regime },
      natureza: n.nat.nome, naturezaTipo: n.nat.tipo, elemento: n.nat.elem,
      empenho: { numero: pad(inteiro(1, 2400), 4) + '/' + String(new Date(n.emp).getUTCFullYear()), data: dataIso(n.emp) },
      liquidacao: { numero: 'LQ-' + pad(inteiro(1, 3200), 6) + '/' + anoN, data: dataIso(n.liq) },
      pagamento: { numero: 'OP-' + pad(inteiro(1, 3500), 6) + '/' + anoN, data: dataIso(n.pag), fonte: n.fonte },
      valorBruto: n.bruto, valorPago: n.pago,
      regime: f.regime, aliquota: n.devRate, baseLegal: LEGAL_IRRF,
      irrfDevido: n.devido, irrfRetido: n.retido, diferenca: n.diff,
      inssAplica: n.inssAplica, inssAliquota: ALIQ_INSS, inssDevido: n.inssDevido, inssRetido: n.inssRetido, inssDiferenca: n.inssDiff,
      baseLegalInss: n.inssAplica ? LEGAL_INSS : null,
      situacao: n.sit, motivo: n.motivo, evidencia: evid, cor: cor, corTexto: COR[cor].texto,
      faltaProvar: FALTA[n.sit]
    };
  });

  // ---------- agregações ----------
  function somar(lista) {
    var t = { n: 0, comDiferenca: 0, pago: 0, devido: 0, retido: 0, diferenca: 0, inssDevido: 0, inssRetido: 0, inssDiferenca: 0 };
    lista.forEach(function (n) {
      t.n++; if (n.diferenca > 0) t.comDiferenca++;
      t.pago += n.valorPago; t.devido += n.irrfDevido; t.retido += n.irrfRetido; t.diferenca += n.diferenca;
      t.inssDevido += n.inssDevido; t.inssRetido += n.inssRetido; t.inssDiferenca += n.inssDiferenca;
    });
    return t;
  }
  window.GovDemo = {
    AVISO: AVISO, MUNICIPIO: MUNICIPIO, MUNICIPIO_CNPJ: '99000000000100', ALVO: ALVO_TOTAL, ANOS: ANOS, COR: COR, SEED: SEED,
    notas: NOTAS,
    totais: function (lista) { return somar(lista || NOTAS); },
    porAno: function () { return ANOS.map(function (a) { var t = somar(NOTAS.filter(function (n) { return n.ano === a; })); t.ano = a; return t; }); },
    porCor: function () { return ['verde', 'amarelo', 'vermelho'].map(function (c) { var t = somar(NOTAS.filter(function (n) { return n.cor === c; })); t.cor = c; return t; }); },
    porFornecedor: function () {
      var m = {};
      NOTAS.forEach(function (n) {
        var e = m[n.emitente.cnpj] || (m[n.emitente.cnpj] = { cnpj: n.emitente.cnpj, razao: n.emitente.razao, regime: n.emitente.regime, n: 0, comDiferenca: 0, pago: 0, diferenca: 0 });
        e.n++; if (n.diferenca > 0) e.comDiferenca++; e.pago += n.valorPago; e.diferenca += n.diferenca;
      });
      return Object.keys(m).map(function (c) { return m[c]; }).sort(function (a, b) { return b.diferenca - a.diferenca; });
    }
  };
})();
