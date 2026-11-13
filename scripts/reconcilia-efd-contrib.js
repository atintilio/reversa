// Reconcilia o catálogo da EFD-Contribuições: o PDF oficial (Guia Prático v1.35) manda em
// posição, tipo, tamanho e decimais; o nome do campo vem do PDF e, quando o PDF corta o nome
// (ou não o lê), é reparado pelo nome completo da base do python-sped ou pelo motor do Reversa.
//
// Regra: a base só repara o NOME quando o nome do PDF é prefixo do nome da base (ou o contrário).
// Onde os dois divergem de verdade (C100 com CHV_NFE duplicado, M210 no leiaute antigo),
// vale o PDF — e a divergência fica registrada no relatório.
//
// Uso: node scripts/reconcilia-efd-contrib.js
const fs = require('fs');
const vm = require('vm');
const D = 'lib/sped/leiautes/';

const bruto = JSON.parse(fs.readFileSync(D + '_extraidos/efd_contribuicoes.guia-1.35.json', 'utf8'));
const base = JSON.parse(fs.readFileSync(D + 'efd_contribuicoes.base.json', 'utf8'));

// Mapa de campos do motor do Reversa (motor-creditos.js), que usa os nomes que o PVA aceita.
function grab(file, re) {
  const s = fs.readFileSync(file, 'utf8'); const m = re.exec(s);
  if (!m) return null;
  let i = m.index + m[0].length - 1, d = 0, j = i;
  for (; j < s.length; j++) { if (s[j] === '{') d++; if (s[j] === '}') { d--; if (!d) break; } }
  return vm.runInNewContext('(' + s.slice(i, j + 1) + ')');
}
const L = grab('motor-creditos.js', /var L = \{/) || {};

// base: posição (1-based) -> nome
const basePos = {};
for (const [reg, r] of Object.entries(base.registros || {})) {
  const m = {};
  (r.campos || []).forEach((c, i) => { m[i + 1] = c.nome; });
  basePos[reg] = m;
}
// motor: índice 0-based (o primeiro campo é REG) -> nome
const motorPos = {};
for (const [reg, campos] of Object.entries(L)) {
  const m = {};
  Object.keys(campos).forEach((k) => { m[Number(k) + 1] = campos[k]; });
  motorPos[reg] = m;
}

const out = {};
const divergencias = [];
let reparadosPdf = 0, completoDoPdf = 0, totalCampos = 0;
const incompletosBase = [], reparosPorRegistro = [], deslocados = [];

for (const [reg, r] of Object.entries(bruto.registros)) {
  const b = basePos[reg] || {}, mo = motorPos[reg] || {};
  const porPos = new Map();
  const doPdf = [];   // posicoes que o PDF nao entregou (veio da base)
  const nomesReparados = [];
  // 1) campos lidos do PDF
  for (const c of r.campos) porPos.set(c.pos, Object.assign({}, c));

  // 2) posições que o PDF não entregou: entram com os dados da base (marcados)
  const maxBase = Math.max(0, ...Object.keys(b).map(Number));
  const maxPdf = Math.max(0, ...Array.from(porPos.keys()));
  const total = Math.max(maxBase, maxPdf);
  for (let p = 1; p <= total; p++) {
    if (porPos.has(p)) continue;
    if (b[p]) {
      porPos.set(p, { pos: p, nome: b[p], tipo: null, tam: null, tam_fixo: false, dec: null, obrig_bruto: '' });
      doPdf.push(p);
    }
  }

  const campos = [];
  const faltantes = [];
  // nomes da base/motor deste registro, para recuperar nome concatenado pelo PDF
  const refTodos = Object.assign({}, b, mo);
  for (let p = 1; p <= total; p++) {
    const c = porPos.get(p);
    if (!c) { faltantes.push(p); continue; }
    let nome = c.nome || '';
    const ref = mo[p] || b[p] || '';
    if (!nome) {
      if (ref) { nome = ref; reparadosPdf++; nomesReparados.push(reg + '.' + p + ' (vazio no PDF) = ' + nome); }
    } else if (ref && ref !== nome) {
      const sufixo = ref.lastIndexOf(nome);
      const prefixo = nome.indexOf(ref) === 0;
      if (ref.indexOf(nome) === 0 || prefixo || (sufixo >= 0 && sufixo === ref.length - nome.length)) {
        // o PDF cortou o nome (prefixo ou sufixo): vale o nome completo
        nome = ref;
        reparadosPdf++; nomesReparados.push(reg + '.' + p + ' = ' + nome);
      } else if (/^[CNDL]$/.test(nome)) {
        // artefato de leitura: sobrou a coluna Tipo
        nome = ref;
        reparadosPdf++; nomesReparados.push(reg + '.' + p + ' (artefato) = ' + nome);
      } else {
        // o PDF concatena o nome com o do campo seguinte: o nome do campo e o ultimo trecho
        const cauda = Object.keys(refTodos)
          .map((k) => refTodos[k])
          .filter((n) => n && n.length >= 3 && nome.length > n.length
            && nome.lastIndexOf(n) >= 0 && nome.lastIndexOf(n) === nome.length - n.length)
          .sort((a, b) => b.length - a.length)[0];
        if (cauda) {
          nome = cauda;
          reparadosPdf++; nomesReparados.push(reg + '.' + p + ' (concatenado) = ' + nome);
        } else if (b[p + 1] === nome || b[p - 1] === nome) {
          // leiaute do PDF tem um campo a mais (ou a menos) que a base: a base esta desatualizada
          deslocados.push(reg + '.' + p + ': PDF=' + nome + ' | base=' + ref + ' (base desatualizada: leiaute diferente)');
        } else {
          divergencias.push(reg + '.' + p + ': PDF=' + nome + ' | motor/base=' + ref);
        }
      }
    }
    campos.push({
      pos: p, nome: nome, tipo: c.tipo || null,
      tam: c.tam === null || c.tam === undefined ? null : c.tam,
      tam_fixo: Boolean(c.tam_fixo), dec: c.dec === null || c.dec === undefined ? null : c.dec,
      obrig_bruto: c.obrig_bruto || ''
    });
    totalCampos++;
  }

  const completo = !faltantes.length && campos.length > 0 && campos[0].nome === 'REG';
  if (completo) completoDoPdf++;
  out[reg] = { titulo: r.titulo, campos: campos, posicoes_faltantes: faltantes, completo: completo };
  if (doPdf.length) incompletosBase.push(reg + ': posicoes ' + doPdf.join(',') + ' vindas da base python-sped (tipo/tam/dec ausentes)');
  if (nomesReparados.length) reparosPorRegistro.push(reg + ' -> ' + nomesReparados.join('; '));
}

// registro que o PDF nao entregou mas o motor/base tem (checagem de cobertura)
const faltando = Object.keys(Object.assign({}, basePos, motorPos)).filter((reg) => !out[reg]);

const doc = {
  leiaute: 'efd_contribuicoes',
  fonte: 'Guia Prático da EFD Contribuições v1.35 (atualização 18/06/2021), Seção 3 – Leiaute dos Registros',
  sha256: bruto.sha256 || '',
  nomes: 'nomes cortados pelo PDF reparados com a base do python-sped e o motor do Reversa (só quando um é prefixo do outro)',
  validacao: '[VALIDAR] os registros com completo=false',
  registros: out
};
fs.writeFileSync(D + 'efd_contribuicoes.json', JSON.stringify(doc, null, 1));

console.log('registros: ' + Object.keys(out).length + ' | completos: ' + completoDoPdf + ' | campos: ' + totalCampos);
console.log('nomes reparados: ' + reparadosPdf + ' | divergencias de nome: ' + divergencias.length + ' | base desatualizada: ' + deslocados.length);
if (divergencias.length) { console.log('divergencias:'); divergencias.slice(0, 40).forEach((d) => console.log('  ' + d)); }
if (faltando.length) console.log('registros do motor/base ausentes no PDF: ' + faltando.join(', '));
const pendentes = Object.entries(out).filter(([, r]) => !r.completo).map(([k, r]) => k + ':' + JSON.stringify(r.posicoes_faltantes));
console.log('pendentes: ' + pendentes.join(' '));
console.log('--- posicoes vindas da base (sem tipo/tam/dec do PDF): ' + incompletosBase.length);
incompletosBase.forEach((x) => console.log('  ' + x));
fs.writeFileSync('lib/sped/leiautes/_extraidos/relatorio-reconciliacao-efd-contribuicoes.txt',
  'divergencias de nome (PDF x motor/base):\n' + (divergencias.join('\n') || '(nenhuma)') +
  '\n\nbase python-sped desatualizada (leiaute diferente do PDF oficial):\n' + (deslocados.join('\n') || '(nenhuma)') +
  '\n\nposicoes vindas da base python-sped:\n' + (incompletosBase.join('\n') || '(nenhuma)') +
  '\n\nnomes reparados:\n' + (reparosPorRegistro.join('\n') || '(nenhum)') + '\n');
console.log('relatorio: lib/sped/leiautes/_extraidos/relatorio-reconciliacao-efd-contribuicoes.txt');
