// Ponte para rotas com mais de um nível (/api/v1/crm/pipeline, /api/v1/leidobem/casos/:id...).
// Compatibilidade com clientes que enviam o caminho original em ?rvpath=.
module.exports = require('./[...route].js');
