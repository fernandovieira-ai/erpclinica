type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

export interface RegraRepasse {
  percentual: number
  // Só vale com percentual = 0 (ver dividirRepasse). null = sem valor fixo.
  valor_fixo: number | null
}

// Regra de repasse do profissional executante: % do valor recebido OU, com % = 0, valor fixo.
// Fonte: tab_profissional_tipo_percentual (par profissional x tipo de atendimento).
// Sem linha cadastrada (ou sem tipo) => 100% (profissional fica com tudo).
export async function regraRepasse(
  db: Queryable,
  profissionalId: number | null | undefined,
  tipoId: number | null | undefined,
): Promise<RegraRepasse> {
  const padrao: RegraRepasse = { percentual: 100, valor_fixo: null }
  if (!profissionalId || !tipoId) return padrao
  const { rows } = await db.query(
    `SELECT percentual_profissional, valor_fixo
       FROM tab_profissional_tipo_percentual
      WHERE profissional_id = $1 AND tipo_id = $2`,
    [profissionalId, tipoId],
  )
  if (rows.length === 0) return padrao
  const pct   = Number(rows[0].percentual_profissional)
  const fixo  = rows[0].valor_fixo == null ? null : Number(rows[0].valor_fixo)
  return {
    percentual: Number.isFinite(pct) ? pct : 100,
    valor_fixo: fixo != null && Number.isFinite(fixo) ? fixo : null,
  }
}

const arred2 = (n: number) => Math.round(n * 100) / 100

// Divide um valor recebido entre profissional e clinica.
// - percentual > 0: profissional fica com esse % do total (valor fixo ignorado).
// - percentual = 0 com valor fixo: profissional fica com o valor fixo, limitado ao total
//   recebido (desconto maior que o fixo nao deixa a clinica negativa); clinica fica com o resto.
// - percentual = 0 sem valor fixo: profissional nao recebe nada.
export function dividirRepasse(total: number, regra: RegraRepasse): {
  valor_profissional: number
  valor_clinica: number
} {
  const pct = Math.min(Math.max(regra.percentual, 0), 100)
  const valorProf = pct === 0 && regra.valor_fixo != null
    ? arred2(Math.min(Math.max(regra.valor_fixo, 0), Math.max(total, 0)))
    : arred2(total * (pct / 100))
  return {
    valor_profissional: valorProf,
    valor_clinica: arred2(total - valorProf),
  }
}
