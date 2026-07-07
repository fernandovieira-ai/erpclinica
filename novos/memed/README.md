# Integração Memed — ponto de partida (Next.js + TS + Postgres)

Ambiente: **homologação** (chaves fixas de teste, indisponível 0h–6h de seg a
sex e nos fins de semana).

## Estrutura gerada

```
.env.local.example                        # variáveis de ambiente (copie para .env.local)
lib/memed.ts                               # cliente server-side da API REST da Memed
app/api/memed/prescritor/route.ts          # rota backend: garante prescritor + retorna token
components/MemedPrescricao.tsx             # client component: carrega script e chama setPaciente
app/prescricao/exemplo-page.tsx            # exemplo de tela usando os dois acima
sql/001_memed_prescritores.sql             # tabela para vincular usuário do ERP <-> Memed
```

## Passo a passo para rodar

1. `cp .env.local.example .env.local`
2. Rode a migration `sql/001_memed_prescritores.sql` no seu Postgres
   (ajuste a FK `usuarios(id)` para o nome real da sua tabela de usuários).
3. Renomeie `app/prescricao/exemplo-page.tsx` para `page.tsx` dentro da
   rota onde a prescrição deve aparecer, e troque os dados mockados do
   prescritor/paciente pelos dados reais da sessão.
4. Suba o projeto (`npm run dev`) e acesse a rota — o console do
   navegador deve mostrar `ENVIRONMENT integrations / we are all set!!!`.

## Pontos importantes

- **A `SECRET_KEY` nunca pode ir para o front-end.** Por isso o cadastro
  do prescritor (`POST /sinapse-prescricao/usuarios`) só acontece dentro
  de `lib/memed.ts`, chamado pela API route — nunca direto do client.
- **Token não é fixo em produção.** Ele é renovado quando o cadastro do
  médico muda. Trate-o como algo obtido por sessão, não como algo pra
  cachear indefinidamente no banco (por isso a tabela SQL guarda o
  `external_id`/`memed_usuario_id`, não o token).
- **Dados do paciente enviados via `setPaciente` não podem ser editados
  manualmente dentro da prescrição** — se isso for um problema para o
  seu fluxo, vale revisar com o time da Memed.
- Quando vocês tiverem as chaves de produção, só trocar as 4 variáveis
  de ambiente (API key, secret key, API URL, script URL) — o código não
  muda.

## O que ainda falta (próximos passos sugeridos)

- Persistir o vínculo prescritor ⇄ Memed na tabela `memed_prescritores`
  dentro da rota `POST /api/memed/prescritor`.
- Tratar os `status` possíveis do prescritor (`Em análise`, `Inativo`
  etc.) retornados no cadastro/consulta.
- Implementar o listener de `prescricaoImpressa` para salvar o link/PDF
  da receita no seu banco (já tem o hook pronto em
  `onPrescricaoImpressa`).
- Validar o `body` da rota com `zod` (troquei por uma validação manual
  simples só como placeholder).
- Decidir entre integração **FullScreen** (usada aqui) ou **Embedded**
  (renderiza dentro de uma div do seu layout) — dá pra trocar isso no
  `MemedPrescricao.tsx` seguindo a doc de "Front-End" da Memed.

## Referências usadas

- https://doc.memed.com.br/integracao-rapida
- https://doc.memed.com.br/referencia/api-rest/prescritor
