import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'

function idInvalido(id: string): boolean {
  return !/^\d+$/.test(id)
}

// DELETE /api/clinica/agenda-profissional-excecao/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (idInvalido(params.id)) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    'DELETE FROM tab_agenda_profissional_excecao WHERE id = $1 AND empresa_id = $2 RETURNING *',
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  await registrarAuditoria(db, session, {
    tabela: 'tab_agenda_profissional_excecao',
    registroId: Number(params.id),
    acao: 'DELETE',
    dadosAntes: rows[0],
  })

  return NextResponse.json({ ok: true })
}
