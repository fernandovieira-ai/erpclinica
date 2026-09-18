// Só os tipos de atendimento habilitados no cadastro do profissional (aba "Atendimentos",
// tab_profissional_tipo_percentual) podem ser agendados pra ele. O front já filtra o dropdown;
// o servidor valida de novo pra que nenhuma chamada direta à API fure a configuração.

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

export const MSG_TIPO_NAO_HABILITADO =
  'Este profissional não realiza o tipo de atendimento selecionado. Habilite em Cadastro > Pessoas > Profissional > aba Atendimentos.'

export async function profissionalRealizaTipo(
  db: Queryable, empresaId: number, profissionalId: number, tipoId: number,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM tab_profissional_tipo_percentual
     WHERE empresa_id = $1 AND profissional_id = $2 AND tipo_id = $3`,
    [empresaId, profissionalId, tipoId],
  )
  return rows.length > 0
}
