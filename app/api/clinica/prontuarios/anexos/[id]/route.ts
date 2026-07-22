import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { lerArquivo, removerArquivo } from '@/lib/storage'

// GET /api/clinica/prontuarios/anexos/[id] — baixa/visualiza o arquivo
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT nome_arquivo, tipo_mime, caminho_arquivo FROM tab_prontuario_anexo WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresa_id_ativa],
  )
  if (rows.length === 0) return NextResponse.json({ erro: 'Anexo não encontrado' }, { status: 404 })

  const anexo = rows[0]
  const buffer = await lerArquivo(anexo.caminho_arquivo).catch(() => null)
  if (!buffer) return NextResponse.json({ erro: 'Arquivo não encontrado no storage' }, { status: 404 })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        anexo.tipo_mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(anexo.nome_arquivo)}"`,
    },
  })
}

// DELETE /api/clinica/prontuarios/anexos/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `DELETE FROM tab_prontuario_anexo WHERE id = $1 AND empresa_id = $2 RETURNING caminho_arquivo`,
    [id, session.empresa_id_ativa],
  )
  if (rows.length === 0) return NextResponse.json({ erro: 'Anexo não encontrado' }, { status: 404 })

  await removerArquivo(rows[0].caminho_arquivo).catch(() => {})
  return NextResponse.json({ ok: true })
}
