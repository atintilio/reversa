const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
for (const file of walk(path.join(__dirname, '..'))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  console.log(`OK ${path.relative(path.join(__dirname, '..'), file)}`);
}
