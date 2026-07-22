import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { caminhoRelativoAnexo, salvarArquivo } from '@/lib/storage'

const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024 // 15MB

// GET /api/clinica/prontuarios/anexos?agendamento_id=X  ou  ?paciente_id=X (bulk, pro histórico)
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const agendamentoId = req.nextUrl.searchParams.get('agendamento_id')
  const pacienteId    = req.nextUrl.searchParams.get('paciente_id')
  if (!agendamentoId && !pacienteId) {
    return NextResponse.json({ erro: 'Informe agendamento_id ou paciente_id' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rows } = agendamentoId
    ? await db.query(
        `SELECT a.id, a.agendamento_id, a.nome_arquivo, a.tipo_mime, a.tamanho_bytes, a.created_by, a.created_at
         FROM tab_prontuario_anexo a
         WHERE a.agendamento_id = $1 AND a.empresa_id = $2
         ORDER BY a.created_at DESC`,
        [Number(agendamentoId), session.empresa_id_ativa],
      )
    : await db.query(
        `SELECT a.id, a.agendamento_id, a.nome_arquivo, a.tipo_mime, a.tamanho_bytes, a.created_by, a.created_at
         FROM tab_prontuario_anexo a
         JOIN tab_agendamento ag ON ag.id = a.agendamento_id
         WHERE ag.paciente_id = $1 AND a.empresa_id = $2
         ORDER BY a.created_at DESC`,
        [Number(pacienteId), session.empresa_id_ativa],
      )
  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/prontuarios/anexos — multipart/form-data com agendamento_id + file.
// Arquivo vai pro volume em disco (UPLOADS_DIR); só o metadado fica no banco.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ erro: 'Envie como multipart/form-data' }, { status: 400 })

  const agendamentoId = Number(form.get('agendamento_id'))
  const arquivo = form.get('file')
  if (!agendamentoId || !(arquivo instanceof File)) {
    return NextResponse.json({ erro: 'agendamento_id e file são obrigatórios' }, { status: 400 })
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ erro: 'Arquivo excede o tamanho máximo de 15MB' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rows: agRows } = await db.query(
    'SELECT id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
    [agendamentoId, session.empresa_id_ativa],
  )
  if (agRows.length === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }

  const caminhoRelativo = caminhoRelativoAnexo(agendamentoId, arquivo.name)
  const buffer = Buffer.from(await arquivo.arrayBuffer())

  try {
    await salvarArquivo(caminhoRelativo, buffer)
  } catch (err) {
    console.error('Falha ao salvar anexo em disco:', err)
    return NextResponse.json({ erro: 'Falha ao salvar o arquivo no servidor' }, { status: 500 })
  }

  const { rows } = await db.query(
    `INSERT INTO tab_prontuario_anexo
       (empresa_id, agendamento_id, nome_arquivo, tipo_mime, tamanho_bytes, caminho_arquivo, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, agendamento_id, nome_arquivo, tipo_mime, tamanho_bytes, created_by, created_at`,
    [
      session.empresa_id_ativa, agendamentoId, arquivo.name, arquivo.type || null,
      arquivo.size, caminhoRelativo, session.nome ?? null,
    ],
  )

  return NextResponse.json(rows[0])
}
