type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

// % do valor do atendimento que fica com o profissional executante.
// Fonte: tab_profissional_tipo_percentual (par profissional x tipo de atendimento).
// Sem linha cadastrada (ou sem tipo) => 100 (profissional fica com tudo).
export async function percentualRepasse(
  db: Queryable,
  profissionalId: number | null | undefined,
  tipoId: number | null | undefined,
): Promise<number> {
  if (!profissionalId || !tipoId) return 100
  const { rows } = await db.query(
    `SELECT percentual_profissional
       FROM tab_profissional_tipo_percentual
      WHERE profissional_id = $1 AND tipo_id = $2`,
    [profissionalId, tipoId],
  )
  if (rows.length === 0) return 100
  const v = Number(rows[0].percentual_profissional)
  return Number.isFinite(v) ? v : 100
}

// Divide um valor recebido entre profissional e clinica conforme o %.
export function dividirRepasse(total: number, percentualProfissional: number): {
  valor_profissional: number
  valor_clinica: number
} {
  const pct = Math.min(Math.max(percentualProfissional, 0), 100)
  const valorProf = Math.round(total * (pct / 100) * 100) / 100
  return {
    valor_profissional: valorProf,
    valor_clinica: Math.round((total - valorProf) * 100) / 100,
  }
}
