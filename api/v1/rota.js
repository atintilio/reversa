// Ponte para rotas com mais de um nível (/api/v1/crm/pipeline, /api/v1/leidobem/casos/:id...).
// No Vercel sem Next.js, o arquivo [...route].js só atende um nível; o vercel.json reescreve os demais para cá
// com o caminho original em ?rvpath=, e o roteador único trata tudo igual.
module.exports = require('./[...route].js');
