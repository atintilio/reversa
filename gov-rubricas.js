// Reversa Gov: base jurídica das rubricas da folha (servidores vinculados ao RGPS).
// Catálogo informativo para análise da procuradoria. Não é parecer. A decisão sobre o que perseguir é do prefeito, com a procuradoria do município.
// Fontes: Lei 8.212/1991 (art. 22 e 28), súmulas e acórdãos do STJ e STF citados em cada linha. Conferir vigência antes de qualquer pedido.
(function () {
  'use strict';
  var T = {
    nao: ['Não integra a base', '#1A7F4B', 'Se foi recolhido, pode haver valor a recuperar'],
    inc: ['Integra a base', '#5B6B7C', 'Recolhimento devido; sem recuperação'],
    dis: ['Em disputa', '#C58A12', 'Só segue com prova e parecer jurídico'],
    cnf: ['Conferir', '#C58A12', 'Depende da norma local ou da natureza do pagamento'],
    fora: ['Fora do escopo', '#8A95A1', 'Não é RGPS (regime próprio) ou não é rubrica de folha']
  };
  // [grupo, rubrica, tratamento, base legal e precedente, observação, tese do motor (opcional)]
  var L = [
    ['Afastamentos e licenças', 'Salário-maternidade', 'nao', 'STF Tema 72 (RE 576.967); Lei 8.212/1991, art. 28, §2º', 'Só a cota patronal e o RAT. A contribuição do segurado continua devida. Até 2020 o STJ entendia o contrário.', 'T004'],
    ['Afastamentos e licenças', 'Remuneração dos 15 primeiros dias de afastamento (doença ou acidente)', 'nao', 'STJ REsp 1.230.957/RS (repetitivo); Lei 8.213/1991, art. 60, §3º', 'Vale para o que o ente paga nos 15 primeiros dias.', 'T006'],
    ['Afastamentos e licenças', 'Salário-paternidade', 'inc', 'STJ REsp 1.230.957/RS e REsp 1.358.281/SP (repetitivos)', 'Tem natureza de remuneração; o STJ afasta a tese de exclusão.'],
    ['Afastamentos e licenças', 'Faltas abonadas e atestados médicos', 'inc', 'STJ AgRg no REsp 1.476.604/RS', 'Dia pago ao servidor ausente integra a base.'],
    ['Afastamentos e licenças', 'Folgas não gozadas pagas em dinheiro', 'nao', 'STJ REsp 1.620.058/RS', 'Conferir se o pagamento tem natureza indenizatória.'],
    ['Afastamentos e licenças', 'Licença-prêmio não gozada, convertida em pecúnia', 'nao', 'STJ AgRg no AREsp 464.314/SC', 'Indenização por direito não usufruído. Não vale para a licença gozada.'],

    ['Férias e 13º salário', 'Férias gozadas', 'inc', 'STJ AgRg nos EAREsp 138.628/AC', 'Remuneração das férias integra a base.'],
    ['Férias e 13º salário', 'Terço constitucional de férias gozadas', 'inc', 'STF Tema 985 (RE 1.072.485); STJ 1ª Seção aplicou a tese em 2026', 'Antes se discutia a não incidência. Hoje a tese é desfavorável: não deve ser objeto de pedido.', 'T-FER'],
    ['Férias e 13º salário', 'Férias indenizadas e adicional de 1/3', 'nao', 'Lei 8.212/1991, art. 28, §9º, "d"; STJ REsp 1.598.509/RN', 'Distinguir de férias gozadas. Exige prova do que foi pago como indenização.', 'IND'],
    ['Férias e 13º salário', 'Abono pecuniário de férias (conversão de 1/3 das férias em dinheiro)', 'cnf', 'CLT, art. 143; Lei 8.212/1991, art. 28, §9º; julgados do STJ em sentido divergente', 'A lei o trata como verba que não integra a base, mas há julgado do STJ que aponta incidência. Não prometer: levar à procuradoria.'],
    ['Férias e 13º salário', '13º salário (gratificação natalina)', 'inc', 'Lei 8.212/1991, art. 28, §7º; STF Súmula 688', 'Contribuição própria, calculada separadamente da folha mensal.'],
    ['Férias e 13º salário', '13º proporcional', 'inc', 'STJ REsp 1.775.065/PR', 'Integra a base, inclusive o proporcional.'],

    ['Verbas rescisórias', 'Aviso-prévio indenizado', 'nao', 'STJ REsp 1.230.957/RS (repetitivo); Lei 8.212/1991, art. 28, §9º', 'Verba indenizatória. Não alcança o aviso trabalhado.', 'T005'],
    ['Verbas rescisórias', 'Reflexo do aviso-prévio indenizado no 13º salário', 'dis', 'Lei 8.212/1991, art. 28, §9º, "e", item 5; Lei 4.090/1962', 'Distinguir do aviso-prévio em si. Não apresentar como pacificada.', 'T076'],
    ['Verbas rescisórias', 'Multa de 40% do FGTS e indenização por dispensa sem justa causa', 'nao', 'Lei 8.212/1991, art. 28, §9º, "e"', 'Natureza indenizatória; conferir a rubrica usada na folha.'],
    ['Verbas rescisórias', 'Indenização por término antecipado de contrato por prazo determinado (CLT, arts. 479 e 480)', 'cnf', 'CLT, arts. 479 e 480; Lei 8.212/1991, art. 28, §9º', 'Relevante para temporários. Conferir o regime jurídico do contrato.'],
    ['Verbas rescisórias', 'Prêmio por dispensa incentivada (PDV)', 'nao', 'STJ REsp 712.185/RS', 'Conferir a lei local que criou o programa.'],

    ['Benefícios e auxílios', 'Vale-transporte (inclusive em dinheiro)', 'nao', 'STF RE 478.410; Lei 8.212/1991, art. 28, §9º, "f"', 'A prova é a folha analítica e a lei local.', 'VT'],
    ['Benefícios e auxílios', 'Auxílio-alimentação fornecido in natura (cesta, vale-refeição, PAT)', 'nao', 'STJ EREsp 603.509/CE; Lei 8.212/1991, art. 28, §9º, "c"', 'Vale também para o fornecimento por cartão alimentação conforme o PAT.'],
    ['Benefícios e auxílios', 'Auxílio-alimentação pago em dinheiro, de forma habitual', 'inc', 'STJ EREsp 603.509/CE', 'O STJ entende que, em dinheiro e habitual, integra a base. Conferir a lei local.'],
    ['Benefícios e auxílios', 'Auxílio-creche e auxílio-babá', 'nao', 'STJ Súmula 310; REsp 1.146.772/DF (repetitivo)', 'Respeitado o limite de idade previsto em lei.'],
    ['Benefícios e auxílios', 'Auxílio-educação', 'nao', 'STJ AgInt no AREsp 1.125.481/SP; Lei 8.212/1991, art. 28, §9º, "t"', 'Vale para educação básica ou cursos ligados à atividade, ofertado de forma geral.'],
    ['Benefícios e auxílios', 'Plano de saúde ou convênio médico', 'nao', 'Lei 8.212/1991, art. 28, §9º, "q"', 'Exige oferta a todos os servidores e dirigentes.'],
    ['Benefícios e auxílios', 'Seguro de vida em grupo', 'nao', 'STJ REsp 660.202/CE; Lei 8.212/1991, art. 28, §9º, "p"', 'Vale quando previsto em convenção, acordo ou lei, e oferecido a todos.'],
    ['Benefícios e auxílios', 'Auxílio-natalidade e auxílio-funeral', 'nao', 'STJ AgInt no REsp 1.586.690/DF', 'Pagamento eventual, sem caráter de contraprestação.'],
    ['Benefícios e auxílios', 'Salário-família', 'nao', 'Lei 8.212/1991, art. 28, §9º, "a"', 'Pago conforme a Lei 8.213/1991.'],

    ['Verbas de natureza remuneratória', 'Vencimento, salário-base e soldo', 'inc', 'Lei 8.212/1991, art. 28, I', 'Base principal da contribuição.'],
    ['Verbas de natureza remuneratória', 'Horas extras e seu adicional', 'inc', 'STJ REsp 1.358.281/SP (repetitivo)', 'Tese de não incidência foi rejeitada.'],
    ['Verbas de natureza remuneratória', 'Adicional noturno', 'inc', 'STJ REsp 1.358.281/SP (repetitivo)', 'Integra a base.'],
    ['Verbas de natureza remuneratória', 'Adicional de periculosidade', 'inc', 'STJ REsp 1.358.281/SP (repetitivo)', 'Integra a base.'],
    ['Verbas de natureza remuneratória', 'Adicional de insalubridade', 'inc', 'STJ AgRg no AREsp 69.958/DF', 'Integra a base.'],
    ['Verbas de natureza remuneratória', 'Adicional de transferência e de risco de vida', 'inc', 'STJ AgInt no REsp 1.587.782/PE; AgRg no REsp 1.487.979/SC', 'Integra a base.'],
    ['Verbas de natureza remuneratória', 'Adicional de sobreaviso', 'dis', 'STJ EDcl no AgRg no REsp 1.481.469/PR', 'Integra a base se habitual e remuneratório; confirmar o caso concreto.'],
    ['Verbas de natureza remuneratória', 'Gratificações e prêmios habituais (função, produtividade, desempenho)', 'inc', 'STJ EDcl no AgRg no REsp 1.481.469/PR', 'Integram a base se habituais. Pagamento eventual pode ficar de fora; conferir a lei local.'],
    ['Verbas de natureza remuneratória', 'Adicional por tempo de serviço (quinquênio, anuênio)', 'inc', 'Lei 8.212/1991, art. 28, I', 'Remuneração habitual por lei local.'],
    ['Verbas de natureza remuneratória', 'Repouso semanal remunerado (RSR)', 'inc', 'STJ REsp 1.775.065/PR', 'Integra a base.'],
    ['Verbas de natureza remuneratória', 'Abono de assiduidade', 'cnf', 'STJ REsp 1.580.842/SC e REsp 743.971/PR', 'O STJ afastou a incidência quando eventual e condicionado. Conferir a lei local.'],

    ['Reembolsos e indenizações', 'Diárias de viagem', 'cnf', 'Lei 8.212/1991, art. 28, §8º, "a"; STJ EDcl no AgRg no REsp 1.137.857/RS', 'Não integram até 50% da remuneração mensal; o excesso integra. Exige prestação de contas.'],
    ['Reembolsos e indenizações', 'Ajuda de custo por mudança de local (parcela única)', 'nao', 'Lei 8.212/1991, art. 28, §9º, "g"', 'Pagamento de parcela única, por mudança de sede.'],
    ['Reembolsos e indenizações', 'Ajuda de custo habitual ou compensação por deslocamento', 'inc', 'STJ REsp 610.866/MG', 'Se habitual, é tratada como gratificação.'],

    ['Agentes políticos e outros vínculos', 'Subsídio de prefeito, vice, secretários e vereadores', 'cnf', 'STF RE 351.717 (Lei 9.506/1997); Lei 10.887/2004; Lei 8.212/1991, art. 22, I e 12, I, "j"', 'Houve mudança de regime ao longo do tempo. Conferir o período; o prazo de 5 anos limita o que ainda é recuperável.'],
    ['Agentes políticos e outros vínculos', 'Cargo em comissão, contratados temporários e celetistas', 'inc', 'CF, art. 40, §13; Lei 8.213/1991, art. 11, I, "g"', 'São a base do Regime Geral. É o conjunto que entra no cálculo.'],
    ['Agentes políticos e outros vínculos', 'Pagamentos a autônomos (RPA) e contribuintes individuais', 'cnf', 'Lei 8.212/1991, art. 22, III', 'Contribuição patronal de 20% sobre o pagamento. Conferir enquadramento e retenções.'],
    ['Agentes políticos e outros vínculos', 'Bolsa de estágio', 'cnf', 'Lei 11.788/2008', 'Estagiário não é segurado empregado. Conferir o contrato.'],

    ['Fora do escopo (regime próprio)', 'Remuneração de servidores estatutários com regime próprio (RPPS)', 'fora', 'CF, art. 40; Lei 9.717/1998', 'O diagnóstico não cobre o RPPS.'],
    ['Fora do escopo (regime próprio)', 'Abono de permanência', 'fora', 'CF, art. 40, §19', 'Pertence ao regime próprio.'],
    ['Fora do escopo (regime próprio)', 'Contribuição a terceiros (Sistema S)', 'fora', 'Lei 8.212/1991, art. 94', 'Ente público não recolhe; o cálculo considera cota patronal e RAT.']
  ];
  var LISTA = L.map(function (r) { return { grupo: r[0], rubrica: r[1], t: r[2], base: r[3], nota: r[4], tese: r[5] || '' }; });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function contagem() { var c = {}; LISTA.forEach(function (r) { c[r.t] = (c[r.t] || 0) + 1; }); return c; }
  function tabela(filtro) {
    var grupo = '', h = '<div class="dp-wrap"><table class="gov-table dp-t rb-t"><thead><tr><th>Rubrica</th><th>Tratamento</th><th>Base legal e precedente</th><th>Observação</th></tr></thead><tbody>';
    LISTA.forEach(function (r) {
      if (filtro && filtro !== 'todos' && r.t !== filtro) return;
      if (r.grupo !== grupo) { grupo = r.grupo; h += '<tr class="rb-g"><td colspan="4">' + esc(grupo.toUpperCase()) + '</td></tr>'; }
      var c = T[r.t];
      h += '<tr data-t="' + r.t + '"><td><b>' + esc(r.rubrica) + '</b>' + (r.tese ? '<small>Tese ' + esc(r.tese) + '</small>' : '') + '</td><td><span class="dp-cl"><i style="background:' + c[1] + '"></i>' + esc(c[0]) + '</span><small>' + esc(c[2]) + '</small></td><td>' + esc(r.base) + '</td><td>' + esc(r.nota) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  var AVISO = 'Este catálogo reúne as rubricas da folha de servidores vinculados ao Regime Geral e o tratamento dado a cada uma na lei e na jurisprudência. É material de apoio, não é parecer. Quais rubricas perseguir é decisão do prefeito, junto com a procuradoria do município. A jurisprudência muda: conferir a vigência de cada precedente antes de qualquer pedido.';
  var CSS = '.rb-t .dp-cl{font-weight:700}.rb-t .dp-cl i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.rb-t .rb-g td{padding-top:14px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#16736D;background:#F5F7F9}.rb-t td small{display:block;color:#5B6B7C;margin-top:2px}.rb-f{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.rb-f button{border:1px solid #D5DCE3;background:#fff;border-radius:999px;padding:6px 12px;font:600 12.5px Manrope,Arial,sans-serif;cursor:pointer;color:#0E2239}.rb-f button.on{background:#0E2239;color:#fff;border-color:#0E2239}';
  window.GovRubricas = { LISTA: LISTA, T: T, tabela: tabela, contagem: contagem, AVISO: AVISO, CSS: CSS };
})();
