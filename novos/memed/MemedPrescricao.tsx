"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    MdSinapsePrescricao?: {
      event: {
        add: (eventName: string, callback: (module: { name: string }) => void) => void;
      };
    };
    MdHub?: {
      module: { show: (moduleName: string) => void };
      command: {
        send: (
          moduleName: string,
          command: string,
          payload: Record<string, unknown>
        ) => Promise<unknown>;
      };
      event: {
        add: (eventName: string, callback: (data: unknown) => void) => void;
      };
    };
  }
}

export interface PacienteMemed {
  idExterno: string;
  nome: string;
  cpf: string; // ou passaporte, ver docs
  sexo: "Masculino" | "Feminino" | "M" | "F";
  data_nascimento?: string; // dd/mm/aaaa
  telefone?: string;
  email?: string;
  peso?: number;
  altura?: number;
}

interface MemedPrescricaoProps {
  /** Token do prescritor, obtido via POST /api/memed/prescritor */
  token: string;
  /** Paciente a ser carregado assim que o módulo estiver pronto */
  paciente: PacienteMemed;
  /** Chamado quando a prescrição é finalizada (evento prescricaoImpressa) */
  onPrescricaoImpressa?: (dados: unknown) => void;
}

const MEMED_SCRIPT_URL = process.env.NEXT_PUBLIC_MEMED_SCRIPT_URL!;

export function MemedPrescricao({
  token,
  paciente,
  onPrescricaoImpressa,
}: MemedPrescricaoProps) {
  const [carregado, setCarregado] = useState(false);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // Evita duplicar o script se o componente remontar
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${MEMED_SCRIPT_URL}"]`
    );

    function configurarPacienteEExibir(module: { name: string }) {
      if (module.name !== "plataforma.prescricao" || !window.MdHub) return;

      window.MdHub.command
        .send("plataforma.prescricao", "setPaciente", { ...paciente })
        .then(() => {
          window.MdHub?.module.show("plataforma.prescricao");
          setCarregado(true);
        })
        .catch((err) => {
          console.error("[memed] falha ao configurar paciente", err);
        });
    }

    function registrarListeners() {
      window.MdSinapsePrescricao?.event.add(
        "core:moduleInit",
        configurarPacienteEExibir
      );

      if (onPrescricaoImpressa) {
        window.MdHub?.event.add("prescricaoImpressa", onPrescricaoImpressa);
      }
    }

    if (existente) {
      // Script já está no DOM (ex: navegação entre páginas)
      registrarListeners();
      return;
    }

    const script = document.createElement("script");
    script.src = MEMED_SCRIPT_URL;
    script.setAttribute("data-token", token);
    script.async = true;
    script.onload = registrarListeners;
    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
      // Deliberadamente não removemos o script no unmount: a Memed
      // recomenda mantê-lo carregado durante toda a sessão do usuário.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!carregado) {
    return <p>Carregando prescrição digital…</p>;
  }

  return null; // a UI da Memed é injetada por ela mesma (fullscreen ou embedded)
}
