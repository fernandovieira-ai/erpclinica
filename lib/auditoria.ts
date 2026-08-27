import type { Session } from '@/types/session'

type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> }

export async function registrarAuditoria(
  db: Queryable,
  session: Session,
  params: {
    tabela: string
    registroId: number
    acao: 'INSERT' | 'UPDATE' | 'DELETE'
    dadosAntes?: Record<string, unknown> | null
    dadosDepois?: Record<string, unknown> | null
  },
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO tab_log_auditoria
         (empresa_id, usuario_id, usuario_nome, tabela, registro_id, acao, dados_antes, dados_depois)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        session.empresa_id_ativa ?? null,
        session.usuario_id,
        session.nome,
        params.tabela,
        params.registroId,
        params.acao,
        params.dadosAntes  ? JSON.stringify(params.dadosAntes)  : null,
        params.dadosDepois ? JSON.stringify(params.dadosDepois) : null,
      ],
    )
  } catch (err) {
    console.error('[auditoria] falha ao gravar log:', err)
  }
}
