import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

function formatarCpfCnpj(digits: string): string {
  if (digits.length === 11)
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`
}

// GET /api/clinica/pacientes?busca=<nome ou cpf>
// GET /api/clinica/pacientes?cpf=<somente digitos>   ← busca exata por CPF/CNPJ
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const busca      = req.nextUrl.searchParams.get('busca')?.trim() || ''
  const cpfParam   = req.nextUrl.searchParams.get('cpf')?.replace(/\D/g, '') || ''
  const db         = getDb(session.database_name)

  try {
    const params: unknown[] = [session.empresa_id_ativa]
    let buscaCond = ''

    if (cpfParam) {
      // Busca exata por CPF: cobre armazenamento com e sem formatação
      const formatted = formatarCpfCnpj(cpfParam)
      buscaCond = ` AND (p.cpf_cnpj = $2 OR p.cpf_cnpj = $3)`
      params.push(cpfParam, formatted)
    } else if (busca) {
      // Busca parcial por nome ou CPF (texto livre)
      buscaCond = ` AND (p.nome ILIKE $2 OR p.cpf_cnpj ILIKE $2)`
      params.push(`%${busca}%`)
    }

    const { rows } = await db.query(
      `SELECT p.id, p.nome, p.cpf_cnpj, p.celular, p.telefone, p.whatsapp, p.cidade, p.uf, p.email
       FROM tab_pessoa p
       WHERE p.empresa_id = $1 AND p.ind_paciente = true AND p.ativo = true
       ${buscaCond}
       ORDER BY p.nome
       LIMIT 50`,
      params,
    )

    return NextResponse.json({ dados: rows })
  } catch (err) {
    console.error('[GET /api/clinica/pacientes]', err)
    return NextResponse.json({ dados: [] })
  }
}

// POST /api/clinica/pacientes — cadastro rápido de paciente
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: 'Corpo da requisição inválido' }, { status: 400 })
  }

  const nome = (String(body.nome ?? '')).trim().toUpperCase()
  if (!nome) return NextResponse.json({ erro: 'Nome é obrigatório' }, { status: 400 })

  const cpfCnpj = body.cpf_cnpj ? String(body.cpf_cnpj).trim() : null
  const db = getDb(session.database_name)

  try {
    // Verifica CPF duplicado antes de inserir — sem usar REGEXP_REPLACE
    if (cpfCnpj) {
      const digits    = cpfCnpj.replace(/\D/g, '')
      const formatted = (digits.length === 11 || digits.length === 14)
        ? formatarCpfCnpj(digits)
        : cpfCnpj

      const { rows: existentes } = await db.query<{ id: number; nome: string; cpf_cnpj: string; celular: string }>(
        `SELECT id, nome, cpf_cnpj, celular FROM tab_pessoa
         WHERE empresa_id = $1
           AND ind_paciente = true
           AND ativo = true
           AND (cpf_cnpj = $2 OR cpf_cnpj = $3)
         LIMIT 1`,
        [session.empresa_id_ativa, digits, formatted],
      )

      if (existentes.length > 0) {
        return NextResponse.json(
          { erro: 'CPF já cadastrado', paciente_existente: existentes[0] },
          { status: 409 },
        )
      }
    }

    const { rows } = await db.query(
      `INSERT INTO tab_pessoa (
         empresa_id, tipo_pessoa, nome, cpf_cnpj, data_nascimento, celular, ind_paciente
       ) VALUES ($1, 'F', $2, $3, $4, $5, true)
       RETURNING id, nome, cpf_cnpj, celular`,
      [
        session.empresa_id_ativa,
        nome,
        cpfCnpj,
        body.data_nascimento || null,
        body.celular ? String(body.celular).trim() : null,
      ],
    )

    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    const pg = err as { code?: string; message?: string }
    // Trigger de CPF duplicado (código P0001) — fallback de segurança
    if (pg.code === 'P0001') {
      if (cpfCnpj) {
        const digits    = cpfCnpj.replace(/\D/g, '')
        const formatted = (digits.length === 11 || digits.length === 14) ? formatarCpfCnpj(digits) : cpfCnpj
        try {
          const { rows: existentes } = await db.query<{ id: number; nome: string; cpf_cnpj: string; celular: string; ind_paciente: boolean }>(
            `SELECT id, nome, cpf_cnpj, celular, ind_paciente FROM tab_pessoa
             WHERE empresa_id = $1 AND (cpf_cnpj = $2 OR cpf_cnpj = $3) LIMIT 1`,
            [session.empresa_id_ativa, digits, formatted],
          )
          if (existentes.length > 0) {
            const encontrada = existentes[0]
            // Pessoa já existe (ex: cliente/fornecedor) mas ainda não é paciente — marca agora
            if (!encontrada.ind_paciente) {
              await db.query(`UPDATE tab_pessoa SET ind_paciente = true WHERE id = $1`, [encontrada.id])
            }
            return NextResponse.json(
              { erro: 'CPF já cadastrado', paciente_existente: encontrada },
              { status: 409 },
            )
          }
        } catch { /* ignora erro no fallback */ }
      }
      return NextResponse.json({ erro: 'CPF já cadastrado para outro paciente' }, { status: 409 })
    }
    console.error('[POST /api/clinica/pacientes]', err)
    return NextResponse.json({ erro: 'Erro ao cadastrar paciente' }, { status: 500 })
  }
}
