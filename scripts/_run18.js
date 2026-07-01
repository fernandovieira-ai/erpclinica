const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'cloud.digitalrf.com.br',
  port: 5433,
  user: 'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'hiitcor'
});

const sql = fs.readFileSync(
  path.join(__dirname, '../novos/18_add_profissao_altura_peso_pessoa.sql'),
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
