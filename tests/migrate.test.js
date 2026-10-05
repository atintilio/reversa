// OPS-002: registro de migrations com checksum e idempotência.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plan, splitStatements } = require('../scripts/migrate');
const { createDb, ROOT } = require('./helpers');

test('plan aplica só o pendente e recusa migration alterada', () => {
  const files = fs.readdirSync(path.join(ROOT, 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(plan(new Map(), files).length, files.length);
  const applied = new Map(plan(new Map(), files).map((p) => [p.file, p.checksum]));
  assert.equal(plan(applied, files).length, 0);
  applied.set(files[0], 'checksum-antigo');
  assert.throws(() => plan(applied, files), /MIGRATION_CHECKSUM_MISMATCH/);
});

test('migrations são idempotentes (reexecução não falha)', async () => {
  const { db } = await createDb();
  for (const file of fs.readdirSync(path.join(ROOT, 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    for (const s of splitStatements(fs.readFileSync(path.join(ROOT, 'db', 'migrations', file), 'utf8'))) {
      if (/^(\s*--[^\n]*\n)*\s*create extension/i.test(s)) continue;
      await db.exec(s);
    }
  }
});
