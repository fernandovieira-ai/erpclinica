// Migração do "Relatório de despesas.xls" (legado, banco por fora) de
// Setembro/2026 para tab_despesa (despesa à vista, já paga), hiitcor.
//
// Fonte: C:\Linx\cliente\hiiltcor\Relatório de despesas.xls — relatório
// gerencial único ("SEM BANCO/CONTA DEFINIDO"), período 01/09 a 30/09/2026,
// 65 lançamentos, R$ 155.930,63 (conferido contra o "Total Geral" do próprio
// relatório). Dados abaixo transcritos do relatório já extraído/classificado.
//
// Fluxo escolhido: tab_despesa (não tab_titulo_pagar direto) — é a entidade
// de negócio correta pra lançar despesa; o trigger fn_trigger_despesa cuida
// do resto. Como todo lançamento já está pago (ind_avista=true, destino='B',
// conta_banco_id=SICOOB), o trigger insere direto em tab_movimento_banco e
// NÃO gera tab_titulo_pagar (esse só nasce no caso "a prazo").
//
// Decisões combinadas com o cliente:
//  - Repasse médico (Jose Vicente Tonin Jr, Joao Antonio da Silva Neto,
//    Wendell Subtil Rodrigues, Humberto de Sousa Pires Filho, Elio Neto
//    Paiva Teoro) ENTRA no lote como despesa normal (tipo 1.02 LAUDOS
//    MEDICOS TERCEIRIZADOS), mesmo o sistema já calculando repasse
//    automático pelos atendimentos — decisão explícita do cliente, ciente
//    da sobreposição com esse cálculo no período.
//  - Fornecedor: pessoa já cadastrada é reaproveitada (médicos migrados
//    como profissionais, prefixo "DR."/"DRA.", e Evelyn Flavia Silva, já
//    cadastrada sem papel de fornecedor) — só recebe ind_fornecedor=true.
//    Os demais ~48 fornecedores são cadastrados novos em tab_pessoa.
//  - Rateio de centro de custo: a API exige pelo menos 1 rateio quando o
//    tipo de despesa tem natureza Administrativa ('A') — só há 2 centros
//    de custo cadastrados (ADMINISTRATIVO/FINANCEIRO), nenhum granular por
//    especialidade/setor. Lançado 100% em ADMINISTRATIVO pra tudo que é
//    natureza 'A'; despesas natureza 'F' (financeiras) e 'I' (imposto) não
//    exigem rateio.
//  - Texto salvo em maiúsculo, sem acentuação (banco em LATIN1).
//  - documento = sufixo numérico (8 dígitos) que vinha colado no fim da
//    descrição no relatório de origem (ex.: "Pag ... 20260706") — é o lote
//    de pagamento/documento interno do sistema legado, não um nº fiscal.
//
// Uso:
//   node scripts/migrar_despesas_setembro_hiitcor.js            → dry-run
//   node scripts/migrar_despesas_setembro_hiitcor.js --commit    → grava

const path = require('path')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_NAME = process.argv[3] || 'hiitcor'
const COMMIT = process.argv.includes('--commit')
const CONTA_BANCO_MNEMONICO = 'SICOOB'
const CENTRO_CUSTO_CODIGO_DEFAULT = '1.01.0001' // ADMINISTRATIVO

// Aliases: fornecedor da planilha -> nome já cadastrado em tab_pessoa
// (médicos migrados com prefixo Dr./Dra., e pequenas variações de nome)
const ALIAS_PESSOA = {
  'JOSE VICENTE TONIN JUNIOR': 'DR. JOSE VICENTE TONIN JUNIOR',
  'JOAO ANTONIO DA SILVA NETO': 'DR. JOAO ANTONIO S. NETO',
  'WENDELL SUBTIL RODRIGUES': 'DR. WENDELL SUBTIL RODRIGUES',
  'HUMBERTO DE SOUSA PIRES FILHO': 'DR. HUMBERTO DE SOUSA PIRES FILHO',
  'ELIO NETO PAIVA TEORO': 'DR. ELIO TEORO',
  'EVELYN FLAVIA SILVA': 'EVELYN FLAVIA SILVA',
}

// tipo_pessoa: 'J' quando o nome indica empresa, 'F' (default) pessoa física
const EMPRESAS_RE = /LTDA|S\.?A\.?$| ME$|COMERCIO|DISTRIBUIDORA|TECNOLOGIA|INFORMATICA|ASSESSORIA|CONFEITARIA|PANIFICADORA|SUPERMERCADO|PAPELARIA|RADIO|HOSPCOM|CART[AÃ]O/i

// --------- lançamentos (fornecedor, data_vencimento, descricao, forma_pgto, valor, tipo_despesa_codigo) ---------
const LANCAMENTOS = [
  ['CAROLINA MUNDIM', '2026-09-02', 'Free lance 20260914', 'Transferencia', 420.00, '2.01'],
  ['KETHELLEY LOHANNY SILVA', '2026-09-02', 'Pag 20260914', 'Transferencia', 3037.42, '2.09'],
  ['EVELYN FLAVIA SILVA', '2026-09-02', 'Pag 20260706', 'Transferencia', 1844.32, '2.09'],
  ['MONIK VERAS BARRAGAN DE MATOS', '2026-09-02', 'Pag 20260706', 'Transferencia', 1737.26, '2.09'],
  ['JOSE VICENTE TONIN JUNIOR', '2026-09-02', 'Pag 20260706', 'Transferencia', 15540.78, '1.02'],
  ['JOAO ANTONIO DA SILVA NETO', '2026-09-02', 'Pag 20260706', 'Transferencia', 11647.49, '1.02'],
  ['MUNDO DOS PURIFICADORES', '2026-09-02', 'Filtro do Purificador de agua 20260924', 'Transferencia', 140.00, '2.03'],
  ['WENDELL SUBTIL RODRIGUES', '2026-09-02', 'Pag 20260706', 'Transferencia', 12551.00, '1.02'],
  ['HUMBERTO DE SOUSA PIRES FILHO', '2026-09-02', 'Pagamentos 20260810', 'Transferencia', 3692.00, '1.02'],
  ['ELIO NETO PAIVA TEORO', '2026-09-02', 'Pag 20260706', 'Transferencia', 290.50, '1.02'],
  ['ALINE CRISOSTOMO ALVES', '2026-09-02', 'Pag 20260706', 'Transferencia', 4450.10, '2.09'],
  ['SUPERMERCADO REIS', '2026-09-02', 'Limpeza e sabao liquido 20260925', 'Dinheiro', 92.89, '2.03'],
  ['R&T ARTIGOS PARA SAUDE', '2026-09-03', 'Produtos medicos 20260924', 'Debito automatico', 269.00, '1.04'],
  ['BIANCA KAROLINE SOARES DO ESPIRITO SANTO RIOS', '2026-09-03', 'Pag 20260706', 'Transferencia', 4269.91, '2.09'],
  ['PAPELARIA CASTELO FORTE', '2026-09-03', 'Diversos 20260924', 'Debito automatico', 232.12, '2.05'],
  ['PANIFICADORA VIA SABOR', '2026-09-04', 'Pao 20260706', 'Boleto bancario', 209.92, '8.01'],
  ['MEDWARE SISTEMAS MEDICOS', '2026-09-04', 'Laudos 20260706', 'Boleto bancario', 789.58, '1.06'],
  ['PRO REMEDIOS DISTRIBUIDORA', '2026-09-04', 'Medicamentos 20260814', 'Boleto bancario', 859.00, '1.04'],
  ['CARTAO DE CREDITO', '2026-09-07', 'Fatura 20260708', 'Debito automatico', 17067.50, '8.01'],
  ['MERCADAO DA ELETRONICA', '2026-09-08', 'Cabo TCP 20260924', 'Transferencia', 32.00, '2.04'],
  ['TI', '2026-09-08', 'Pag 20260706', 'Transferencia', 800.00, '2.09'],
  ['J.A GOMES INFORMATICA', '2026-09-08', 'Sistema Doctors 20260708', 'Boleto bancario', 1070.00, '1.06'],
  ['ANNA LETICIA PEREIRA DA SILVA', '2026-09-08', 'Assessoria Juridica 20260810', 'Boleto bancario', 2200.00, '2.01'],
  ['ALUGUEL ECG', '2026-09-08', 'Mensalidade 20260706', 'Transferencia', 400.00, '1.03'],
  ['DANIELLA MIRANDA', '2026-09-08', 'Nutri 20260924', 'Transferencia', 166.66, '2.09'],
  ['BEATRIZ RODRIGUES MAIA', '2026-09-08', 'Nutri 20260814', 'Transferencia', 334.00, '2.09'],
  ['RAQUEL FISIOTERAPEUTA - LIPEDEMA', '2026-09-08', 'Massagem 6 sessoes 20260924', 'Transferencia', 600.00, '2.09'],
  ['ELLI FLORES', '2026-09-09', 'Coroa de Flor 20260924', 'Transferencia', 550.00, '8.01'],
  ['DESPESAS VIAGEM ALVARO', '2026-09-11', 'Reembolso passagem aerea 20260803', 'Transferencia', 846.56, '2.06'],
  ['ELEVE TECNOLOGIA LTDA', '2026-09-11', 'Ponto Eletronico 20260724', 'Transferencia', 120.00, '1.06'],
  ['MAXIMED COMERCIO DE PRODUTO', '2026-09-14', 'Eletrodos, etc 20260724', 'Boleto bancario', 1180.59, '1.04'],
  ['MAPEGE PRODUTOS DE INFORMATICA', '2026-09-14', 'Boleto CPU 20260924', 'Transferencia', 200.00, '2.04'],
  ['RADIO 96 FM', '2026-09-14', 'Marketing 20260924', 'Transferencia', 3000.00, '4.03'],
  ['DESPESAS VIAGEM ALVARO', '2026-09-14', 'Almoco 20260924', 'Transferencia', 97.36, '2.06'],
  ['DESPESAS VIAGEM ALVARO', '2026-09-14', 'Ifood jantar 20260924', 'Transferencia', 238.19, '2.06'],
  ['R&T ARTIGOS PARA SAUDE', '2026-09-16', 'Produtos medicos 20260924', 'Debito automatico', 15.00, '1.04'],
  ['PRO REMEDIOS DISTRIBUIDORA', '2026-09-17', 'Medicamentos 20260814', 'Boleto bancario', 307.28, '1.04'],
  ['CONTABIL RIO LTDA', '2026-09-17', 'Contabilidade 20260814', 'Boleto bancario', 759.00, '2.01'],
  ['MOVEIS CASA FORTE', '2026-09-17', 'Cadeiras Recp 20260814', 'Boleto bancario', 1425.41, '5.03'],
  ['AROMA PRO', '2026-09-17', 'Marketing olfativo 20260814', 'Boleto bancario', 1219.99, '4.03'],
  ['LAVERSO ASSESSORIA EM MARKETING', '2026-09-17', 'CRM 20260814', 'Boleto bancario', 397.00, '4.03'],
  ['WALTERLY - PHILIPS', '2026-09-17', 'Conserto Affiniti 20260924', 'Transferencia', 3800.00, '2.03'],
  ['R&T ARTIGOS PARA SAUDE', '2026-09-18', 'Produtos medicos 20260924', 'Debito automatico', 18.50, '1.04'],
  ['DESPESAS VIAGEM ALVARO', '2026-09-18', 'Uber RV x Gyn - Alvaro 20260924', 'Transferencia', 750.00, '2.06'],
  ['CAMILO DE VITERBO', '2026-09-18', 'Urologista 20260924', 'Transferencia', 500.00, '1.02'],
  ['GIOVANNA SERAPHIM', '2026-09-18', 'Juros obra 20260724', 'Transferencia', 5000.00, '6.01'],
  ['FGTS', '2026-09-20', 'Folha de pagamento 20260724', 'Boleto bancario', 1467.28, '3.02'],
  ['INSS', '2026-09-20', 'Folha de pagamento 20260724', 'Boleto bancario', 2295.38, '3.03'],
  ['SIMPLES NACIONAL', '2026-09-21', 'Imposto 20260724', 'Boleto bancario', 8631.58, '9.01'],
  ['MURILLO BORGES VIEIRA', '2026-09-21', 'Aluguel 20260814', 'Transferencia', 7500.00, '2.02'],
  ['PANDER - MARKETING', '2026-09-21', 'Marketing 20260724', 'Transferencia', 4000.00, '4.03'],
  ['PAPELARIA CASTELO FORTE', '2026-09-21', 'Diversos 20260924', 'Transferencia', 578.00, '2.05'],
  ['ASO ASSESSORIA TREINAMENTO E PRESTACAO DE SERVICO', '2026-09-21', 'PCMSO 2/2 20260828', 'Boleto bancario', 700.00, '2.07'],
  ['A S GESTAO DE NEGOCIOS GERENCIAMENTO E MKT', '2026-09-21', 'Alvaro 20260505', 'Transferencia', 4500.00, '2.01'],
  ['R&T ARTIGOS PARA SAUDE', '2026-09-21', 'Produtos medicos 20260924', 'Debito automatico', 34.00, '1.04'],
  ['GALGANE CONFEITARIA', '2026-09-23', 'Aniversariante do mes 20260924', 'Debito automatico', 347.24, '2.08'],
  ['REEMBOLSO', '2026-09-23', 'Cleidiane - Lipedema 20260924', 'Transferencia', 2124.99, '2.10'],
  ['R&T ARTIGOS PARA SAUDE', '2026-09-24', 'Produtos medicos 20260924', 'Debito automatico', 33.99, '1.04'],
  ['FRETE', '2026-09-24', 'Adailson 20260925', 'Transferencia', 50.00, '8.01'],
  ['JOAO ANTONIO DA SILVA NETO', '2026-09-25', 'Financiamento TCP 20260810', 'Transferencia', 5301.62, '6.01'],
  ['REEMBOLSO', '2026-09-25', 'Carla - Tirzepatida 20260924', 'Transferencia', 1944.40, '2.10'],
  ['CLINICA DO CORACAO', '2026-09-25', 'Aluguel HD11 20260925', 'Dinheiro', 5700.00, '1.03'],
  ['GDB COMERCIO E SERVICOS LTDA - HOSPCOM', '2026-09-25', 'Aluguel 20260727', 'Transferencia', 183.35, '1.03'],
  ['UNIMED RIO VERDE', '2026-09-30', 'Plano de Saude 20261002', 'Transferencia', 3170.47, '2.07'],
  ['ATLB - LEANDRO', '2026-09-30', 'Concerto Equipamento Medico 20261002', 'Transferencia', 2200.00, '2.03'],
]

function stripAcentos(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function limpar(v) {
  if (v == null) return null
  const s = stripAcentos(String(v)).toUpperCase().replace(/\s+/g, ' ').trim()
  return s || null
}

function splitDescricaoDocumento(desc) {
  const m = String(desc).match(/^(.*?)\s*(\d{8})$/)
  if (m) return { descricao: limpar(m[1]), documento: m[2] }
  return { descricao: limpar(desc), documento: null }
}

async function main() {
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
  try {
    const emp = await client.query('SELECT id FROM tab_empresa')
    if (emp.rows.length !== 1) throw new Error(`Esperava exatamente 1 empresa, encontrei ${emp.rows.length}`)
    const empresaId = emp.rows[0].id

    const contaRes = await client.query(
      'SELECT id FROM tab_conta_banco WHERE mnemonico = $1 AND empresa_id = $2',
      [CONTA_BANCO_MNEMONICO, empresaId],
    )
    if (contaRes.rows.length !== 1) throw new Error(`Conta banco '${CONTA_BANCO_MNEMONICO}' não encontrada (encontradas: ${contaRes.rows.length})`)
    const contaBancoId = contaRes.rows[0].id

    const centroRes = await client.query(
      'SELECT id FROM tab_centro_custo WHERE codigo = $1',
      [CENTRO_CUSTO_CODIGO_DEFAULT],
    )
    if (centroRes.rows.length !== 1) throw new Error(`Centro de custo '${CENTRO_CUSTO_CODIGO_DEFAULT}' não encontrado`)
    const centroCustoId = centroRes.rows[0].id

    const tiposRes = await client.query('SELECT id, codigo, natureza FROM tab_tipo_despesa WHERE empresa_id = $1', [empresaId])
    const tipoPorCodigo = new Map(tiposRes.rows.map((r) => [r.codigo, r]))
    for (const [, , , , , codigo] of LANCAMENTOS) {
      if (!tipoPorCodigo.has(codigo)) throw new Error(`tipo_despesa codigo '${codigo}' não existe em tab_tipo_despesa`)
    }

    const pessoasRes = await client.query('SELECT id, nome FROM tab_pessoa')
    const pessoaIdPorNome = new Map(pessoasRes.rows.map((p) => [limpar(p.nome), p.id]))

    const fornecedoresUnicos = [...new Set(LANCAMENTOS.map((l) => l[0]))]
    const pessoaIdPorFornecedor = new Map()
    const novasPessoas = []
    const pessoasExistentesReaproveitadas = []

    for (const forn of fornecedoresUnicos) {
      const nomeBusca = limpar(ALIAS_PESSOA[forn] || forn)
      const existenteId = pessoaIdPorNome.get(nomeBusca)
      if (existenteId) {
        pessoaIdPorFornecedor.set(forn, existenteId)
        pessoasExistentesReaproveitadas.push({ fornecedor: forn, pessoa_id: existenteId, nome_cadastrado: nomeBusca })
      } else {
        novasPessoas.push(forn)
      }
    }

    console.log('='.repeat(70))
    console.log('MIGRAÇÃO DESPESAS SETEMBRO/2026 - HIITCOR (tab_despesa)')
    console.log('='.repeat(70))
    console.log(`Empresa id: ${empresaId} | Banco: ${DB_NAME} | Conta banco: ${CONTA_BANCO_MNEMONICO} (id=${contaBancoId}) | Centro custo default: ${CENTRO_CUSTO_CODIGO_DEFAULT} (id=${centroCustoId})`)
    console.log(`Lançamentos: ${LANCAMENTOS.length} | Fornecedores distintos: ${fornecedoresUnicos.length}`)
    console.log(`Pessoas reaproveitadas (já cadastradas): ${pessoasExistentesReaproveitadas.length}`)
    console.table(pessoasExistentesReaproveitadas)
    console.log(`Pessoas novas a cadastrar: ${novasPessoas.length}`)
    console.log(novasPessoas.join(', '))

    const totalGeral = LANCAMENTOS.reduce((acc, l) => acc + l[4], 0)
    const comRateio = LANCAMENTOS.filter((l) => tipoPorCodigo.get(l[5]).natureza === 'A').length
    console.log(`\nTotal geral a lançar: ${totalGeral.toFixed(2)}`)
    console.log(`Lançamentos que vão gerar rateio 100% em ${CENTRO_CUSTO_CODIGO_DEFAULT}: ${comRateio}`)

    if (!COMMIT) {
      console.log('\n[DRY-RUN] Nenhuma gravação feita no banco. Rode com --commit para gravar.')
      return
    }

    await client.query('BEGIN')

    // 1) Garante ind_fornecedor=true nas pessoas reaproveitadas
    for (const { pessoa_id } of pessoasExistentesReaproveitadas) {
      await client.query('UPDATE tab_pessoa SET ind_fornecedor = true WHERE id = $1', [pessoa_id])
    }

    // 2) Cadastra as pessoas novas
    for (const forn of novasPessoas) {
      const nome = limpar(forn)
      const tipoPessoa = EMPRESAS_RE.test(forn) ? 'J' : 'F'
      const { rows } = await client.query(
        `INSERT INTO tab_pessoa (empresa_id, tipo_pessoa, nome, ind_fornecedor, ativo, obs)
         VALUES ($1,$2,$3,true,true,$4) RETURNING id`,
        [empresaId, tipoPessoa, nome, 'FORNECEDOR CRIADO NA MIGRACAO DO RELATORIO DE DESPESAS - SETEMBRO 2026'],
      )
      pessoaIdPorFornecedor.set(forn, rows[0].id)
    }

    // 3) Lança cada despesa à vista, já paga via banco (trigger gera o movimento_banco)
    let gravados = 0
    for (const [fornecedor, dataVenc, descOriginal, formaPgto, valor, tipoCodigo] of LANCAMENTOS) {
      const pessoaId = pessoaIdPorFornecedor.get(fornecedor)
      const tipo = tipoPorCodigo.get(tipoCodigo)
      const { descricao, documento } = splitDescricaoDocumento(descOriginal)
      const observacao = limpar(
        `MIGRADO DO RELATORIO DE DESPESAS LEGADO (SET/2026) - ${descricao} - FORMA ORIGINAL: ${formaPgto}`,
      )

      const despesaRes = await client.query(
        `INSERT INTO tab_despesa
           (empresa_id, pessoa_id, tipo_despesa_id, centro_custo_id,
            ind_avista, destino, conta_banco_id,
            data_despesa, data_competencia, documento,
            valor, num_parcelas, status, observacao, created_by)
         VALUES ($1,$2,$3,NULL,true,'B',$4,$5,$5,$6,$7,1,'A',$8,$9)
         RETURNING id`,
        [empresaId, pessoaId, tipo.id, contaBancoId, dataVenc, documento, valor, observacao, 'MIGRACAO HIITCOR'],
      )
      const despesaId = despesaRes.rows[0].id

      if (tipo.natureza === 'A') {
        await client.query(
          `INSERT INTO tab_despesa_rateio (despesa_id, centro_custo_id, percentual, valor)
           VALUES ($1,$2,100,$3)`,
          [despesaId, centroCustoId, valor],
        )
      }

      gravados++
    }

    await client.query('COMMIT')
    console.log(`\n[COMMIT] ${gravados} despesas gravadas e pagas via ${CONTA_BANCO_MNEMONICO} (empresa_id=${empresaId}, banco=${DB_NAME}).`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\nERRO - rollback executado:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('ERRO:', err.message)
  process.exit(1)
})
