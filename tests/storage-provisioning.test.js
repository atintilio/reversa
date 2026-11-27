const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('script de storage da VPS tem sintaxe válida e caminho restrito', () => {
  const file = path.join(__dirname, '..', 'deploy', 'configura-storage.sh');
  execFileSync('bash', ['-n', file]);
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /REVERSA_DOCUMENT_ROOT=\/var\/lib\/reversa\/documents/);
  assert.match(source, /install -d -m 700/);
});
