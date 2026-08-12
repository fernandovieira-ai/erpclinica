import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { avaliarDuplicidade, normalizarTelefoneDigits } from '@/lib/pacientes-duplicidade'

// GET /api/clinica/pacientes/checar-duplicidade?nome=X&data_nascimento=YYYY-MM-DD&celular=Y
//
// Usado no cadastro rápido de paciente dentro do agendamento agora que o CPF
// deixou de ser obrigatório: sem CPF pra garantir unicidade, faz uma pré-checagem
// por nome + telefone + data de nascimento pra evitar cadastro duplicado.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const nome            = req.nextUrl.searchParams.get('nome')?.trim() || ''
  const dataNascimento  = req.nextUrl.searchParams.get('data_nascimento')?.trim() || ''
  const celular         = req.nextUrl.searchParams.get('celular')?.trim() || ''

  if (nome.length < 3) return NextResponse.json({ dados: [] })

  const db             = getDb(session.database_name)
  const telefoneDigits = normalizarTelefoneDigits(celular)
  const primeiroToken  = nome.split(/\s+/)[0]

  try {
    const params: unknown[] = [session.empresa_id_ativa]
    const cond: string[] = []

    if (dataNascimento) {
      params.push(dataNascimento)
      cond.push(`data_nascimento = $${params.length}::date`)
    }
    if (telefoneDigits.length >= 8) {
      params.push(`%${telefoneDigits}%`)
      const idx = params.length
      cond.push(`regexp_replace(COALESCE(celular,''), '[^0-9]', '', 'g') LIKE $${idx}`)
      cond.push(`regexp_replace(COALESCE(telefone,''), '[^0-9]', '', 'g') LIKE $${idx}`)
    }
    if (primeiroToken.length >= 3) {
      params.push(`%${primeiroToken}%`)
      cond.push(`nome ILIKE $${params.length}`)
    }

    if (cond.length === 0) return NextResponse.json({ dados: [] })

    const { rows } = await db.query<{
      id: number
      nome: string
      cpf_cnpj: string | null
      celular: string | null
      telefone: string | null
      data_nascimento: string | null
    }>(
      `SELECT id, nome, cpf_cnpj, celular, telefone, TO_CHAR(data_nascimento, 'YYYY-MM-DD') AS data_nascimento
       FROM tab_pessoa
       WHERE empresa_id = $1 AND ind_paciente = true AND ativo = true
         AND (${cond.join(' OR ')})
       LIMIT 40`,
      params,
    )

    const candidatos = rows
      .map(r => avaliarDuplicidade(r, { nome, data_nascimento: dataNascimento || null, celular }))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    return NextResponse.json({ dados: candidatos })
  } catch (err) {
    console.error('[GET /api/clinica/pacientes/checar-duplicidade]', err)
    return NextResponse.json({ dados: [] })
  }
}
