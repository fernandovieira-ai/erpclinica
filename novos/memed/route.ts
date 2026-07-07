import { NextRequest, NextResponse } from "next/server";
import {
  obterOuCadastrarPrescritor,
  MemedApiError,
  type CadastrarPrescritorInput,
} from "@/lib/memed";

/**
 * POST /api/memed/prescritor
 *
 * Recebe os dados do prescritor logado no seu ERP, garante que ele
 * exista na Memed (cadastra se necessário) e retorna o token atual
 * que o front-end vai usar no data-token do script.
 *
 * Nunca chame a Memed diretamente do client — esta rota existe
 * justamente para manter a SECRET_KEY só no servidor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CadastrarPrescritorInput>;

    // TODO: troque essa validação manual por zod ou pelo schema que
    // vocês já usam no restante do ERP.
    const obrigatorios: (keyof CadastrarPrescritorInput)[] = [
      "external_id",
      "nome",
      "sobrenome",
      "data_nascimento",
      "cpf",
      "uf",
      "sexo",
      "crm",
    ];
    const faltando = obrigatorios.filter((campo) => !body[campo]);
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: `Campos obrigatórios ausentes: ${faltando.join(", ")}` },
        { status: 400 }
      );
    }

    const prescritor = await obterOuCadastrarPrescritor(
      body as CadastrarPrescritorInput
    );

    // Aqui é um bom lugar para persistir prescritor.token (e status)
    // na sua tabela de prescritores, ver sql/001_memed_prescritores.sql
    // Lembrando: em produção o token é dinâmico, então trate-o como algo
    // de curta duração, não como uma credencial permanente.

    return NextResponse.json({
      token: prescritor.token,
      status: prescritor.status ?? null,
    });
  } catch (err) {
    if (err instanceof MemedApiError) {
      return NextResponse.json(
        { error: "Erro na API da Memed", details: err.body },
        { status: err.status }
      );
    }
    console.error("[memed] erro inesperado", err);
    return NextResponse.json(
      { error: "Erro inesperado ao integrar com a Memed" },
      { status: 500 }
    );
  }
}
