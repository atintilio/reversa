// Build do Vercel. Migrations, seed e bootstrap alteram o banco: rodam só no build de produção
// (ou fora do Vercel). Previews compilam sem tocar no banco — evita que um branch de teste altere a produção.
const { execSync } = require('node:child_process');
const env = process.env.VERCEL_ENV;
if (env && env !== 'production') {
  console.log(`build: ambiente ${env} — migrations/seed/bootstrap ignorados (banco de produção protegido)`);
  process.exit(0);
}
for (const step of ['migrate', 'seed:opportunities', 'bootstrap:owner']) {
  execSync(`npm run ${step}`, { stdio: 'inherit' });
}
