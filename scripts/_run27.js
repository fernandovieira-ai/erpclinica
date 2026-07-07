// Executa uma migration SQL avulsa contra o banco do cliente.
// Uso: node --env-file=.env.local scripts/_run27.js [arquivo.sql] [database]
// (o flag --env-file carrega as variáveis do .env.local sem precisar de dependência extra)
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const arquivoSql = process.argv[2] || '27_horario_chegada.sql';
const database   = process.argv[3] || process.env.DEV_DB_NAME || 'hiitcor';

for (const nome of ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD']) {
  if (!process.env[nome]) {
    console.error(`ERRO: variável de ambiente ${nome} não definida. Rode com --env-file=.env.local`);
    process.exit(1);
  }
}

const client = new Client({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database,
});

const sql = fs.readFileSync(
  path.join(__dirname, '../novos', arquivoSql),
  'utf8'
);

client.connect()
  .then(() => client.query(sql))
  .then(r => {
    console.log('OK:', r.command);
    return client.end();
  })
  .catch(e => {
    console.error('ERRO:', e.message);
    client.end();
    process.exit(1);
  });
