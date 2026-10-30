// Confere o "Relatório de receitas por banco" (planilha legada .xls, layout
// "Relação de receitas por banco" — Dt. Venc. + Cliente/Fonte receita + Forma
// de pgto + Documento + Valor + Pg Sim/Não) contra a receita já lançada no
// sistema (tab_recebimento_consulta) no período do relatório, pra localizar
// diferenças de lançamento (valor errado, duplicado, faltando).
//
// Casa por CLIENTE normalizado (sem acento, maiúsculo) + soma por cliente,
// não lançamento a lançamento — porque um mesmo cliente pode ter vários
// atendimentos no período e a ordem/qtd de linhas pode não bater 1:1 entre
// relatório e sistema (mesmo quando o total por cliente bate).
//
// Uso:
//   node scripts/analisar_receitas_banco.js "<caminho do .xls>" <db_name> [--ini YYYY-MM-DD] [--fim YYYY-MM-DD]

const path = require('path')
const XLSX = require('xlsx')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const [, , ARQUIVO, DB_NAME] = process.argv
const argIni = pegarArg('--ini')
const argFim = pegarArg('--fim')

if (!ARQUIVO || !DB_NAME) {
  console.error('Uso: node scripts/analisar_receitas_banco.js "<arquivo.xls>" <db_name> [--ini YYYY-MM-DD] [--fim YYYY-MM-DD]')
  process.exit(1)
}

function pegarArg(nome) {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : null
}

function stripAcentos(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizarNome(nome) {
  return stripAcentos(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function ddmmyyyyParaIso(s) {
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// --------- 1) parse do .xls (layout "Relação de receitas por banco") ---------

function parseRelatorio(arquivo) {
  const wb = XLSX.readFile(arquivo)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })

  let periodoIni = null
  let periodoFim = null
  const headerPeriodo = rows.find((r) => typeof r[0] === 'string' && r[0].startsWith('Per'))
  if (headerPeriodo) {
    periodoIni = ddmmyyyyParaIso(headerPeriodo[2])
    periodoFim = ddmmyyyyParaIso(headerPeriodo[4])
  }

  const itens = []
  let dataAtual = null
  let clienteAtual = null
  let formaAtual = null

  for (const row of rows) {
    const c0 = row[0]
    const c1 = row[1]
    const c7 = row[7]
    const c8 = row[8]
    const c9 = row[9]

    if (typeof c0 === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(c0) && typeof c1 === 'string') {
      // linha de cabeçalho do lançamento: data de vencimento + cliente (+ forma de pgto, se já paga)
      dataAtual = ddmmyyyyParaIso(c0)
      clienteAtual = c1.trim()
      formaAtual = typeof c7 === 'string' ? c7 : null
      continue
    }

    if ((c0 === null || c0 === undefined) && typeof c1 === 'string' && typeof c7 === 'number' && clienteAtual) {
      // linha de valor: descrição do procedimento + valor + Pg (Sim/Não) + documento
      const descricao = c1.replace(/\d{8}\s*$/, '').trim()
      itens.push({
        data: dataAtual,
        cliente: clienteAtual,
        descricao,
        forma: formaAtual,
        valor: Math.round(c7 * 100) / 100,
        pago: c8 === 'Sim',
        documento: typeof c9 === 'string' ? c9 : null,
      })
      continue
    }

    if (typeof c0 === 'string' && c1 === undefined) {
      // "Total dd/mm/yyyy:", "Total <seção>:", "Total Geral:" ou cabeçalho de seção — ignora
      clienteAtual = null
      continue
    }
  }

  if (!periodoIni || !periodoFim) {
    const datas = itens.map((i) => i.data).filter(Boolean).sort()
    periodoIni = periodoIni || datas[0]
    periodoFim = periodoFim || datas[datas.length - 1]
  }

  return { itens, periodoIni, periodoFim }
}

// --------- 2) agrupamento por cliente normalizado ---------

function agruparPorCliente(itens, campoNome) {
  const grupos = new Map()
  for (const item of itens) {
    const chave = normalizarNome(item[campoNome])
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, nomeOriginal: item[campoNome], valor: 0, qtd: 0 })
    }
    const g = grupos.get(chave)
    g.valor = Math.round((g.valor + item.valor) * 100) / 100
    g.qtd += 1
  }
  return grupos
}

function casarGrupos(gruposRelatorio, gruposSistema) {
  const sistemaRestante = new Map(gruposSistema)
  const pares = []

  for (const [chave, grupo] of gruposRelatorio) {
    let match = null
    if (sistemaRestante.has(chave)) {
      match = sistemaRestante.get(chave)
    } else {
      for (const [chaveSis, grupoSis] of sistemaRestante) {
        if (chaveSis.includes(chave) || chave.includes(chaveSis)) {
          match = grupoSis
          break
        }
      }
    }
    if (match) {
      sistemaRestante.delete(match.chave)
      pares.push({ relatorio: grupo, sistema: match })
    } else {
      pares.push({ relatorio: grupo, sistema: null })
    }
  }

  for (const [, grupoSis] of sistemaRestante) {
    pares.push({ relatorio: null, sistema: grupoSis })
  }

  return pares
}

// --------- 3) main ---------

async function main() {
  const { itens, periodoIni, periodoFim } = parseRelatorio(ARQUIVO)
  const totalRelatorio = Math.round(itens.reduce((acc, i) => acc + i.valor, 0) * 100) / 100
  const totalPago = Math.round(itens.filter((i) => i.pago).reduce((acc, i) => acc + i.valor, 0) * 100) / 100
  const totalNaoPago = Math.round((totalRelatorio - totalPago) * 100) / 100

  const ini = argIni || periodoIni
  const fim = argFim || periodoFim

  console.log('='.repeat(78))
  console.log('ANÁLISE: relatório de receitas por banco x sistema (tab_recebimento_consulta)')
  console.log('='.repeat(78))
  console.log(`Arquivo: ${ARQUIVO}`)
  console.log(`Banco (db): ${DB_NAME} | Período analisado: ${ini} a ${fim}`)
  console.log(`Itens no relatório: ${itens.length} | Total relatório: ${totalRelatorio.toFixed(2)}`)
  console.log(`  - Pg=Sim (pago): ${itens.filter((i) => i.pago).length} itens, R$ ${totalPago.toFixed(2)}`)
  console.log(`  - Pg=Não (não pago): ${itens.filter((i) => !i.pago).length} itens, R$ ${totalNaoPago.toFixed(2)}`)

  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: DB_NAME,
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  })

  const client = await pool.connect()
  let recebimentos
  try {
    const r = await client.query(
      `SELECT rc.id, TO_CHAR(rc.data_recebimento,'YYYY-MM-DD') data_recebimento, pe.nome cliente, rc.total_recebimento valor
       FROM tab_recebimento_consulta rc
       JOIN tab_pessoa pe ON pe.id = rc.paciente_id
       WHERE rc.data_recebimento >= $1 AND rc.data_recebimento <= $2
       ORDER BY rc.data_recebimento, rc.id`,
      [ini, fim],
    )
    recebimentos = r.rows.map((row) => ({ ...row, valor: Number(row.valor) }))
  } finally {
    client.release()
    await pool.end()
  }

  const totalSistema = Math.round(recebimentos.reduce((acc, d) => acc + d.valor, 0) * 100) / 100

  console.log(`\nRecebimentos no sistema no período: ${recebimentos.length} | Total sistema: ${totalSistema.toFixed(2)}`)
  console.log(`Diferença (relatório - sistema): ${(totalRelatorio - totalSistema).toFixed(2)}`)
  console.log('')

  const gruposRelatorio = agruparPorCliente(itens, 'cliente')
  const gruposSistema = agruparPorCliente(recebimentos, 'cliente')
  const pares = casarGrupos(gruposRelatorio, gruposSistema)

  const diferencas = []
  const semMatch = []

  for (const { relatorio, sistema } of pares) {
    if (relatorio && sistema) {
      const diff = Math.round((relatorio.valor - sistema.valor) * 100) / 100
      if (Math.abs(diff) > 0.01) {
        diferencas.push({
          cliente: relatorio.nomeOriginal,
          qtd_relatorio: relatorio.qtd,
          qtd_sistema: sistema.qtd,
          valor_relatorio: relatorio.valor.toFixed(2),
          valor_sistema: sistema.valor.toFixed(2),
          diferenca: diff.toFixed(2),
        })
      }
    } else if (relatorio && !sistema) {
      semMatch.push({ origem: 'SÓ NO RELATÓRIO (faltando no sistema?)', cliente: relatorio.nomeOriginal, qtd: relatorio.qtd, valor: relatorio.valor.toFixed(2) })
    } else if (!relatorio && sistema) {
      semMatch.push({ origem: 'SÓ NO SISTEMA (sobrando / fora do relatório?)', cliente: sistema.nomeOriginal, qtd: sistema.qtd, valor: sistema.valor.toFixed(2) })
    }
  }

  if (diferencas.length) {
    console.log('--- Clientes com VALOR diferente entre relatório e sistema ---')
    console.table(diferencas)
  } else {
    console.log('Nenhum cliente com valor total diferente entre relatório e sistema.')
  }

  if (semMatch.length) {
    console.log('\n--- Sem correspondência clara (confira nome/alias manualmente) ---')
    console.table(semMatch)
  }
}

main().catch((err) => {
  console.error('ERRO:', err.message)
  process.exit(1)
})
