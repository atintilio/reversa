// Copia TODOS os dados de um Postgres de origem (ex.: Neon) para o Postgres de destino (ex.: VPS).
// - A ORIGEM e so lida (transacao somente-leitura, com foto consistente). Nada e alterado nela.
// - O DESTINO e esvaziado e recarregado (so com --confirmar). O esquema (tabelas) tem de existir: rode "npm run migrate" antes.
// - Nunca imprime dados nem a senha das conexoes; so nomes de tabela e contagens.
// Uso:  ORIGEM_URL=... DESTINO_URL=... node scripts/copiar-banco.js [--confirmar]
// Sem --confirmar, apenas confere e mostra o que seria copiado (ensaio seguro).
const postgres = require('postgres');
const { pipeline } = require('node:stream/promises');

const q = (name) => '"' + String(name).replace(/"/g, '""') + '"';

// Ordena tabelas para que as referenciadas (chave estrangeira) venham antes das que as referenciam.
function ordenar(tabelas, dependencias) {
  const falta = new Map(tabelas.map((t) => [t, new Set()]));
  for (const { filha, mae } of dependencias) if (filha !== mae && falta.has(filha) && falta.has(mae)) falta.get(filha).add(mae);
  const ordem = [];
  while (falta.size) {
    const livres = [...falta.entries()].filter(([, d]) => d.size === 0).map(([t]) => t).sort();
    if (!livres.length) throw new Error('Dependencia circular entre tabelas: ' + [...falta.keys()].join(', '));
    for (const t of livres) { ordem.push(t); falta.delete(t); }
    for (const d of falta.values()) for (const t of livres) d.delete(t);
  }
  return ordem;
}

async function listarTabelas(sql) {
  const rows = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`;
  return rows.map((r) => r.table_name);
}

async function main() {
  const origemUrl = process.env.ORIGEM_URL;
  const destinoUrl = process.env.DESTINO_URL;
  const confirmar = process.argv.includes('--confirmar');
  if (!origemUrl || !destinoUrl) throw new Error('Defina ORIGEM_URL e DESTINO_URL');
  if (origemUrl === destinoUrl) throw new Error('Origem e destino sao a mesma conexao');
  const sslOrigem = process.env.ORIGEM_SSL === 'off' ? false : 'require';
  const sslDestino = process.env.DESTINO_SSL === 'require' ? 'require' : false;
  const origem = postgres(origemUrl, { max: 1, ssl: sslOrigem, onnotice: () => {}, connection: { default_transaction_read_only: 'on' } });
  const destino = postgres(destinoUrl, { max: 1, ssl: sslDestino, onnotice: () => {} });
  let falhou = false;
  try {
    const tOrigem = await listarTabelas(origem);
    const tDestino = await listarTabelas(destino);
    // Tabelas que existem so na origem NAO sao do Reversa (ex.: outro app no mesmo banco): ficam de fora, intactas na origem.
    const semNoDestino = tOrigem.filter((t) => !tDestino.includes(t));
    if (semNoDestino.length) console.log('Aviso: tabelas so da origem, NAO serao copiadas (nao fazem parte do Reversa): ' + semNoDestino.join(', '));
    const tCopiar = tOrigem.filter((t) => tDestino.includes(t));
    const extrasDestino = tDestino.filter((t) => !tOrigem.includes(t));
    if (extrasDestino.length) console.log('Aviso: tabelas so do destino (serao esvaziadas): ' + extrasDestino.join(', '));
    const vOrigem = (await origem`select version from schema_migrations order by 1`).map((r) => r.version);
    const vDestino = (await destino`select version from schema_migrations order by 1`).map((r) => r.version);
    const dif = vOrigem.filter((v) => !vDestino.includes(v));
    if (dif.length) throw new Error('A origem tem migracoes que o destino nao tem: ' + dif.join(', '));

    const deps = await destino`select c.conrelid::regclass::text as filha, c.confrelid::regclass::text as mae
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'f' and n.nspname = 'public'`;
    const limpa = (s) => s.replace(/^"?public"?\./, '').replace(/^"(.*)"$/, '$1');
    const ordem = ordenar(tCopiar, deps.map((d) => ({ filha: limpa(d.filha), mae: limpa(d.mae) })));

    if (!confirmar) {
      console.log('ENSAIO (nada foi alterado). Tabelas a copiar, em ordem:');
      for (const t of ordem) { const [{ n }] = await origem`select count(*)::int as n from ${origem(t)}`; console.log(`  ${t}: ${n} linhas na origem`); }
      console.log('Para copiar de verdade, rode de novo com --confirmar.');
      return;
    }

    await origem.begin('isolation level repeatable read read only', async (src) => {
      await destino.begin(async (dst) => {
        await dst.unsafe(`truncate table ${ordem.map(q).join(', ')}${extrasDestino.length ? ', ' + extrasDestino.map(q).join(', ') : ''} restart identity cascade`);
        for (const t of ordem) {
          const leitura = await src.unsafe(`copy ${q(t)} to stdout`).readable();
          const escrita = await dst.unsafe(`copy ${q(t)} from stdin`).writable();
          await pipeline(leitura, escrita);
        }
        const seqs = await dst`select table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) as seq
          from information_schema.columns where table_schema = 'public' and column_default like 'nextval(%'`;
        for (const s of seqs) if (s.seq) await dst.unsafe(`select setval('${s.seq}', coalesce((select max(${q(s.column_name)}) from ${q(s.table_name)}), 1), (select count(*) > 0 from ${q(s.table_name)}))`);
      });
    });

    console.log('Conferencia (origem x destino):');
    for (const t of ordem) {
      const [{ n: a }] = await origem`select count(*)::int as n from ${origem(t)}`;
      const [{ n: b }] = await destino`select count(*)::int as n from ${destino(t)}`;
      const ok = a === b; if (!ok) falhou = true;
      console.log(`  ${ok ? 'OK  ' : 'DIFERE'} ${t}: ${a} x ${b}`);
    }
    console.log(falhou ? 'RESULTADO: HA DIFERENCAS' : 'RESULTADO: TUDO IGUAL');
  } finally {
    await origem.end({ timeout: 5 }); await destino.end({ timeout: 5 });
  }
  if (falhou) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error('ERRO: ' + e.message); process.exitCode = 1; });
module.exports = { ordenar };
