import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/mensagens/stream — Server-Sent Events.
// Em vez de abrir uma conexão de banco dedicada por aba aberta (apertaria o pool
// de 5 conexões por tenant), faz uma consulta curta a cada 1.5s via pool normal
// (acquire/release rápido) e só emite evento quando o "retrato" do usuário muda
// (nova mensagem recebida, contagem de não lidas ou confirmação de leitura).
// O cliente usa o evento só como gatilho pra refazer o fetch — não carrega payload.
export const dynamic = 'force-dynamic'

const INTERVALO_MS = 1500
const INTERVALO_MAX_MS = 15_000 // teto do backoff durante instabilidade de conexão
const HEARTBEAT_A_CADA_CICLOS = 20 // ~30s — mantém proxies (nginx/ALB) com idle-timeout curto vivos

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return new Response('Não autenticado', { status: 401 })

  const encoder = new TextEncoder()
  let closed = false
  let lastSignature = ''
  let timer: ReturnType<typeof setTimeout> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
        } catch {
          closed = true
        }
      }

      let ciclos = 0
      let falhasConsecutivas = 0

      const check = async () => {
        if (closed) return
        try {
          // getDb() de novo a cada ciclo (não reusar uma referência capturada no
          // início): além de pegar o pool atual, atualiza o lastUsedAt do tenant
          // em lib/db/index.ts, evitando que o evictIdlePools feche esse pool por
          // "ociosidade" enquanto esta conexão fica aberta por horas.
          // fila_recepcao muda tanto quando chega mensagem nova pro grupo Recepcao quanto
          // quando a ultima pendente e assumida por alguem - sinal pra recepcionistas
          // reconsultarem a fila, e pro proprio remetente ver a resposta chegar.
          // Comentario fica FORA da template string: a conexao com o banco e LATIN1 e
          // qualquer caractere fora do Latin-1 (acento em comentario SQL incluso) quebra
          // a query inteira (ver padroes.md secao sobre encoding).
          const { rows } = await getDb(session.database_name).query(
            `SELECT
               (SELECT COALESCE(MAX(id), 0) FROM tab_mensagem WHERE empresa_id = $1 AND destinatario_id = $2) AS recebidas,
               (SELECT COUNT(*) FROM tab_mensagem WHERE empresa_id = $1 AND destinatario_id = $2 AND lida_em IS NULL AND NOT oculta_destinatario) AS nao_lidas,
               (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(lida_em)), 0) FROM tab_mensagem WHERE empresa_id = $1 AND remetente_id = $2) AS vistas,
               (SELECT COALESCE(MAX(id), 0) FROM tab_mensagem WHERE empresa_id = $1 AND destinatario_id IS NULL) AS fila_recepcao`,
            [session.empresa_id_ativa, session.usuario_id],
          )
          falhasConsecutivas = 0
          const sig = JSON.stringify(rows[0])
          if (sig !== lastSignature) {
            lastSignature = sig
            ciclos = 0 // mudança real de dado também conta como "sinal de vida" — adia o próximo heartbeat
            send('update', sig)
          } else if (++ciclos >= HEARTBEAT_A_CADA_CICLOS) {
            ciclos = 0
            send('ping', '1')
          }
        } catch (err) {
          console.error('[mensagens:stream]', err)
          falhasConsecutivas++
        }
        // Backoff exponencial após falha: evita que N abas abertas martelem o pool
        // de conexões (max 5 por tenant) bem na janela em que ele já está sofrendo
        // com queda de conexão com o postgres.
        const proximoIntervalo = falhasConsecutivas > 0
          ? Math.min(INTERVALO_MS * 2 ** falhasConsecutivas, INTERVALO_MAX_MS)
          : INTERVALO_MS
        if (!closed) timer = setTimeout(check, proximoIntervalo)
      }

      send('ping', '1')
      timer = setTimeout(check, 300)

      req.signal.addEventListener('abort', () => {
        closed = true
        if (timer) clearTimeout(timer)
        try { controller.close() } catch { /* já encerrado */ }
      })
    },
    cancel() {
      closed = true
      if (timer) clearTimeout(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: desliga o buffer de proxy, senão os eventos ficam retidos até a conexão fechar
    },
  })
}
