// Preenche tab_pessoa.categoria_id (convênio padrão do paciente, novos/83) a partir do
// histórico de atendimentos (tab_agendamento.categoria_id) de cada paciente — reaproveita
// o que já foi escolhido no agendamento em vez de pedir pro usuário recadastrar na mão.
//
// Dois casos:
// - Unânime (um único categoria_id em todos os agendamentos do paciente): usa essa.
// - Ambíguo (mais de uma categoria no histórico): usa a categoria do agendamento MAIS
//   RECENTE (maior data_hora_inicio) — decisão do Fernando em 2026-11-10, assumindo que o
//   convênio mais atual é o que vale pra frente, mesmo que não seja o mais frequente.
//
// Ignora: agendamentos CANCELADO, agendamentos sem categoria_id, e pacientes que já têm
// categoria_id preenchido em tab_pessoa (não sobrescreve escolha manual feita na tela).
//
// Por padrão roda em DRY-RUN (só mostra o que mudaria, não escreve nada).
// Rodar de verdade: node scripts/backfill_categoria_paciente.js <database> --aplicar

const path = require('path')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true })

const DB_NAME = process.argv[2] || 'hiitcor'
const APLICAR = process.argv.includes('--aplicar')

async function main() {
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: DB_NAME,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows } = await client.query(`
      SELECT p.id AS paciente_id, p.nome, p.categoria_id AS categoria_atual,
             ag.categoria_id AS categoria_ag, cat.descricao AS categoria_descricao,
             COUNT(*) AS qtd, MAX(ag.data_hora_inicio) AS ultima
      FROM tab_pessoa p
      JOIN tab_agendamento ag ON ag.paciente_id = p.id
      LEFT JOIN tab_categoria cat ON cat.id = ag.categoria_id
      WHERE p.ind_paciente = true
        AND ag.status <> 'CANCELADO'
        AND ag.categoria_id IS NOT NULL
      GROUP BY p.id, p.nome, p.categoria_id, ag.categoria_id, cat.descricao
      ORDER BY p.id, qtd DESC
    `)

    const porPaciente = new Map()
    for (const r of rows) {
      if (!porPaciente.has(r.paciente_id)) {
        porPaciente.set(r.paciente_id, {
          nome: r.nome,
          categoria_atual: r.categoria_atual,
          linhas: [],
        })
      }
      porPaciente.get(r.paciente_id).linhas.push({
        categoria_id: r.categoria_ag,
        descricao: r.categoria_descricao,
        qtd: Number(r.qtd),
        ultima: r.ultima,
      })
    }

    const jaPreenchidos = []
    const unanimes = []
    const ambiguos = []

    for (const [pacienteId, info] of porPaciente) {
      if (info.categoria_atual != null) {
        jaPreenchidos.push({ pacienteId, nome: info.nome })
        continue
      }
      const distintas = new Set(info.linhas.map(l => l.categoria_id))
      if (distintas.size === 1) {
        unanimes.push({
          pacienteId,
          nome: info.nome,
          categoria_id: info.linhas[0].categoria_id,
          categoria_descricao: info.linhas[0].descricao,
          qtd: info.linhas[0].qtd,
        })
      } else {
        const maisRecente = info.linhas.reduce((a, b) => new Date(b.ultima) > new Date(a.ultima) ? b : a)
        ambiguos.push({
          pacienteId,
          nome: info.nome,
          linhas: info.linhas,
          categoria_id: maisRecente.categoria_id,
          categoria_descricao: maisRecente.descricao,
          ultima: maisRecente.ultima,
        })
      }
    }

    const aAplicar = [...unanimes, ...ambiguos]

    console.log(`[${APLICAR ? 'APLICANDO' : 'DRY-RUN'}] base "${DB_NAME}"`)
    console.log(`Pacientes com atendimento categorizado: ${porPaciente.size}`)
    console.log(`  já tinham categoria_id preenchido (ignorados): ${jaPreenchidos.length}`)
    console.log(`  unânimes (uma só categoria no histórico): ${unanimes.length}`)
    console.log(`  ambíguos (resolvidos pelo atendimento mais recente): ${ambiguos.length}`)

    if (ambiguos.length) {
      console.log('\n--- AMBÍGUOS (categoria escolhida = mais recente) ---')
      for (const a of ambiguos) {
        const detalhe = a.linhas
          .sort((x, y) => y.qtd - x.qtd)
          .map(l => `${l.descricao ?? `#${l.categoria_id}`} (${l.qtd}x, última ${new Date(l.ultima).toLocaleDateString('pt-BR')})`)
          .join(' | ')
        console.log(`  paciente#${a.pacienteId} ${a.nome}: ${detalhe}  =>  ESCOLHIDA: ${a.categoria_descricao ?? `#${a.categoria_id}`}`)
      }
    }

    console.log('\n--- UNÂNIMES ---')
    for (const u of unanimes) {
      console.log(`  paciente#${u.pacienteId} ${u.nome}: -> ${u.categoria_descricao ?? `#${u.categoria_id}`} (${u.qtd}x)`)
    }

    if (!APLICAR) {
      await client.query('ROLLBACK')
      console.log(`\nDRY-RUN: nada foi gravado. Rode de novo com --aplicar para efetivar os ${aAplicar.length} pacientes.`)
      return
    }

    for (const u of aAplicar) {
      await client.query(
        `UPDATE tab_pessoa SET categoria_id = $1, updated_at = NOW() WHERE id = $2`,
        [u.categoria_id, u.pacienteId],
      )
      await client.query(
        `INSERT INTO tab_log_auditoria (empresa_id, usuario_id, usuario_nome, tabela, registro_id, acao, dados_antes, dados_depois)
         SELECT empresa_id, NULL, 'script:backfill_categoria_paciente', 'tab_pessoa', id, 'UPDATE', $2, $3
         FROM tab_pessoa WHERE id = $1`,
        [u.pacienteId, JSON.stringify({ categoria_id: null }), JSON.stringify({ categoria_id: u.categoria_id })],
      )
    }

    await client.query('COMMIT')
    console.log(`\n[OK] ${aAplicar.length} pacientes atualizados e auditados em tab_log_auditoria.`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error('[ERRO]', err.message); process.exit(1) })
