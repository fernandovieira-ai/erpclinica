type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

// Regra de negócio (ver padroes.md "Recebimento clínico = check-in"): o recebimento só faz
// check-in (-> AGUARDANDO); quem marca ATENDIDO é o botão "Finalizar atendimento" do médico.
// Quando isso é esquecido, o agendamento fica preso em AGUARDANDO/AGENDADO/CONFIRMADO pra
// sempre mesmo já tendo sido pago e o dia já ter virado — autocorrige sozinho, sem
// depender de ninguém lembrar de voltar lá. Só mexe em dias JÁ FECHADOS (data_hora_inicio
// antes de hoje) pra não atropelar um atendimento ainda em curso no mesmo dia; só mexe em
// quem tem recebimento PAGO confirmado (não cria ATENDIDO "fantasma" em quem nunca pagou).
// Chamado no próprio GET de listagem (agenda, recebimentos, ficha do paciente) — não
// depende de login/cron, então funciona mesmo com DEV_NO_AUTH ativo.
export async function autoFinalizarAgendamentosPagos(db: Queryable, empresaId: number): Promise<void> {
  await db.query(
    `UPDATE tab_agendamento a
     SET status = 'ATENDIDO', updated_at = NOW()
     WHERE a.empresa_id = $1
       AND a.status IN ('AGENDADO','CONFIRMADO','AGUARDANDO')
       AND a.data_hora_inicio < date_trunc('day', NOW())
       AND EXISTS (
         SELECT 1 FROM tab_recebimento_consulta rc
         WHERE rc.agendamento_id = a.id AND rc.status_recebimento = 'PAGO'
       )`,
    [empresaId],
  )
}
