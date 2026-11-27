// Preparação do banco na VPS. Exige ambiente explicitamente autorizado para alterar dados.
const { execSync } = require('node:child_process');
const env = process.env.REVERSA_DEPLOY_ENV;
if (env !== 'production') {
  console.log(`build: ambiente ${env} — migrations/seed/bootstrap ignorados (banco de produção protegido)`);
  process.exit(0);
}
for (const step of ['migrate', 'seed:opportunities', 'bootstrap:owner']) {
  execSync(`npm run ${step}`, { stdio: 'inherit' });
}
