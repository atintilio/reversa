/*
 * Compara a tabela de campos escrita à mão no motor com o CATÁLOGO OFICIAL e mostra as
 * divergências (posição e nome). Onde o catálogo oficial diz uma coisa e o motor diz outra,
 * vale o catálogo (PDF oficial) — a lista sai aqui para conferência.
 *
 * Uso: node scripts/compara-leiautes.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'lib', 'sped', 'leiautes');

/** Extrai um objeto literal do código-fonte a partir de um marcador. */
function grab(file, startRe) {
  const s = fs.readFileSync(file, 'utf8');
  const m = startRe.exec(s);
  if (!m) return null;
  let i = m.index + m[0].length - 1, d = 0, j = i;
  for (; j < s.length; j++) {
    if (s[j] === '{') d++;
    if (s[j] === '}') { d--; if (!d) break; }
  }
  return vm.runInNewContext('(' + s.slice(i, j + 1) + ')');
}

/** Compara mapa {registro: {campo: posicao}} com o catálogo oficial {registros:{reg:{campos:[{pos,nome}]}}}. */
function compara(nome, mapa, catalogo) {
  let ok = 0, dif = [], ausentes = [];
  const regs = catalogo.registros || catalogo;
  for (const [reg, campos] of Object.entries(mapa || {})) {
    const c = regs[reg];
    if (!c) { ausentes.push(reg); continue; }
    const porPos = {};
    (c.campos || []).forEach(x => { porPos[x.pos] = x.nome; });
    // o catalogo oficial sempre inclui o campo 1 = REG; a tabela do motor nem sempre conta esse
    // campo. O offset e detectado pelo primeiro campo do registro: se ele corresponde ao REG do
    // catalogo, o motor conta com REG; se corresponde ao campo seguinte, conta sem REG.
    const nomes = Object.entries(campos).filter(x => typeof x[1] === 'number').sort((a, b) => a[1] - b[1]);
    if (!nomes.length) continue;
    const primeiro = nomes[0];
    const offset = porPos[primeiro[1]] === primeiro[0] ? 0 : 1;
    for (const [nomeCampo, pos] of nomes) {
      const posCat = pos + offset;
      if (porPos[posCat] === nomeCampo) ok++;
      else dif.push(`${reg}.${nomeCampo}@${pos} catalogo=${porPos[posCat] || '-'}`);
    }
  }
  console.log(`== ${nome}: ${ok} campos batem, ${dif.length} divergem, ${ausentes.length} registros ausentes no catalogo${ausentes.length ? ' (' + ausentes.join(',') + ')' : ''}`);
  dif.slice(0, 40).forEach(x => console.log('   ', x));
  return { ok, dif, ausentes };
}

const lContrib = grab(path.join(__dirname, '..', 'motor-creditos.js'), /var L_LEGADO = \{/);
if (lContrib) {
  compara('motor-creditos (tabela de reserva) x catalogo oficial EFD-Contribuicoes',
    lContrib, JSON.parse(fs.readFileSync(path.join(DIR, 'efd_contribuicoes.json'), 'utf8')));
}

const lIcms = grab(path.join(__dirname, '..', 'motor-efd-icms.js'), /var LEIAUTE_LEGADO = \{/);
if (lIcms) {
  const catIcms = JSON.parse(fs.readFileSync(path.join(DIR, 'efd_icms_ipi.json'), 'utf8'));
  // no motor do ICMS a reserva e uma lista de nomes por posicao (o catalogo oficial e pos -> nome)
  const comoMapa = {};
  Object.entries(lIcms).forEach(([reg, arr]) => {
    if (!Array.isArray(arr)) return;
    const m = {};
    arr.forEach((nome, i) => { m[nome] = i + 1; });
    comoMapa[reg] = m;
  });
  compara('motor-efd-icms (tabela de reserva) x catalogo oficial EFD ICMS/IPI', comoMapa, catIcms);
}
