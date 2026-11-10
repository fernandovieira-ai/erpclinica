import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Marca o momento em que ESTE processo do servidor subiu. Como o módulo só é
// avaliado uma vez por processo (next start em produção roda num processo Node
// persistente - não é serverless), esse valor muda sozinho a cada redeploy/restart
// (processo novo) e permanece igual entre requisições do mesmo deploy. O front usa
// isso só pra detectar "subiu versão nova", sem precisar de hash de build do Next
// nem de variável específica da hospedagem (Railway ou outra).
const INICIADO_EM = Date.now()

export async function GET() {
  return NextResponse.json({ versao: INICIADO_EM })
}
