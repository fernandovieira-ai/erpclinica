export function addDias(dateStr: string, dias: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + dias)
  return date.toISOString().split('T')[0]
}

export async function obterTipoReceitaPadrao(client: any): Promise<number> {
  try {
    const { rows } = await client.query(
      `SELECT id FROM tab_tipo_receita WHERE descricao ILIKE $1 OR descricao ILIKE $2 LIMIT 1`,
      ['%Consul%', '%Serviço%'],
    )
    if (rows.length > 0) return rows[0].id
    const { rows: fallback } = await client.query('SELECT id FROM tab_tipo_receita ORDER BY id ASC LIMIT 1')
    return fallback[0]?.id || 1
  } catch {
    return 1
  }
}
