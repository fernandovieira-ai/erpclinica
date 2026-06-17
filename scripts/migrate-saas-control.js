/**
 * migrate-saas-control.js
 * Migra o banco saas_control do schema antigo (ERP v1) para o novo (Financeiro).
 * Preserva os dados existentes (admins, instâncias).
 * 
 * Uso: node scripts/migrate-saas-control.js
 */
const { Pool } = require('pg')
const fs       = require('fs')
const path     = require('path')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'saas_control',
  ssl:      false,
})

const ROOT = path.join(__dirname, '..')

async function run() {
  const client = await pool.connect()
  try {
    // ── 1. Captura dados existentes ──────────────────────────────────────
    process.stdout.write('Lendo dados existentes... ')

    const { rows: admins } = await client.query(
      `SELECT nome, email, senha_hash, ativo FROM tab_saas_admin`
    )

    // Mapeia db_name → database_name e nome → nome_cliente
    let instancias = []
    try {
      const { rows } = await client.query(
        `SELECT slug, COALESCE(db_name, '') AS database_name,
                COALESCE(nome, slug) AS nome_cliente,
                NULL::VARCHAR AS cnpj, email_contato, telefone, dominio,
                plano, status, trial_ate,
                COALESCE(limite_empresas, 3) AS max_empresas,
                COALESCE(limite_usuarios, 10) AS max_usuarios,
                obs
         FROM tab_instancia`
      )
      instancias = rows
    } catch {
      // Tenta se já estiver no schema novo
      const { rows } = await client.query(
        `SELECT slug, database_name, nome_cliente,
                cnpj, email_contato, telefone, dominio,
                plano, status, trial_ate,
                max_empresas, max_usuarios, obs
         FROM tab_instancia`
      )
      instancias = rows
    }

    console.log(`OK (${admins.length} admin(s), ${instancias.length} instância(s))`)

    // ── 2. Dropa tudo ────────────────────────────────────────────────────
    process.stdout.write('Removendo schema antigo... ')
    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        -- Remove extensões legadas primeiro
        DROP EXTENSION IF EXISTS pgcrypto CASCADE;
        DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
        DROP EXTENSION IF EXISTS unaccent CASCADE;
        -- Views
        FOR r IN (SELECT table_name FROM information_schema.views
                  WHERE table_schema = 'public') LOOP
          EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE';
        END LOOP;
        -- Tabelas
        FOR r IN (SELECT tablename FROM pg_tables
                  WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        -- Funções (com assinatura completa para evitar ambiguidade)
        FOR r IN (
          SELECT p.oid::regprocedure::text AS full_sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
        ) LOOP
          EXECUTE 'DROP FUNCTION IF EXISTS ' || r.full_sig || ' CASCADE';
        END LOOP;
      END;
      $$;
    `)
    console.log('OK')

    // ── 3. Executa o novo schema ─────────────────────────────────────────
    process.stdout.write('Criando novo schema (00_saas_control.sql)... ')
    const sql = fs.readFileSync(path.join(ROOT, '00_saas_control.sql'), 'latin1')
    await client.query(sql)
    console.log('OK')

    // ── 4. Reinsere admins ───────────────────────────────────────────────
    process.stdout.write(`Reinserindo ${admins.length} admin(s)... `)
    for (const a of admins) {
      await client.query(
        `INSERT INTO tab_saas_admin (nome, email, senha_hash, ativo)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           nome       = EXCLUDED.nome,
           senha_hash = EXCLUDED.senha_hash,
           ativo      = EXCLUDED.ativo`,
        [a.nome, a.email, a.senha_hash, a.ativo]
      )
    }
    console.log('OK')

    // ── 5. Reinsere instâncias ───────────────────────────────────────────
    process.stdout.write(`Reinserindo ${instancias.length} instância(s)... `)
    for (const i of instancias) {
      // Normaliza plano para valores válidos do novo schema
      let plano = (i.plano || 'basico').toLowerCase()
      if (!['basico', 'profissional', 'enterprise'].includes(plano)) plano = 'basico'

      // Normaliza status
      let status = (i.status || 'ativo').toLowerCase()
      if (!['ativo', 'suspenso', 'cancelado', 'trial'].includes(status)) status = 'ativo'

      await client.query(
        `INSERT INTO tab_instancia
           (slug, database_name, nome_cliente, cnpj, email_contato, telefone,
            dominio, plano, status, trial_ate, max_empresas, max_usuarios, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (slug) DO UPDATE SET
           database_name = EXCLUDED.database_name,
           nome_cliente  = EXCLUDED.nome_cliente,
           cnpj          = EXCLUDED.cnpj,
           email_contato = EXCLUDED.email_contato,
           telefone      = EXCLUDED.telefone,
           dominio       = EXCLUDED.dominio,
           plano         = EXCLUDED.plano,
           status        = EXCLUDED.status,
           trial_ate     = EXCLUDED.trial_ate,
           max_empresas  = EXCLUDED.max_empresas,
           max_usuarios  = EXCLUDED.max_usuarios,
           obs           = EXCLUDED.obs`,
        [
          i.slug, i.database_name, i.nome_cliente,
          i.cnpj || null, i.email_contato || null, i.telefone || null,
          i.dominio || null, plano, status,
          i.trial_ate || null,
          i.max_empresas || 3, i.max_usuarios || 10,
          i.obs || null
        ]
      )
    }
    console.log('OK')

    // ── 6. Resultado ─────────────────────────────────────────────────────
    const { rows: tabelas } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    )

    console.log('\n✅ saas_control migrado com sucesso.')
    console.log(`\nObjetos (${tabelas.length}):`)
    tabelas.forEach(r => console.log(' ', r.table_name))

    // Mostra instâncias atuais
    const { rows: inst } = await client.query(
      `SELECT id, slug, database_name, nome_cliente, plano, status FROM tab_instancia ORDER BY id`
    )
    console.log('\nInstâncias:')
    inst.forEach(r =>
      console.log(`  [${r.id}] ${r.slug} → ${r.database_name} | ${r.nome_cliente} | ${r.plano} | ${r.status}`)
    )

  } catch (err) {
    console.error('\n❌ ERRO:', err.message)
    if (err.detail)   console.error('   Detail:', err.detail)
    if (err.position) console.error('   Position:', err.position)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
}

run()
