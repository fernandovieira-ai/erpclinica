# Integração do Plugin Voa no Sistema (ERP/Prontuário)

## Objetivo
Carregar o Plugin da Voa embutido dentro de uma tela específica do prontuário (sem janela flutuante), usando um `<div>` container fixo. Não é necessário, por enquanto, o fluxo de preenchimento automático de prontuário (`enableFillEhr`) nem output estruturado — apenas carregar e exibir a Voa dentro da tela.

## Contexto do sistema
- Sistema próprio (acesso total ao código-fonte do frontend e backend)
- Stack: a definir/confirmar com o time (o exemplo abaixo é em React + Node/Express, mas adaptar à stack real do projeto)

---

## 1. Autenticação (backend)

Existem dois modos de token:

- **Auth Token**: token fixo, usado só em desenvolvimento, direto no header `x-voa-token`.
- **Bearer Token**: token específico por consulta (JWT com expiração configurável), **obrigatório em produção**. Gerado pelo backend chamando a API da Voa.

⚠️ **Pendência**: o `AUTH_TOKEN` de desenvolvimento/produção precisa ser solicitado à equipe da Voa em integration@voahealth.com. Ainda não foi obtido — deixar como variável de ambiente vazia por enquanto.

### Endpoint a criar no backend
Criar uma rota que gera o Bearer Token por consulta, chamando a API da Voa:

```
POST https://api.voa.health/integration/identify/
Headers:
  Content-Type: application/json
  x-voa-token: {AUTH_TOKEN}
Body:
{
  "consultation_id": "<ID_DA_CONSULTA>",
  "doctor_id": "<ID_DO_MEDICO>",
  "patient_id": "<ID_DO_PACIENTE>",
  "expiration": 43200
}
Response: { "token": "<BEARER_TOKEN>" }
```

Implementar como um endpoint interno do próprio sistema, por exemplo:
```
POST /api/voa/token
Body: { consultationId, doctorId, patientId }
Response: { token }
```

Regras:
- `VOA_AUTH_TOKEN` fica só em variável de ambiente do servidor — **nunca exposto no frontend**.
- `expiration` (em segundos) deve ser ajustado à duração média esperada de uma consulta no sistema (valor de exemplo: 43200 = 12h).
- Gerar um Bearer Token novo por consulta; não reutilizar entre consultas diferentes.

---

## 2. Carregamento do Plugin (frontend)

### Passos
1. Buscar o Bearer Token no backend (`POST /api/voa/token`) antes de tudo.
2. Injetar o script da Voa dinamicamente:
   ```
   https://integration.voa.health/plugin.js
   ```
   (tipo `module`)
3. Após `onload`, chamar `VoaPlugin.init({ token })` com o Bearer Token obtido.
4. Chamar `VoaPlugin.instance.mount({...})` passando os IDs internos (`doctorId`, `patientId`, `consultationId`) e as opções.

### Configuração do mount
```js
VoaPlugin.instance.mount({
  doctorId: "<ID_DO_MEDICO>",
  patientId: "<ID_DO_PACIENTE>",
  consultationId: "<ID_DA_CONSULTA>",
  options: {
    renderElement: <elemento HTML do container>, // embute no lugar de abrir janela flutuante
    darkMode: false,               // opcional, ajustar ao tema do sistema
    enableFillEhr: false,          // não usado neste momento
    consultationType: "IN_PERSON", // ou "TELEMEDICINE", ajustar por consulta
  },
});
```

### Regras importantes
- Só é possível ter **uma instância do Plugin montada por vez** na página.
- Sempre usar `VoaPlugin.instance.unmount()` para fechar — nunca remover o elemento manualmente do DOM (evita perda de sincronização/memória).
- Se o usuário trocar de paciente/consulta na mesma tela sem recarregar a página, é necessário chamar `unmount()` antes de montar de novo com os novos IDs.

---

## 3. Comunicação (listeners de eventos)

Registrar listener **antes** de chamar `init()`, para não perder o evento de erro de autenticação.

```js
VoaPlugin.instance.addMessageListener((message) => {
  switch (message.eventName) {
    case "voa.plugin.error.auth":
      // token inválido — eventData.message tem o detalhe
      break;
    case "voa.plugin.ready":
      // plugin carregado e pronto para uso
      break;
    case "voa.plugin.opened":
      break;
    case "voa.plugin.closed":
      // Plugin fechado — chamar unmount() para garantir limpeza
      break;
  }
});
```

Eventos relevantes para o escopo atual: `voa.plugin.error.auth`, `voa.plugin.ready`, `voa.plugin.opened`, `voa.plugin.closed`.

Eventos fora do escopo atual (não implementar agora, mas documentar para o futuro): `voa.plugin.ehr.created`, `voa.plugin.recorder.started/paused`, `voa.plugin.ehr.transcriptions`, `voa.plugin.ehr.document.created/copied/minimized`, `voa.plugin.ehr.fill`, `voa.plugin.ehr.structured_output`, `voa.plugin.maximized`.

Boas práticas de segurança do próprio fornecedor:
- Validar a forma da mensagem antes de processar (`typeof message.eventName === "string"`).
- Usar sempre HTTPS (já garantido pela URL do script e da API).

---

## 4. Estrutura de componente esperada (exemplo em React — adaptar à stack real)

```jsx
import { useEffect, useRef, useState } from "react";

function VoaPluginView({ doctorId, patientId, consultationId }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | closed

  useEffect(() => {
    let handler;

    const load = async () => {
      const tokenRes = await fetch("/api/voa/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, doctorId, patientId }),
      });
      const { token } = await tokenRes.json();

      const script = document.createElement("script");
      script.src = "https://integration.voa.health/plugin.js";
      script.type = "module";
      document.head.appendChild(script);

      script.onload = async () => {
        handler = (message) => {
          if (!message || typeof message.eventName !== "string") return;
          switch (message.eventName) {
            case "voa.plugin.error.auth":
              setStatus("error");
              break;
            case "voa.plugin.ready":
              setStatus("ready");
              break;
            case "voa.plugin.closed":
              setStatus("closed");
              break;
          }
        };

        window.VoaPlugin.instance.addMessageListener(handler);
        await window.VoaPlugin.init({ token });
        window.VoaPlugin.instance.mount({
          doctorId,
          patientId,
          consultationId,
          options: { renderElement: containerRef.current },
        });
      };
    };

    load();

    return () => {
      if (handler) window.VoaPlugin?.instance?.removeMessageListener(handler);
      window.VoaPlugin?.instance?.unmount();
    };
  }, [doctorId, patientId, consultationId]);

  return (
    <div>
      {status === "loading" && <p>Carregando Voa...</p>}
      {status === "error" && <p>Erro ao autenticar com a Voa. Verifique o token.</p>}
      <div ref={containerRef} style={{ width: "100%", height: "600px" }} />
    </div>
  );
}
```

---

## 5. Pendências / itens a confirmar com integration@voahealth.com

1. **Obter o `AUTH_TOKEN`** (dev e produção) — não fornecido em nenhuma doc recebida até agora.
2. Confirmar se é possível pré-selecionar o **template de anamnese** (ex: `anamnesisCardiology`, `soap`, etc.) via parâmetro no `mount()`, já que a doc de modelos lista os IDs mas as `options` documentadas não têm um campo `templateId`.
3. Confirmar o método correto para o prontuário **enviar** mensagens/comandos ao Plugin (ex: `voa.plugin.recorder`, `voa.plugin.generate`, `voa.plugin.fullTranscription`) — só documentamos `addMessageListener`/`removeMessageListener` para receber, não uma função de envio.
4. Esclarecer a divergência entre os nomes de eventos documentados em "Comunicação com a página" (padrão `voa.plugin.xxx.yyy`) e os citados em "Tipos de mensagem" (`CONSULTATION_STARTED`, `DOCUMENT_GENERATED`, etc.) — podem ser sinônimos de uma versão antiga da doc ou eventos adicionais.

## 6. Fora de escopo (não implementar agora)
- `structuredOutputSchema` / output estruturado
- `enableFillEhr` e tratamento de `voa.plugin.ehr.fill`
- `setScreenMediaStream` (áudio para telemedicina)
- `appendContext` / `addBackgroundHistory`
- Comandos de gravação (`voa.plugin.recorder`)
