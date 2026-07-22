import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// Volume persistente do Railway (produção); em dev local, sobrescreva via .env.local
// com um diretório que exista na máquina.
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/data/uploads'

function sanitizarNomeArquivo(nome: string): string {
  return nome.replace(/[^\w.\-]+/g, '_').slice(-150)
}

export function caminhoRelativoAnexo(agendamentoId: number, nomeOriginal: string): string {
  const nome = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizarNomeArquivo(nomeOriginal)}`
  return path.posix.join('prontuario', String(agendamentoId), nome)
}

export async function salvarArquivo(caminhoRelativo: string, conteudo: Buffer): Promise<void> {
  const caminhoAbsoluto = path.join(UPLOADS_DIR, caminhoRelativo)
  await fs.mkdir(path.dirname(caminhoAbsoluto), { recursive: true })
  await fs.writeFile(caminhoAbsoluto, conteudo)
}

export async function lerArquivo(caminhoRelativo: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOADS_DIR, caminhoRelativo))
}

export async function removerArquivo(caminhoRelativo: string): Promise<void> {
  await fs.rm(path.join(UPLOADS_DIR, caminhoRelativo), { force: true })
}
