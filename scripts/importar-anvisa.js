/**
 * importar-anvisa.js
 * Importa medicamentos registrados da ANVISA para o PostgreSQL local.
 *
 * Pré-requisitos (executar uma vez):
 *   pnpm add -D playwright
 *   pnpm exec playwright install chromium
 *   node scripts/executar-sql.js novos/33_schema_anvisa.sql  (cria as tabelas)
 *
 * Uso:
 *   node scripts/importar-anvisa.js [--database hiitcor] [--batch 10] [--inicio 1] [--fim 104]
 *
 * Variáveis de ambiente (ou .env.local):
 *   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD
 */

'use strict'

const { Pool }    = require('pg')
const path        = require('path')
const fs          = require('fs')

// ── Carregar .env.local ──────────────────────────────────────────────────────
const envFile = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

// ── Playwright ───────────────────────────────────────────────────────────────
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('\n[ERRO] playwright nao instalado.')
  console.error('Execute:  pnpm add -D playwright && pnpm exec playwright install chromium\n')
  process.exit(1)
}

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function arg(name, def) {
  const i = argv.indexOf(`--${name}`)
  return i !== -1 ? argv[i + 1] : def
}

const DATABASE = arg('database', process.env.ANVISA_DATABASE || 'hiitcor')
const BATCH    = Number(arg('batch', '6'))   // paralelo dentro do page.evaluate
const PAG_INI  = Number(arg('inicio', '1'))
const PAG_FIM  = arg('fim', null)             // null = ate o fim
const POR_PAG  = 100

// ── DB ───────────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.PG_HOST     || 'cloud.digitalrf.com.br',
  port:     Number(process.env.PG_PORT || 5433),
  user:     process.env.PG_USER     || 'user_dba',
  password: process.env.PG_PASSWORD || '',
  database: DATABASE,
  ssl:      false,
  max:      12,
})

// ── Sanitizar texto para LATIN1 ─────────────────────────────────────────────
// O banco usa LATIN1 (ISO-8859-1). Caracteres fora desse range (ex: en-dash,
// simbolos gregos, emoji) causam erro de encoding no INSERT.
function lat(str) {
  if (str == null) return null
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\xFF]/g, '?')
}

// ── Upsert medicamento ────────────────────────────────────────────────────────
async function salvarMedicamento(client, d) {
  const empresa = d.empresa || {}
  const processo = d.processo || {}

  const classes = Array.isArray(d.classesTerapeuticas)
    ? d.classesTerapeuticas.filter(Boolean).join(', ')
    : (d.classesTerapeuticas || null)

  await client.query(
    `INSERT INTO tab_medicamento (
       codigo_produto, nome, principio_ativo, classe_terapeutica,
       categoria_regulatoria, numero_registro, processo, empresa, cnpj,
       codigo_bula_paciente, codigo_bula_profissional, existe_bula
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (codigo_produto) DO UPDATE SET
       nome                    = EXCLUDED.nome,
       principio_ativo         = EXCLUDED.principio_ativo,
       classe_terapeutica      = EXCLUDED.classe_terapeutica,
       categoria_regulatoria   = EXCLUDED.categoria_regulatoria,
       numero_registro         = EXCLUDED.numero_registro,
       processo                = EXCLUDED.processo,
       empresa                 = EXCLUDED.empresa,
       cnpj                    = EXCLUDED.cnpj,
       codigo_bula_paciente    = EXCLUDED.codigo_bula_paciente,
       codigo_bula_profissional= EXCLUDED.codigo_bula_profissional,
       existe_bula             = EXCLUDED.existe_bula,
       updated_at              = NOW()`,
    [
      String(d.codigoProduto),
      lat(d.nomeComercial || ''),
      lat(d.principioAtivo),
      lat(classes),
      lat(d.categoriaRegulatoria),
      lat(d.numeroRegistro),
      lat(processo.numero),
      lat(empresa.razaoSocial),
      lat(empresa.cnpj),
      lat(d.codigoBulaPaciente),
      lat(d.codigoBulaProfissional),
      Boolean(d.existeBula),
    ],
  )
}

// ── Upsert apresentacoes ──────────────────────────────────────────────────────
async function salvarApresentacoes(client, codigoProduto, apresentacoes) {
  if (!Array.isArray(apresentacoes)) return

  const { rows: existentes } = await client.query(
    'SELECT codigo_apresentacao FROM tab_medicamento_apresentacao WHERE codigo_produto = $1',
    [codigoProduto],
  )
  const existentesSet = new Set(existentes.map(r => r.codigo_apresentacao))
  const incomingSet   = new Set()

  for (const ap of apresentacoes) {
    const cod = String(ap.codigo || '')
    if (!cod) continue
    incomingSet.add(cod)

    const ffs = Array.isArray(ap.formasFarmaceuticas)
      ? ap.formasFarmaceuticas.filter(Boolean).join(', ')
      : null
    const vias = Array.isArray(ap.viasAdministracao)
      ? ap.viasAdministracao.filter(Boolean).join(', ')
      : null

    // Deletar dependentes para re-inserir
    for (const t of ['tab_medicamento_fabricante','tab_medicamento_conservacao',
                     'tab_medicamento_restricao_prescricao','tab_medicamento_via_administracao',
                     'tab_medicamento_principio_ativo_apres']) {
      await client.query(`DELETE FROM ${t} WHERE codigo_apresentacao = $1`, [cod])
    }

    await client.query(
      `INSERT INTO tab_medicamento_apresentacao (
         codigo_apresentacao, codigo_produto, descricao, forma_farmaceutica,
         numero_registro, quantidade, validade, tipo_validade, tarja,
         restricao_uso, destinacao, ativa, tipo_autorizacao
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (codigo_apresentacao) DO UPDATE SET
         descricao        = EXCLUDED.descricao,
         forma_farmaceutica = EXCLUDED.forma_farmaceutica,
         numero_registro  = EXCLUDED.numero_registro,
         quantidade       = EXCLUDED.quantidade,
         validade         = EXCLUDED.validade,
         tipo_validade    = EXCLUDED.tipo_validade,
         tarja            = EXCLUDED.tarja,
         restricao_uso    = EXCLUDED.restricao_uso,
         destinacao       = EXCLUDED.destinacao,
         ativa            = EXCLUDED.ativa,
         tipo_autorizacao = EXCLUDED.tipo_autorizacao,
         updated_at       = NOW()`,
      [
        cod, codigoProduto,
        lat(ap.apresentacao),
        lat(ffs),
        lat(ap.registro),
        lat(ap.qtdUnidadeMedida),
        lat(ap.validade),
        lat(ap.tipoValidade),
        lat(ap.tarja),
        lat(Array.isArray(ap.restricaoUso) ? ap.restricaoUso.join(', ') : null),
        lat(Array.isArray(ap.destinacao)   ? ap.destinacao.join(', ')   : null),
        Boolean(ap.ativa !== false),
        lat(ap.tipoAutorizacao),
      ],
    )

    // Fabricantes nacionais
    for (const f of (ap.fabricantesNacionais || [])) {
      await client.query(
        'INSERT INTO tab_medicamento_fabricante (codigo_apresentacao, nome, pais, estado, cidade, tipo) VALUES ($1,$2,$3,$4,$5,$6)',
        [cod, lat(f.fabricante || f.nome || ''), lat(f.pais), lat(f.uf || f.estado), lat(f.municipio || f.cidade), 'nacional'],
      )
    }
    // Fabricantes internacionais
    for (const f of (ap.fabricantesInternacionais || [])) {
      await client.query(
        'INSERT INTO tab_medicamento_fabricante (codigo_apresentacao, nome, pais, estado, cidade, tipo) VALUES ($1,$2,$3,$4,$5,$6)',
        [cod, lat(f.fabricante || f.nome || ''), lat(f.pais), '', '', 'internacional'],
      )
    }
    // Conservacao
    for (const c of (ap.conservacao || [])) {
      const desc = lat(typeof c === 'string' ? c : (c.descricao || ''))
      if (desc) await client.query('INSERT INTO tab_medicamento_conservacao (codigo_apresentacao, descricao) VALUES ($1,$2)', [cod, desc])
    }
    // Restricao prescricao
    for (const r of (ap.restricaoPrescricao || [])) {
      const desc = lat(typeof r === 'string' ? r : (r.descricao || ''))
      if (desc) await client.query('INSERT INTO tab_medicamento_restricao_prescricao (codigo_apresentacao, descricao) VALUES ($1,$2)', [cod, desc])
    }
    // Vias administracao
    for (const v of (ap.viasAdministracao || [])) {
      const desc = lat(typeof v === 'string' ? v : (v.descricao || ''))
      if (desc) await client.query('INSERT INTO tab_medicamento_via_administracao (codigo_apresentacao, descricao) VALUES ($1,$2)', [cod, desc])
    }
    // Principios ativos
    for (const p of (ap.principiosAtivos || [])) {
      const desc = lat(typeof p === 'string' ? p : (p.descricao || ''))
      if (desc) await client.query('INSERT INTO tab_medicamento_principio_ativo_apres (codigo_apresentacao, descricao) VALUES ($1,$2)', [cod, desc])
    }
  }

  // Marcar como inativas as apresentacoes removidas
  const removidas = [...existentesSet].filter(c => !incomingSet.has(c))
  if (removidas.length) {
    await client.query(
      'UPDATE tab_medicamento_apresentacao SET ativa = FALSE WHERE codigo_apresentacao = ANY($1)',
      [removidas],
    )
  }
}

// ── Barra de progresso simples ────────────────────────────────────────────────
function barra(atual, total, largura = 30) {
  const pct  = total > 0 ? atual / total : 0
  const done = Math.round(pct * largura)
  const bar  = '█'.repeat(done) + '░'.repeat(largura - done)
  return `[${bar}] ${atual}/${total} (${(pct * 100).toFixed(1)}%)`
}

// ── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  const inicio = Date.now()
  console.log(`\n=== Importador ANVISA → ${DATABASE} ===`)
  console.log(`Batch paralelo: ${BATCH} | Paginas: ${PAG_INI} até ${PAG_FIM ?? 'fim'}\n`)

  // headless:false — Cloudflare bloqueia Chromium headless com 403.
  // Com janela visível o fingerprint é mais próximo de um browser real.
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1280,800'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Navegar para o portal e aguardar o Angular inicializar (não a página Cloudflare)
  process.stdout.write('Carregando portal ANVISA... ')
  await page.goto('https://consultas.anvisa.gov.br/#/medicamentos', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})

  // Aguardar título sem 'Cloudflare' e com 'Consultas'
  await page.waitForFunction(
    () => document.title.toLowerCase().includes('consulta') && !document.title.toLowerCase().includes('cloudflare'),
    { timeout: 30000 }
  ).catch(() => {})

  // Verificar que a API está respondendo JSON (não HTML do Cloudflare)
  let apiOk = false
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    apiOk = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/consulta/medicamento/produtos/?count=1&page=1&filter[checkRegistrado]=true&filter[checkNotificado]=false&filter[situacaoRegistro]=V', {
          headers: { Authorization: 'Guest', Accept: 'application/json' }
        })
        const text = await r.text()
        JSON.parse(text)   // lança se for HTML
        return true
      } catch { return false }
    })
    if (apiOk) break
    process.stdout.write(`\n  API bloqueada (tentativa ${tentativa}/5), aguardando 5s... `)
    await page.waitForTimeout(5000)
  }
  if (!apiOk) {
    await browser.close()
    throw new Error('Portal ANVISA bloqueado pelo Cloudflare apos 5 tentativas. Tente novamente.')
  }
  console.log('OK')

  // ── FASE 1: Coletar todos os codigos (pagina por pagina fora do evaluate) ──
  process.stdout.write('Buscando lista de medicamentos... ')

  // Funcao que busca uma pagina no contexto do browser, com refresh de sessao
  let falhasSeguidasPag = 0
  async function fetchPagina(pag) {
    // Se muitas falhas consecutivas na paginacao, renovar sessao
    if (falhasSeguidasPag >= 3) {
      process.stdout.write(`\n  [sessao-pag] Renovando sessao (${falhasSeguidasPag} falhas)...`)
      await page.goto('https://consultas.anvisa.gov.br/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(4000)
      falhasSeguidasPag = 0
      process.stdout.write(' OK\n')
    }
    for (let t = 0; t < 4; t++) {
      const result = await page.evaluate(async ({ pag, porPag }) => {
        try {
          const r = await fetch(
            `/api/consulta/medicamento/produtos/?column=&count=${porPag}&page=${pag}&filter[checkNotificado]=false&filter[checkRegistrado]=true&filter[situacaoRegistro]=V&order=asc`,
            { headers: { Authorization: 'Guest', Accept: 'application/json' } }
          )
          const text = await r.text()
          if (!text || text.trimStart().startsWith('<')) return { _err: `HTML status=${r.status}` }
          return { data: JSON.parse(text) }
        } catch (e) { return { _err: e.message } }
      }, { pag, porPag: POR_PAG })
      if (result?.data) { falhasSeguidasPag = 0; return result.data }
      if (t === 0) process.stdout.write(`\n  [pag${pag}] ${result?._err ?? 'null'}`)
      await page.waitForTimeout(2000 + t * 1000)
    }
    falhasSeguidasPag++
    return null
  }

  const d0 = await fetchPagina(1)
  if (!d0) throw new Error('Falha ao buscar pagina 1 da lista ANVISA')

  const totalPags = d0.totalPages || 1
  const pagFimNum = PAG_FIM ? Math.min(Number(PAG_FIM), totalPags) : totalPags
  const codigos   = (d0.content || []).filter(i => i.produto?.codigo).map(i => String(i.produto.codigo))

  for (let p = 2; p <= pagFimNum; p++) {
    const d = await fetchPagina(p)
    if (!d) { process.stdout.write(`\n  [aviso] pagina ${p} nao respondeu, pulando`); continue }
    codigos.push(...(d.content || []).filter(i => i.produto?.codigo).map(i => String(i.produto.codigo)))
    if (d.last) break
    await page.waitForTimeout(800)  // respiro entre paginas
  }

  console.log(`OK — ${codigos.length} medicamentos (${pagFimNum} pags)`)

  if (!codigos.length) {
    await context.close(); await browser.close(); await pool.end()
    throw new Error('Nenhum codigo encontrado.')
  }

  // ── Teste rapido: 1 detalhe ────────────────────────────────────────────────
  process.stdout.write(`Testando detalhe do produto ${codigos[0]}... `)
  const testeDetalhe = await page.evaluate(async (cod) => {
    try {
      const r = await fetch(`/api/consulta/medicamento/produtos/codigo/${cod}`,
        { headers: { Authorization: 'Guest', Accept: 'application/json' } })
      const text = await r.text()
      if (!text || text.trimStart().startsWith('<')) return { ok: false, motivo: `HTML (status ${r.status})` }
      const d = JSON.parse(text)
      return { ok: true, nome: d.nomeComercial || '(sem nome)', qtdApres: d.apresentacoes?.length ?? 0 }
    } catch (e) { return { ok: false, motivo: e.message } }
  }, codigos[0])

  if (!testeDetalhe.ok) {
    await context.close(); await browser.close(); await pool.end()
    throw new Error(`Detalhe bloqueado: ${testeDetalhe.motivo}`)
  }
  console.log(`OK — "${testeDetalhe.nome}" (${testeDetalhe.qtdApres} apresentacoes)\n`)

  // ── FASE 2: Buscar detalhes em lotes e salvar ─────────────────────────────
  let ok = 0, falha = 0, idx = 0
  let falhasConsecutivas = 0

  // Refresh da sessao CF quando a sessao expira (muitas falhas consecutivas)
  async function refreshSessao() {
    process.stdout.write('\n  [sessao] Renovando sessao Cloudflare...')
    await page.goto('https://consultas.anvisa.gov.br/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(3000)
    // Verificar que a API voltou a responder
    let ok = false
    for (let t = 0; t < 4; t++) {
      ok = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/consulta/medicamento/produtos/?count=1&page=1&filter[checkRegistrado]=true&filter[checkNotificado]=false&filter[situacaoRegistro]=V', {
            headers: { Authorization: 'Guest', Accept: 'application/json' }
          })
          const text = await r.text()
          JSON.parse(text)
          return true
        } catch { return false }
      })
      if (ok) break
      await page.waitForTimeout(4000)
    }
    process.stdout.write(ok ? ' OK\n' : ' falhou, continuando...\n')
    falhasConsecutivas = 0
  }

  while (idx < codigos.length) {
    const lote = codigos.slice(idx, idx + BATCH)
    idx += BATCH

    // Buscar lote no browser (paralelo)
    const detalhes = await page.evaluate(async (lote) => {
      const headers = { 'Authorization': 'Guest', 'Accept': 'application/json' }
      return Promise.all(lote.map(async (cod) => {
        try {
          const r = await fetch(`/api/consulta/medicamento/produtos/codigo/${cod}`, { headers })
          const text = await r.text()
          if (!text || text.trimStart().startsWith('<')) return { _erro: `HTML status=${r.status}` }
          const d = JSON.parse(text)
          return d
        } catch (e) { return { _erro: e.message } }
      }))
    }, lote)

    // Pausa entre lotes para nao saturar o servidor
    await page.waitForTimeout(600)

    // Salvar todos do lote em paralelo (node async, nao thread — seguro)
    let okLote = 0, falhaLote = 0
    await Promise.all(detalhes.map(async (d) => {
      if (d?._erro) {
        if (falha < 3) process.stdout.write(`\n  [debug] falha: ${d._erro}`)
        falhaLote++; return
      }
      if (!d?.codigoProduto) { falhaLote++; return }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await salvarMedicamento(client, d)
        await salvarApresentacoes(client, String(d.codigoProduto), d.apresentacoes)
        await client.query('COMMIT')
        okLote++
      } catch (e) {
        await client.query('ROLLBACK')
        falhaLote++
        if (falha + falhaLote <= 3) console.error(`\n  [db-erro] cod=${d.codigoProduto}: ${e.message.substring(0, 120)}`)
      } finally {
        client.release()
      }
    }))
    ok    += okLote
    falha += falhaLote

    // Detectar expiracao de sessao CF: lote inteiro falhou com HTML
    if (okLote === 0 && detalhes.every(d => d?._erro?.includes('HTML'))) {
      falhasConsecutivas += lote.length
    } else {
      falhasConsecutivas = 0
    }
    if (falhasConsecutivas >= BATCH * 2) {
      await refreshSessao()
    }
    const total   = codigos.length
    const elapsed = ((Date.now() - inicio) / 1000).toFixed(0)
    const eta     = ok + falha > 0
      ? Math.round((total - (ok + falha)) * (Date.now() - inicio) / ((ok + falha) * 1000))
      : '?'
    process.stdout.write(`\r${barra(ok + falha, total)}  ok:${ok} falha:${falha}  ${elapsed}s  eta:${eta}s   `)
  }

  console.log('\n')
  await context.close()
  await browser.close()
  await pool.end()

  const elapsed = ((Date.now() - inicio) / 1000).toFixed(1)
  console.log(`=== Concluido em ${elapsed}s ===`)
  console.log(`Sucesso: ${ok} | Falhas: ${falha} | Total: ${codigos.length}`)
  console.log()
})().catch(e => {
  console.error('\n[ERRO FATAL]', e.message)
  process.exit(1)
})
