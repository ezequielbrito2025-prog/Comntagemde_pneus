/*
 * db.js — ponte opcional com um banco de dados Postgres (ex.: Supabase).
 * ------------------------------------------------------------------------
 * Esse arquivo só entra em ação se existir uma variável de ambiente chamada
 * DATABASE_URL (é o Render que entrega essa variável pro servidor, com o
 * valor que você copiou do Supabase — veja o guia PASSO-A-PASSO-RENDER-SUPABASE.txt).
 *
 * Se DATABASE_URL não existir (por exemplo, rodando no seu computador ou na
 * rede local, do jeito que sempre funcionou), este arquivo fica completamente
 * inativo e o server.js continua gravando os dados só no arquivo
 * dados/store.json, exatamente como antes — nada muda nesse caso.
 *
 * O banco guarda TODO o "estado" do sistema (almoxarifados, materiais,
 * movimentações, usuários, contagens) numa única linha, numa única coluna
 * do tipo "jsonb" (um JSON que o Postgres entende). Não criamos uma tabela
 * para cada tela porque o sistema já guardava tudo assim num único arquivo
 * JSON — trocar só o lugar onde esse JSON mora (arquivo -> banco) é a forma
 * mais simples e com menos risco de dar algo errado.
 */
'use strict';

var DATABASE_URL = process.env.DATABASE_URL || '';

var pool = null;
if (DATABASE_URL) {
  var Pool = require('pg').Pool;
  // Supabase (e a maioria dos bancos na internet) exige conexão criptografada
  // (SSL). Em compensação, não exigimos validar a "cadeia" do certificado
  // (rejectUnauthorized: false) porque isso costuma falhar em vários
  // provedores de hospedagem sem motivo real de segurança perdido — a conexão
  // continua sendo criptografada, só não confere o certificado contra uma
  // lista de autoridades. Se DATABASE_URL apontar para o próprio computador
  // (localhost), não usamos SSL, porque bancos locais normalmente não têm
  // certificado configurado.
  var isLocal = /@?(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 4, // o sistema roda como um único processo o tempo todo; não precisa de muitas conexões
    idleTimeoutMillis: 30000
  });
  pool.on('error', function (err) {
    // Uma conexão ociosa pode cair sozinha de vez em quando (o próprio
    // Postgres/Supabase fecha conexões paradas); isso é normal e o pool
    // abre outra na próxima consulta. Só avisamos no log, sem derrubar o
    // servidor por causa disso.
    console.error('[db] aviso: conexão com o banco caiu (' + err.message + '). O sistema continua funcionando.');
  });
}

function isEnabled() {
  return !!pool;
}

// Garante que a tabela exista. Chamado uma vez, na inicialização do servidor.
function init() {
  if (!pool) return Promise.resolve();
  return pool.query(
    'CREATE TABLE IF NOT EXISTS app_store (' +
    '  id text PRIMARY KEY,' +
    '  data jsonb NOT NULL,' +
    '  updated_at timestamptz NOT NULL DEFAULT now()' +
    ')'
  );
}

// Busca o estado salvo no banco. Retorna null se o banco estiver vazio
// (primeira vez que o sistema roda com esse banco) ou se db estiver desligado.
function fetchStore() {
  if (!pool) return Promise.resolve(null);
  return pool.query('SELECT data FROM app_store WHERE id = $1', ['main']).then(function (result) {
    if (result.rows.length === 0) return null;
    return result.rows[0].data;
  });
}

// Salva o estado inteiro no banco (substitui a linha "main" por completo).
// As chamadas são encadeadas (uma espera a anterior terminar antes de começar)
// para garantir que, se duas alterações acontecerem bem rápido uma atrás da
// outra, elas cheguem ao banco NA ORDEM CERTA — sem isso, a segunda poderia
// (em teoria) terminar antes da primeira e o banco ficaria com os dados
// desatualizados.
var writeChain = Promise.resolve();
function queueSave(storeObj) {
  if (!pool) return;
  writeChain = writeChain.then(function () {
    return pool.query(
      'INSERT INTO app_store (id, data, updated_at) VALUES ($1, $2, now()) ' +
      'ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()',
      ['main', storeObj]
    );
  }).catch(function (err) {
    // Nunca derruba o servidor por causa de um erro ao salvar no banco: o
    // arquivo local (dados/store.json) continua sendo a cópia de segurança
    // em disco, então nenhum dado real é perdido mesmo se o banco falhar
    // momentaneamente (ex.: internet instável). Só avisamos no log.
    console.error('[db] não consegui salvar no banco de dados agora (' + err.message + '). Os dados continuam seguros no arquivo local; a próxima alteração tenta salvar no banco de novo.');
  });
}

module.exports = { isEnabled: isEnabled, init: init, fetchStore: fetchStore, queueSave: queueSave };
