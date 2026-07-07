// Exemplo de uso — adapte para a sua tela real de atendimento/prescrição.
// Renomeie para page.tsx dentro da rota desejada (ex: app/atendimentos/[id]/prescricao/page.tsx)

"use client";

import { useEffect, useState } from "react";
import { MemedPrescricao, type PacienteMemed } from "@/components/MemedPrescricao";

export default function PaginaPrescricao() {
  const [token, setToken] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarToken() {
      try {
        const res = await fetch("/api/memed/prescritor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Substitua pelos dados reais do prescritor logado no ERP
            external_id: "id-do-medico-no-seu-erp",
            nome: "José",
            sobrenome: "da Silva",
            data_nascimento: "01/01/1985",
            cpf: "99999999999",
            uf: "SP",
            sexo: "M",
            crm: "54321",
          }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "Falha ao obter token da Memed");
        }

        const { token } = await res.json();
        setToken(token);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro desconhecido");
      }
    }

    carregarToken();
  }, []);

  const paciente: PacienteMemed = {
    idExterno: "id-do-paciente-no-seu-erp",
    nome: "Maria de Souza",
    cpf: "11122233344",
    sexo: "Feminino",
    data_nascimento: "10/10/1990",
  };

  if (erro) return <p>Erro ao carregar prescrição: {erro}</p>;
  if (!token) return <p>Carregando token do prescritor…</p>;

  return (
    <MemedPrescricao
      token={token}
      paciente={paciente}
      onPrescricaoImpressa={(dados) => {
        console.log("Prescrição finalizada:", dados);
        // TODO: salvar link/PDF da receita no seu banco, se necessário
      }}
    />
  );
}
