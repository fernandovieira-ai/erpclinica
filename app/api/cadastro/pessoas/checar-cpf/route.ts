import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/cadastro/pessoas/checar-cpf?cpf_cnpj=X&excluir_id=Y
//
// Pré-checagem em tempo real (onBlur do campo CPF/CNPJ no formulário de
// pessoa) pra avisar o usuário antes de tentar salvar que já existe um
// cadastro com esse documento, com opção de ir direto pro cadastro existente.
// excluir_id é passado ao editar uma pessoa, pra não acusar duplicidade do
// próprio registro.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const cpfNormalizado = (req.nextUrl.searchParams.get('cpf_cnpj') || '').replace(/\D/g, '')
  const excluirId       = req.nextUrl.searchParams.get('excluir_id')

  // Só dispara a query pra CPF (11) ou CNPJ (14) completos — evita custo
  // de uma query a cada tecla digitada enquanto o documento ainda está incompleto.
  if (cpfNormalizado.length !== 11 && cpfNormalizado.length !== 14) {
    return NextResponse.json({ duplicado: false })
  }

  const db     = getDb(session.database_name)
  const params: unknown[] = [cpfNormalizado]
  let   cond   = `cpf_cnpj = $1 AND ativo = true`

  if (excluirId && /^\d+$/.test(excluirId)) {
    params.push(Number(excluirId))
    cond += ` AND id <> $2`
  }

  const { rows } = await db.query<{ id: number; nome: string }>(
    `SELECT id, nome FROM tab_pessoa WHERE ${cond} LIMIT 1`,
    params,
  )

  if (!rows.length) return NextResponse.json({ duplicado: false })
  return NextResponse.json({ duplicado: true, pessoa: { id: rows[0].id, nome: rows[0].nome } })
}
