// Driver Postgres comum (VPS): paridade com o comportamento do driver da Neon nos pontos que o código usa.
const test = require('node:test');
const assert = require('node:assert/strict');

test('usePg: Neon mantém o driver serverless; outro host usa Postgres comum; DB_DRIVER força', () => {
  const { usePg } = require('../lib/db');
  const antes = process.env.DB_DRIVER; delete process.env.DB_DRIVER;
  try {
    assert.equal(usePg('postgres://u:p@ep-x-123.sa-east-1.aws.neon.tech/neondb?sslmode=require'), false);
    assert.equal(usePg('postgres://u:p@db:5432/reversa'), true);
    assert.equal(usePg('postgres://u:p@127.0.0.1:5432/reversa'), true);
    process.env.DB_DRIVER = 'neon'; assert.equal(usePg('postgres://u:p@db:5432/reversa'), false);
    process.env.DB_DRIVER = 'pg'; assert.equal(usePg('postgres://u:p@x.neon.tech/n'), true);
  } finally { if (antes === undefined) delete process.env.DB_DRIVER; else process.env.DB_DRIVER = antes; }
});

test('driver pg grava JSON como objeto (sem codificar em dobro) e faz merge com ||', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const db = new PGlite();
  await db.exec("create table t (id serial primary key, meta jsonb default '{}'::jsonb)");
  const server = new PGLiteSocketServer({ db, port: 5547, host: '127.0.0.1' });
  await server.start();
  const salvo = { url: process.env.POSTGRES_URL, drv: process.env.DB_DRIVER };
  process.env.POSTGRES_URL = 'postgres://postgres:postgres@127.0.0.1:5547/postgres'; process.env.DB_DRIVER = 'pg';
  const dbmod = require('../lib/db'); dbmod.setSqlForTests(null);
  const sql = dbmod.getSql();
  try {
    const [a] = await sql`insert into t (meta) values (${JSON.stringify({ a: 1 })}::jsonb) returning meta, jsonb_typeof(meta) as tipo`;
    assert.equal(a.tipo, 'object'); assert.deepEqual(a.meta, { a: 1 });
    await sql`update t set meta = meta || ${JSON.stringify({ b: 2 })}::jsonb`;
    const [b] = await sql`select meta from t`;
    assert.deepEqual(b.meta, { a: 1, b: 2 });
    const rows = await sql`select 1 as ok`;
    assert.equal(rows[0].ok, 1); assert.ok(Array.isArray(rows));
  } finally {
    await sql.end({ timeout: 1 }); await server.stop(); await db.close();
    if (salvo.url === undefined) delete process.env.POSTGRES_URL; else process.env.POSTGRES_URL = salvo.url;
    if (salvo.drv === undefined) delete process.env.DB_DRIVER; else process.env.DB_DRIVER = salvo.drv;
  }
});
