// Motor de cálculo do Reversa Gov — ponto de entrada. Versão registrada em cada cálculo auditado.
const util = require('./util');
const parametros = require('./parametros');
const irrf = require('./irrf');
const previdenciaria = require('./previdenciaria');
const diagnostico = require('./diagnostico');
const VERSAO = '1.0.0';
module.exports = { VERSAO, util, parametros, irrf, previdenciaria, diagnostico };
