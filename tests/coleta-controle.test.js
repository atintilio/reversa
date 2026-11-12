// Esquema do banco de controle do módulo de coleta e-CAC (metadados apenas).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitStatements } = require('../scripts/migrate');

const FILE = path.join(__dirname, '..', 'coleta', 'db', '001_controle.sql');

async function novoDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  for (const s of splitStatements(fs.readFileSync(FILE, 'utf8'))) await db.exec(s);
  return db;
}
async function rejeita(p, re) {
  await assert.rejects(p, (e) => re.test(String(e.message)));
}
async function outorgante(db, doc = '12345678000195') {
  const r = await db.query("insert into outorgantes (tipo_documento, documento, nome) values ('cnpj',$1,'Cliente X') returning id", [doc]);
  return r.rows[0].id;
}

test('esquema aplica e é idempotente', async () => {
  const db = await novoDb();
  for (const s of splitStatements(fs.readFileSync(FILE, 'utf8'))) await db.exec(s);
});

test('documento do outorgante precisa ter dígitos no tamanho certo e ser único', async () => {
  const db = await novoDb();
  await rejeita(db.query("insert into outorgantes (tipo_documento, documento, nome) values ('cpf','123','x')"), /outorgantes_doc_fmt/);
  await outorgante(db);
  await rejeita(outorgante(db), /outorgantes_doc_uq/);
});

test('em_analise exige início e prazo de confirmação', async () => {
  const db = await novoDb();
  const o = await outorgante(db);
  await rejeita(db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status) values ($1,'cnpj','em_analise')", [o]), /autorizacoes_prazo_coerente/);
  await db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status, em_analise_desde, prazo_confirmacao) values ($1,'cnpj','em_analise', now(), now() + interval '30 days')", [o]);
});

test('ativa exige confirmação e validade de no máximo 5 anos', async () => {
  const db = await novoDb();
  const o = await outorgante(db);
  await rejeita(db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status) values ($1,'cnpj','ativa')", [o]), /autorizacoes_ativa_coerente/);
  await rejeita(db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status, confirmada_em, validade_ate) values ($1,'cnpj','ativa', now(), (current_date + interval '6 years')::date)", [o]), /autorizacoes_validade_max/);
  await db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status, confirmada_em, validade_ate) values ($1,'cnpj','ativa', now(), (current_date + interval '5 years')::date)", [o]);
});

test('status inválido é recusado', async () => {
  const db = await novoDb();
  const o = await outorgante(db);
  await rejeita(db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status) values ($1,'cnpj','qualquer')", [o]), /check/i);
});

test('só uma tarefa em execução por autorização', async () => {
  const db = await novoDb();
  const o = await outorgante(db);
  const a = (await db.query("insert into autorizacoes (outorgante_id, outorgado_tipo, status, confirmada_em, validade_ate) values ($1,'cnpj','ativa', now(), (current_date + interval '1 year')::date) returning id", [o])).rows[0].id;
  await db.query("insert into tarefas_coleta (autorizacao_id, tipo, estado) values ($1,'caixa_postal','em_execucao')", [a]);
  await rejeita(db.query("insert into tarefas_coleta (autorizacao_id, tipo, estado) values ($1,'dctfweb','em_execucao')", [a]), /tarefas_uma_em_execucao_uq/);
  await db.query("insert into tarefas_coleta (autorizacao_id, tipo, estado) values ($1,'dctfweb','pendente')", [a]);
});

test('auditoria é append-only', async () => {
  const db = await novoDb();
  await db.query("insert into auditoria (ator, acao) values ('sistema','teste')");
  await rejeita(db.query("update auditoria set acao='x'"), /AUDITORIA_IMUTAVEL/);
  await rejeita(db.query('delete from auditoria'), /AUDITORIA_IMUTAVEL/);
});
