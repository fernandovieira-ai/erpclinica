# Padrões do Projeto ERP — DigitalRF

Ao trabalhar neste projeto, siga SEMPRE os padrões abaixo sem precisar ser lembrado.

---

## 0. Idioma: responder sempre em português do Brasil

Todas as respostas ao usuário (texto de conversa, mensagens de commit quando não especificado de outra forma, resumos, explicações) devem ser em **português do Brasil**, independentemente do idioma da pergunta. Comentários e nomes de variáveis no código seguem o idioma já usado no arquivo (geralmente português, ver convenções do projeto).

**Inclui saídas de skills/subagentes invocados** (ex: `/code-review`, `security-review`, relatórios de `ReportFindings`): mesmo que o skill gere o relatório internamente em inglês (é o padrão de vários skills embutidos), o resumo apresentado ao usuário deve ser traduzido/reescrito em português do Brasil antes de ser exibido — nunca colar o relatório em inglês diretamente na resposta.

---

## 1. Encoding do banco de dados: LATIN1

O banco PostgreSQL do cliente usa encoding **LATIN1**. Qualquer string enviada via query SQL deve conter apenas caracteres LATIN1.

**Proibido em strings de query SQL:**
- Travessão `—` (U+2014) → use `-`
- Aspas curvas `"` `"` `'` `'` → use `"` e `'`
- Qualquer caractere fora do intervalo Latin-1 (U+0000–U+00FF)

**Correto:**
```typescript
`Recebimento - ${n} consulta(s)`   // hífen simples
`PIX recebido - consulta`
```

**Errado:**
```typescript
`Recebimento — ${n} consulta(s)`   // travessão quebra em LATIN1
```

---

## 2. Campos de texto: salvar em MAIÚSCULO

Em toda API Route de POST/PATCH que grave em `tab_pessoa` ou qualquer tabela com dados cadastrais, converter campos de texto para maiúsculo usando:

```typescript
const up = (v: string | null | undefined) => v ? v.toUpperCase() : null
```

**NÃO converter para maiúsculo:**
- `email`, `email_nfe`
- `telefone`, `celular`, `whatsapp`
- `chave_pix` (pode ser e-mail como chave)
- Campos numéricos: `cpf_cnpj`, `cep`, valores monetários, `banco_agencia`, `banco_conta`

**CONVERTER para maiúsculo (exemplos):**
- `nome`, `nome_fantasia`, `rg_ie`, `im`
- `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`
- `banco_nome`, `banco_tipo`, `obs`, `descricao`

Na listagem (JSX), aplicar `.toUpperCase()` para dados legados que possam estar sem maiúsculo.

---

## 3. Módulo Clínica — movimentos financeiros

### origem_modulo

Movimentos gerados pelo módulo clínica usam **`origem_modulo = 'CLI'`**:

```typescript
// CORRETO
'CLI', payload.agendamento_id   // origem_modulo, origem_id
```

Nunca usar `'REC'` — essa origem dispara a trigger `fn_processar_recebimento_movimento` que causa duplicação.

### Agrupamento de movimentos

Quando houver múltiplos agendamentos sendo recebidos juntos (lista de espera, check-in com N consultas), gerar **um único movimento financeiro** com o total agregado:

- 1 `tab_titulo_receber` (se parcelado ou crédito) — valor total
- 1 `tab_movimento_caixa` **ou** `tab_movimento_banco` — valor total
- N `tab_recebimento_consulta` (um por agendamento) — valores proporcionais, todos apontando para o mesmo movimento/título

**Nunca** fazer loop enviando N chamadas separadas para a API — isso gera N movimentos distintos e quebra a conciliação bancária.

### Valor por condição de pagamento

O valor do atendimento vem de `tab_agendamento_tipo_categoria` pela categoria do paciente:
- Condição **à vista** (`tipo = 'V'`): usar coluna `valor`
- Condição **a prazo** (`tipo = 'P'`): usar coluna `valor_prazo`
- Fallback: se não houver categoria vinculada, usar `tab_agendamento_tipo.valor`

A query de agendamentos já retorna ambos como `tipo_valor` e `tipo_valor_prazo`.

### Fluxo completo de recebimento (rota POST /api/clinica/recebimentos)

A regra central é determinada por `tab_condicao_pagamento.tipo_pagamento`:

| tipo_pagamento | título a receber | parcelas | movimento caixa/banco |
|----------------|-----------------|----------|-----------------------|
| `'a_prazo'` | SIM — status `'A'` (Aberto) | SIM — N parcelas via `criarParcelasAPrazo()` | **NÃO** |
| `'dinheiro'` / `'debito'` / `'credito'` | NÃO | NÃO | SIM — `tab_movimento_caixa` |
| `'pix'` | NÃO | NÃO | SIM — `tab_movimento_banco` (usa `conta_banco_pix_id`) |

**Regra:** A Prazo = dinheiro ainda não recebido (título fica em aberto). Caixa/banco = dinheiro recebido no ato.

**`status_recebimento` em `tab_recebimento_consulta` é sempre `'PAGO'`** — independente de ser A Prazo ou à vista.

```
BEGIN
  1. Verificar agendamentos existem (empresa_id)
  2. Buscar condição de pagamento (tipo_pagamento, conta_banco_pix_id, num_parcelas, intervalo_dias, entrada_pct)
  3. SE tipo_pagamento = 'a_prazo':
       - INSERT tab_titulo_receber (status='A', data_liquidacao=null, valor_liquidado=0)
       - Chamar criarParcelasAPrazo() → N rows em tab_titulo_receber_parcela
       - SEM movimento
     SENÃO (dinheiro/debito/credito/pix):
       - pix → INSERT tab_movimento_banco (titulo_receber_id=null)
       - outros → INSERT tab_movimento_caixa (titulo_receber_id=null)
       - SEM título
  4. Para cada agendamento → INSERT tab_recebimento_consulta
       (titulo_receber_id, movimento_caixa_id, ou movimento_banco_id conforme o caso)
       status_recebimento = 'PAGO' SEMPRE
  5. UPDATE tab_agendamento SET status='ATENDIDO' WHERE id = ANY(ids)
COMMIT
```

### Parcelas (A Prazo)

```typescript
function criarParcelasAPrazo(titulo_id, dataBase, totalGeral, numParcelas, intervaloDias, entradaPct)
```
- **Com entrada** (`entradaPct > 0`): parcela 1 = entrada na `dataBase`; demais em `dataBase + i * intervaloDias`
- **Sem entrada**: parcelas iguais em `dataBase + i * intervaloDias` (começa em i=1)
- Última parcela ajusta centavos (arredondamento): `totalGeral - acumulado`
- Helper `addDias(dateStr, dias)` usa UTC para evitar DST: `new Date(Date.UTC(y, m-1, d))`

### Estorno (DELETE /api/clinica/recebimentos/[id])

Agrupa por lote antes de deletar — a chave de lote varia:
- Caixa: `movimento_caixa_id`
- Banco: `movimento_banco_id`
- A Prazo: `titulo_receber_id` (sem movimento)

Sequência obrigatória dentro da transação:
```
1. DELETE tab_recebimento_consulta WHERE id = ANY(todosIds)
2. UPDATE tab_titulo_receber SET movimento_* = NULL (se tituloId)
3. DELETE tab_movimento_caixa (se movCaixaId)
4. DELETE tab_movimento_banco (se movBancoId)
5. DELETE tab_titulo_receber_parcela WHERE titulo_id = tituloId   ← OBRIGATÓRIO antes do título
6. DELETE tab_titulo_receber WHERE id = tituloId
```

`tab_titulo_receber_parcela.titulo_id` tem FK **sem CASCADE** — deletar o título antes das parcelas causa constraint violation.

### Frontend — agrupamento de estorno (recebimentos/page.tsx)

`AgendamentoListItem` inclui `titulo_receber_id` (retornado pela query de agendamentos).

Chave de lote no Map:
```typescript
ag.movimento_caixa_id  ? `caixa-${ag.movimento_caixa_id}`
: ag.movimento_banco_id ? `banco-${ag.movimento_banco_id}`
: ag.titulo_receber_id  ? `titulo-${ag.titulo_receber_id}`   // A Prazo
: `rec-${ag.recebimento_id}`
```

### Agendamento pago não pode ser editado direto (AgendamentoModal.tsx)

Regra de negócio (2026-07-21): se `agendamento.status_recebimento === 'PAGO'`, o modal de edição de agendamento (`components/clinica/AgendamentoModal.tsx`) abre em modo somente leitura — não é permitido reagendar horário, trocar profissional/paciente/tipo/status/categoria nem excluir enquanto o pagamento estiver ativo. Para editar, o usuário precisa estornar o pagamento primeiro (o que também desfaz `status`, movimento e título — ver seção "Estorno" acima).

- `jaFoiPago = isEdit && agendamento?.status_recebimento === 'PAGO'` — computado no topo do componente.
- Banner verde logo abaixo do header mostrando "Pagamento já realizado — R$ X" quando `jaFoiPago`.
- Todos os campos do formulário ficam dentro de um único `<fieldset disabled={jaFoiPago} style={{ display: 'contents' }}>` envolvendo o corpo do modal — trava paciente/profissional/data/horários/tipo/status/categoria/observação de uma vez só (atributo HTML nativo de `fieldset`, cascade automático pros `<input>/<select>/<textarea>/<button>` descendentes; `display: 'contents'` evita que o fieldset quebre o layout flex do container pai).
- Footer troca "Excluir" + "Salvar alterações" por um único botão "Estornar pagamento" (chama `DELETE /api/clinica/recebimentos/[recebimento_id]` com `motivo_estorno` via `window.prompt`, mesmo endpoint da tela de Recebimentos). Sucesso → `onSaved()` + `onClose()`; reabrir o mesmo agendamento depois já vem editável normalmente (status_recebimento volta a `null`).

### Listagem Títulos a Receber (GET /api/financeiro/titulos-receber)

JOIN com `tab_titulo_receber_parcela parc ON parc.titulo_id = t.id`:
- Título **sem** parcelas → 1 linha (valores do próprio título)
- Título **com** parcelas → N linhas, uma por parcela (vencimento, valor e status da parcela)
- `numero_titulo` das parcelas: `t.numero_titulo || '/' || parc.numero_parcela`
- Filtros de status/data usam `COALESCE(parc.campo, t.campo)`
- SELECT também expõe `parc.id AS parcela_id` e `parc.numero_parcela` — usados pelo frontend para distinguir linha-de-parcela de linha-de-título-sem-parcela

### Baixa/Estorno por parcela (PATCH /api/financeiro/titulos-receber/[id]/parcelas/[parcela_id])

**Problema que essa rota resolve:** dar baixa em um título A Prazo parcelado deve baixar UMA parcela por vez, não o valor total do título. Só fechar (`status='L'`) o título quando TODAS as parcelas estiverem liquidadas.

Body: `{ action: 'baixa', data_baixa?: string }` ou `{ action: 'estorno' }`.

```
baixa:
  1. UPDATE tab_titulo_receber_parcela SET status='L' WHERE id=parcela_id
  2. Conta parcelas com status='A' restantes no título
  3. SE zero restantes:
       UPDATE tab_titulo_receber SET status='L', data_liquidacao=dataBaixa,
              valor_liquidado = SOMA(valor+valor_juros de TODAS as parcelas)
       — destino_liquidacao fica NULL de propósito: a trigger fn_trigger_liquidar_titulo_receber
         só cria movimento_caixa/banco se destino_liquidacao estiver setado, e aqui NÃO queremos
         criar movimento (parcela A Prazo nunca gera movimento, ver seção "Fluxo de recebimento")
     SENÃO:
       UPDATE tab_titulo_receber SET valor_liquidado = SOMA(valor+valor_juros das parcelas 'L')
       — status do título permanece 'A'

estorno:
  1. Guarda IDs das outras parcelas com status='L' (exceto a que está sendo estornada)
     — necessário porque a trigger de estorno do título reabre TODAS as parcelas
  2. UPDATE tab_titulo_receber_parcela SET status='A' WHERE id=parcela_id
  3. SE título.status='L':
       UPDATE tab_titulo_receber SET status='A', data_liquidacao=NULL, valor_liquidado=0,
              destino_liquidacao=NULL, conta_banco_liq_id=NULL
       — dispara fn_trigger_estorno_titulo_receber (exclui movimento se houver, reabre TODAS as parcelas)
  4. Re-liquida (status='L') as parcelas guardadas no passo 1 — desfaz o reabrir-tudo da trigger
  5. Recalcula valor_liquidado do título a partir das parcelas 'L' remanescentes
```

**Frontend (`app/(erp)/financeiro/contas-receber/page.tsx`):** coluna "Ações" com botão "Baixar" (status='A') ou "Estornar" (status='L'), visível só quando a linha tem `parcela_id`. `e.stopPropagation()` obrigatório no `<td>`/botão para não disparar o `onClick` de navegação da `<tr>`.

**`TituloReceberFormPage.tsx`:** os botões "Receber"/"Estornar" em nível de título (que operam no título inteiro) só aparecem quando `temParcelas=false` — evita bypassar a lógica por parcela e reintroduzir o bug de baixar o valor total. A página `[id]/page.tsx` calcula `temParcelas` via `COUNT(*) FROM tab_titulo_receber_parcela WHERE titulo_id=$1` e passa como prop.

---

## 4. Status dos agendamentos

| Status | Significado |
|--------|-------------|
| `AGENDADO` | Marcado, não confirmado |
| `CONFIRMADO` | Confirmação recebida |
| `AGUARDANDO` | Check-in feito, aguardando atendimento |
| `ATENDIDO` | Consulta realizada (após recebimento) |
| `FALTOU` | Não compareceu |
| `CANCELADO` | Cancelado |

---

## 5. Migrations SQL

Novos arquivos de migration ficam em `novos/` com prefixo numérico sequencial:
```
novos/21_fix_trigger_recebimento.sql
novos/22_proxima_alteracao.sql
```

Todo migration deve começar com:
```sql
SET client_encoding = 'LATIN1';
```

---

## 6. Triggers ativas (não duplicar)

| Trigger | Tabela | Dispara quando | Faz |
|---------|--------|----------------|-----|
| `trg_cli_caixa_status` | `tab_movimento_caixa` | INSERT com `origem_modulo='CLI'` | Atualiza agendamento para ATENDIDO |
| `trg_cli_banco_status` | `tab_movimento_banco` | INSERT com `origem_modulo='CLI'` | Atualiza agendamento para ATENDIDO |
| `trg_movimento_caixa_recebimento` | ~~removida~~ | ~~`origem_modulo='REC'`~~ | ~~criava recebimento (causava bugs)~~ |

**Para A Prazo não há movimento**, então nenhuma trigger de movimento dispara. O fluxo é 100% gerenciado pelo código da rota POST.

## 7. Migrations obrigatórias para o módulo clínica

| Arquivo | O que faz | Obrigatório para |
|---------|-----------|-----------------|
| `21_fix_trigger_recebimento.sql` | Remove trigger antiga `fn_processar_recebimento_movimento`, cria `fn_guardar_status_agendamento_cli` | Evitar duplicação de recebimento |
| `23_add_aprazo_tipo_pagamento.sql` | Adiciona `'a_prazo'` ao CHECK de `tab_condicao_pagamento.tipo_pagamento` | A Prazo funcionar (sem isso: constraint violation) |

Todo migration começa com `SET client_encoding = 'LATIN1';`

---

## 8. Migrations criando tabela nova: SEMPRE fazer GRANT para a role do tenant

**Armadilha real que já aconteceu em produção:** toda migration roda com o usuário admin (`user_dba`), que é o *owner* de qualquer tabela que cria. Owner nunca é bloqueado por permissão, então testar localmente com `user_dba` **nunca revela** um problema de GRANT — o bug só aparece em produção, onde a aplicação conecta com uma role de aplicação de baixo privilégio (mesmo nome do database, ex: role `hiitcor` para o database `hiitcor`).

Se a migration cria uma tabela nova (`CREATE TABLE`) e não concede acesso a essa role, a API quebra em produção com **500 sem corpo de erro** (Next.js esconde a exceção em produção) mesmo a tabela existindo, com colunas certas, e a mesma query funcionando perfeitamente via `user_dba`. Só aparece checando `information_schema.role_table_grants` — outras tabelas antigas têm grant, a nova não.

**Toda migration que faz `CREATE TABLE` deve terminar com um GRANT dinâmico** (a role de app tem o mesmo nome do database):

```sql
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON nome_da_tabela_nova TO %I', app_role);
  END IF;
END $$;
```

`ALTER TABLE ... ADD COLUMN` em tabela já existente **não precisa disso** — os grants de tabela já cobrem colunas novas automaticamente.

## 9. Prontuário clínico + integração Voa (referência rápida)

- **`tab_prontuario`**: 1:1 com `tab_agendamento` (`UNIQUE(agendamento_id)`), upsert via `ON CONFLICT (agendamento_id) DO UPDATE` em `POST /api/clinica/prontuarios`. Campos clínicos (queixas, HDA, antecedentes, exame físico, diagnóstico, medicação etc.) **não** passam pela regra de maiúsculo da seção 2 — é texto narrativo do profissional, preserva o case original. Tem `peso` (NUMERIC 5,2) e `imc` (NUMERIC 4,2) além dos campos de texto.
  - **Armadilha já corrigida (2026-07-28):** os campos de texto livre do prontuário vêm de textarea sem restrição de caracteres, mas o banco é LATIN1 (§1) — travessão, aspas curvas, reticências ou emoji colados (Word, celular) quebravam o INSERT com **500 sem corpo de erro**. Corrigido em `lib/validators/prontuario.schema.ts`: a função `paraLatin1()` normaliza os equivalentes tipográficos comuns (`—`→`-`, aspas curvas→retas, `…`→`...`) e descarta qualquer caractere fora do intervalo Latin-1 antes de gravar. Aplica-se a todos os campos de texto do schema, inclusive `pressao`.
- **Consultas do paciente**: `GET /api/clinica/agendamentos?paciente_id=X&status=ATENDIDO`. UI em `components/clinica/HistoricoClinico.tsx` — timeline expansível dentro da aba "Consultas" do cadastro de pessoas.
  - `carregar()` busca cada endpoint (agendamentos, prontuários, receitas, receitas-sistema, anexos, atestados) **independentemente** — uma falha isolada em um deles (ex: 500 de permissão numa tabela nova, ver §8) não pode zerar o resto do histórico que carregou normalmente (já aconteceu: anexos derrubava tudo). Ver helper `buscar()` no topo de `carregar()`.
- **Anexos de exame** (`tab_prontuario_anexo`, 1 agendamento → N anexos): arquivo vai pro volume Railway via `lib/storage.ts` (ver §18), metadado no banco. Rotas `app/api/clinica/prontuarios/anexos/(route.ts|[id]/route.ts)`. Botão "Anexar exame" em `HistoricoClinico.tsx` salva no nosso banco **e**, se a Voa estiver com sessão `ready` naquela consulta, também chama `voaRef.current.uploadFiles([file])` (exposto por `VoaPluginView` via `forwardRef`/`useImperativeHandle`) — mesmo arquivo nos dois lugares, numa ação só.
  - `tab_prontuario_anexo` foi criada (migration 47) **sem** o GRANT retroativo pra role do tenant — corrigido depois na mesma migration. Se algum dia aparecer 500 mudo nas rotas de anexo, checar `information_schema.role_table_grants` primeiro (armadilha clássica da §8).

### Integração Voa (assistente de gravação/IA) — `components/clinica/VoaPluginView.tsx`

Config em `tab_empresa.voa_auth_token` + `voa_ambiente` (`desenvolvimento`/`producao`), aba "Integração" do cadastro de empresa — nunca fixar token em env var.

- `POST /api/voa/token` gera o token: em `desenvolvimento` devolve o Auth Token bruto; em `producao` tentaria trocar por Bearer Token via `/integration/identify/`, mas essa troca **não passou na validação** nos testes (401) — confirmar com `integration@voahealth.com` antes de produção de verdade.
- `VoaPlugin` (script `plugin.js`) é uma **classe**: sempre `VoaPlugin.instance.init(...)`/`.mount(...)`, nunca `VoaPlugin.init(...)` direto.
- Callbacks passados pro `VoaPluginView` (`onDadosExtraidos`, `onFechar`, etc.) vão sempre num `useRef` interno, nunca direto na dependency array do `useEffect` de mount — senão o widget remonta a cada re-render do pai (cada tecla digitada no form).

**Opções do `mount()` — armadilhas já resolvidas, não regredir:**
- `enableFillEhr: true` **é obrigatório**. Com `false`, o botão "Preencher prontuário" cai num fluxo de "clique para colar" baseado em `clipboard.read()` que dá `NotAllowedError` (permissão do navegador). Com `true`, ele dispara mensagem (`ehr.fill` + `structured_output`) — sem erro.
- `allowChangeConsultationType: false` — trava a modalidade em `consultationType` fixo (clínica é só presencial); sem isso a Voa mostra uma tela extra "Modalidade do atendimento" antes de gravar.
- `enableFileUpload: true` — habilita upload de exame **dentro da própria UI da Voa** (vai pro pipeline dela, não pro nosso banco; ver "Anexos" acima pra isso ficar nos dois lugares).
- `clinicalType` — **não documentado pro SDK** (só documentado pra instalação via iframe alternativa, que não usamos). Setamos mesmo assim porque testes empíricos não quebraram nada. Valor vem de `tab_agendamento_tipo.voa_clinical_type` (configurável na tela Tipo de Atendimento — dropdown com os 26 modelos da página "Modelos" da doc da Voa), fallback pro código é `'anamnesisCardiology'` se o tipo não tiver nada configurado. **Nunca hardcodear um valor fixo aqui de novo** — é por isso que existe a coluna.

**Mensagens (`addMessageListener`) — formato real, não o que a doc "óbvia" sugere:**
- `voa.plugin.ehr.structured_output`: `eventData` é `{ output: {...}, from_cache: boolean }` — os campos clínicos ficam **dentro de `output`**, não soltos em `eventData` direto. **Bug já cometido uma vez** (`Object.entries(eventData)` em vez de `Object.entries(eventData.output)`) — o preenchimento automático via IA ficou semanas sem funcionar silenciosamente (nenhum erro, só nunca populava nada) até essa doc oficial ser revisada. Ao mexer nesse handler, sempre confirmar contra a doc "Comunicação com a página" da Voa, não assumir o shape.
- `voa.plugin.ehr.fill`: `eventData.document` (markdown do documento inteiro) + `eventData.template`. Documentado.
- `voa.plugin.ehr.document.copied` (botão "Copiar todo o documento"): a doc oficial não define `eventData` nenhum pra esse evento, mas **na prática** ele chega com o texto do documento *direto* em `eventData` (string crua, não objeto) — confirmado no console. Tratamento em `extrairTextoDocumento()` cobre os dois formatos (string direta e objeto com chave `document`/`content`/etc) e loga um aviso se não reconhecer, pra pegar rápido se a Voa mudar o formato de novo.
- `voa.plugin.ehr.document.created`: só `{id, created_at}` — **nunca** traz o texto do documento, não tentar extrair texto daí.
- `voa.plugin.ehr.created`: dispara uma vez, `eventData.id` é o **uuid da Voa** pro atendimento — salvo em `tab_agendamento.voa_atendimento_id`/`voa_atendimento_tipo` via `POST /api/voa/atendimento`, só rastreabilidade/auditoria (não crítico, falha é silenciosa).
- `voa.plugin.closed`: chama o mesmo callback de fechar do usuário (`onFechar`) — evita o botão continuar oferecendo "Retomar Voa" pra uma sessão que a própria Voa já encerrou do lado dela.
- `voa.plugin.file.upload.success`/`.error`: só feedback via toast (nome do arquivo, ou `eventData.error.message`).

**Schema (`structuredOutputSchema`) usa campos especiais da Voa em vez de `type:'string'` genérico:**
- Diagnóstico: `{ type:'array', items: { $ref: '#/$defs/CID' } }` → volta `[{code, description}]`, formatado em texto "CODE — descrição" (`formatarDiagnosticosCID`).
- Peso/IMC: `{ $ref: '#/$defs/AnthropometricData' }` → volta `{weight, height, imc}` (kg/cm), `formatarDadosAntropometricos` usa `weight`→`peso` e `imc`→`imc` (altura ainda sem campo no prontuário).

**Ciclo de vida da sessão — evita misturar dados entre consultas/pacientes:**
- Só uma instância montada por vez (`voaMontadoId` no `HistoricoClinico.tsx`, um valor só, nunca por-agendamento).
- Trocar de consulta enquanto a Voa está `ready` (gravando) numa outra: `iniciarEdicao()` força desmonte da sessão anterior — se `voaGravando` (status espelhado do filho via `onStatusChange`), pede confirmação antes (perder gravação sem copiar o documento).
- Fechar (botão "Fechar" no painel ou "Encerrar gravação") também confirma se `status==='ready'` — só não confirma quando é a própria Voa quem encerrou (`voa.plugin.closed`, sem gesto do usuário, não tem porque perguntar).

## 10. `novos/` nunca entra no build do Next

`tsconfig.json` tem `"exclude": ["node_modules", "novos"]`. A pasta `novos/` é só rascunho/referência (migrations `.sql`, scaffolds de integrações futuras tipo Memed) — nunca importada pelo app real. Sem esse exclude, qualquer `.tsx` incompleto lá dentro (import quebrado, código de exemplo) quebra o `next build` de produção mesmo sem nunca ter sido usado.

---

## 12. Cartão de crédito — parcelamento e MDR por faixa de parcelas

- `tab_condicao_pagamento.num_parcelas`: quando `tipo_pagamento='credito'`, o campo deixa de ser "parcelas fixas" e passa a ser o **máximo de parcelas** que o operador pode escolher no recebimento (1x até esse limite). As rotas `condicoes-pagamento` (POST/PATCH) tratam isso com `isCredito = tipo_pagamento === 'credito'` **antes** de aplicar a regra antiga `tipo==='V' → força num_parcelas=1` — não deixar essa regra antiga voltar a pisar em condição de crédito.
- `num_parcelas` tem `.max(360)` no zod (`lib/validators/condicao-pagamento.schema.ts`) porque esse valor alimenta `Array.from({length: num_parcelas})` no dropdown de parcelas do `RecebimentoModal` — sem limite, um valor absurdo trava o navegador.
- `tab_taxa_cartao` **não tem mais vigência por data** (decisão de negócio, migration 44): existe **uma taxa por `condicao_pagamento_id` + faixa de parcelas** (`parcelas_de`/`parcelas_ate`, índice único `uq_taxa_cartao_condicao_parcelas`). Salvar = upsert (`ON CONFLICT ... DO UPDATE`), nunca cria histórico/nova linha. `fn_taxa_cartao_vigente(condicao_pagamento_id, qtd_parcelas)` acha a faixa que contém `qtd_parcelas` (faixa mais estreita primeiro).
- `RecebimentoModal.tsx`: o operador só escolhe quantas parcelas usar quando `tipo_pagamento==='credito' && num_parcelas > 1` (`isCreditoParcelavel`). Débito é sempre 1x. O servidor clampa (`Math.min/Math.max`) e a trigger `fn_trg_venda_cartao_auto` valida de novo no banco (`RAISE EXCEPTION` se fora do intervalo permitido) — são duas camadas de defesa, não remover nenhuma das duas.
- `POST` e `PATCH` de `/api/financeiro/cartao/taxas` **precisam** confirmar que o `condicao_pagamento_id` recebido pertence à `empresa_id_ativa` antes de gravar (já existia no POST; o PATCH ganhou essa checagem em 2026-07 — sem ela dá pra reapontar uma taxa pra condição de outra empresa).
- Migrations `novos/43_taxa_cartao_por_parcela.sql` e `novos/44_taxa_cartao_sem_vigencia.sql` já aplicadas no banco remoto compartilhado (`hiitcor`).
- **`parcelas_de`/`parcelas_ate` de `tab_taxa_cartao` NÃO é regra de limite de parcelamento** — é só a faixa que decide qual MDR (%) aplicar pra aquele número de parcelas (`fn_taxa_cartao_vigente`). Quem limita quantas parcelas o operador pode escolher é exclusivamente `tab_condicao_pagamento.num_parcelas`. Se `num_parcelas` (máximo) ficar maior que o `parcelas_ate` cadastrado em `tab_taxa_cartao`, a venda quebra com `Nenhuma taxa cadastrada pra condicao X (Y parcelas)` — ao investigar "aceita mais parcelas do que devia", checar sempre `num_parcelas` primeiro, não a faixa de taxa.
- **Armadilha de UX em `CondicaoPagamentoFormPage.tsx`**: a tela tem dois botões de salvar independentes lado a lado — **"Salvar"** (toolbar do topo) grava `num_parcelas` em `tab_condicao_pagamento`; **"Atualizar Taxa"** (dentro de `TaxaCartaoInline`, fieldset MDR) grava só `parcelas_de/parcelas_ate/percentual_mdr` em `tab_taxa_cartao` — tabela diferente. É fácil o usuário digitar um novo valor em "Parcelas Máximas", clicar só em "Atualizar Taxa" (por estar mais perto/mais recente na tela) e sair achando que salvou, enquanto `num_parcelas` continua com o valor antigo no banco. Sintoma real já visto em produção: tela mostrando "Parcelas Máximas: 1" mas `tab_condicao_pagamento.num_parcelas` ainda em 6 — sistema aceitando até 6x. Ao depurar "condição configurada pra X mas aceitando Y", sempre confirmar o valor **direto no banco**, não confiar no que a tela exibe (pode ser estado não persistido).

## 13. Ciclo de vida da venda no cartão (Fatura de Cartão)

`tab_venda_cartao` nasce automaticamente (nunca via formulário manual) sempre que um recebimento usa condição débito/crédito — trigger `fn_trg_venda_cartao_auto` (BEFORE INSERT) deriva adquirente/bandeira/modalidade/MDR aplicado, e `fn_trg_venda_cartao_parcelas` (AFTER INSERT) gera as linhas de `tab_venda_cartao_parcela`.

Status da parcela: `PENDENTE → FATURADA → CONCILIADA`

| Transição | Onde acontece | O que faz |
|---|---|---|
| `PENDENTE → FATURADA` | Tela **Faturas de Cartão** → "Gerar Faturas" (`GET/POST /api/financeiro/cartao/faturas/gerar`) | GET só lista parcelas com `data_prevista <= hoje`. `fn_gerar_faturas_cartao_selecao` agrupa a seleção em `tab_fatura_cartao` (status `ABERTA`) por conta+adquirente+data_prevista |
| `FATURADA → CONCILIADA` | `POST /api/financeiro/cartao/faturas/[id]/confirmar` | `fn_confirmar_fatura_cartao` cria `tab_movimento_banco` (`origem_modulo='CARTAO'`) — só aqui o dinheiro vira saldo bancário de verdade |
| Estorno | `POST /api/financeiro/cartao/faturas/[id]/estornar` | `fn_estornar_fatura_cartao` desfaz (bloqueia se já conciliado com extrato OFX) |

`tab_venda_cartao.status` só tem `PENDENTE|CANCELADO` — o progresso real está nas parcelas. `status_parcelas` (calculado dinamicamente na API de listagem `GET /api/financeiro/cartao/vendas`) resume: `CONCILIADA / FATURADA / PARCIAL / PENDENTE / CANCELADO`.

**Parcela "esquecida"**: se `data_prevista` passa e a parcela continua `PENDENTE` (ninguém gerou fatura pra ela), ela some silenciosamente da projeção de 30 dias do fluxo de caixa (que só olha pra frente) — não é bug, é o filtro de data descrito na seção 14. O alerta "Cartão em Atraso" cobre exatamente esse caso.

## 14. Fluxo de caixa gerencial — regras da projeção e do KPI de cartão

`app/api/gerencial/fluxo-caixa/route.ts`:
- **Projeção "Próximos 30 dias"** é estritamente prospectiva (`data_vencimento`/`data_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 dias`) nos três blocos do UNION (`tab_titulo_receber`, `tab_titulo_pagar`, `tab_venda_cartao_parcela`). Datas no passado (vencidas/atrasadas) ficam de fora da projeção **por design** — não confundir com bug ao investigar "por que esse valor não aparece".
- KPI `aReceberCartao` soma parcelas `PENDENTE`/`FATURADA` de vendas `PENDENTE`, **sem** filtro de data (inclui atrasadas, mas sem separar).
- KPI `aReceberCartaoAtrasado`/`nCartaoAtrasado` (adicionado 2026-07-17): subconjunto `status='PENDENTE' AND data_prevista < CURRENT_DATE` — repasse que a operadora deveria ter feito e que **nem foi agrupado em fatura ainda**. Parcela `FATURADA` com data passada não conta como atrasada (é estágio normal, só aguardando o usuário confirmar a fatura).
- Banner de alerta na tela (`app/(erp)/gerencial/fluxo-caixa/page.tsx`) segue o mesmo padrão visual pros dois casos: títulos vencidos (`vw_titulos_receber_abertos`/`vw_titulos_pagar_abertos`, coluna `vencido`) e cartão em atraso (link pra `/financeiro/cartao-faturas`).

## 15. Padrão visual `.form-fieldset` — armadilha da borda esticada

Toda tela de cadastro usa `<fieldset className="form-fieldset"><legend><Icon size={12}/> Título</legend><div className="form-fieldset-body">...</div></fieldset>` (classe global definida em `app/globals.css`) pra dar borda+cor de fundo em cada seção de campos.

**Armadilha (aconteceu várias vezes nesta sessão):** quando a tela tem duas colunas lado a lado (`display:flex`) e só uma vira fieldset, o `flex:1` **não pode ir direto no `<fieldset>`** — isso faz a borda esticar pra preencher toda a altura do container irmão ("borda gigante"). Estrutura correta:

```tsx
<div style={{ flex: 1, minWidth: 0 }}>
  <fieldset className="form-fieldset">
    <legend><Icon size={12} /> Dados Gerais</legend>
    <div className="form-fieldset-body">
      {/* campos */}
    </div>
  </fieldset>
</div>
```

`flex:1` fica na `div` externa; o fieldset em si não recebe flex/altura — ele fica com altura de conteúdo (auto), igual à coluna vizinha.

**Ao migrar uma tela pra esse padrão, revisar TODAS as colunas/abas, não só a mais óbvia** — em pelo menos 6 telas (`CentroCustoFormPage`, `TipoDespesaFormPage`, `TipoReceitaFormPage`, `PlanoContasFormPage`, `TipoAtendimentoFormPage` incluindo a aba "Valores p/ Categoria", `DespesaFormPage`/`ReceitaFormPage` nas abas Parcelas/Rateio, `VendaCartaoFormPage`) uma passada anterior só tinha convertido a coluna/aba secundária, deixando a coluna/aba principal (a com os campos de fato) sem borda.

## 16. Deploy: commitar features multi-arquivo por completo, não aos pedaços

Já aconteceu de commitar uma rota de API que dependia de um schema (`lib/validators/*.schema.ts`) sem commitar o schema junto — `tsc --noEmit` local não acusa (o working tree tem os dois arquivos), mas o build do Railway/CI só vê o que foi de fato commitado e pushado, e quebra com erro de tipo confuso (parece um erro no arquivo certo, mas a causa é um arquivo-irmão que ficou de fora). Ao commitar uma feature que toca `schema.ts` + `route.ts` + `types.ts` + componente, sempre conferir com `git status`/`git diff --stat` se todos os arquivos interdependentes foram staged juntos antes de fazer push — separar por assunto (seção de commits) não pode virar separar arquivos que dependem uns dos outros.

---

## 17. PENDÊNCIA — login em produção 500 (PG_USER sem acesso a `saas_control`)

> **AJUSTAR QUANDO SOLICITADO.** Buscar por "PENDÊNCIA" neste arquivo para achar rápido.

Diagnosticado em 2026-07-10 (Railway, `erpclinica-production-5963`). POST `/api/auth/login` dava 500 sem log.

**Causa raiz confirmada por teste direto de conexão:** em produção, `PG_USER`/`PG_PASSWORD` estão configurados com credenciais **do tenant** (`hiitcor`), que só têm `pg_hba.conf` liberado para o database `hiitcor`. `dbControl` ([lib/db/index.ts:29](lib/db/index.ts#L29)) conecta sempre no database `saas_control` (compartilhado, tem `tab_instancia`) — com a role `hiitcor` isso falha com `no pg_hba.conf entry for host ..., user "hiitcor", database "saas_control"`. Local funciona porque `.env.local` usa `PG_USER=user_dba` (admin, acesso a tudo).

**Ação pendente:** trocar `PG_USER`/`PG_PASSWORD` no Railway para as credenciais do usuário admin (`user_dba`), ou liberar a role `hiitcor` no `pg_hba.conf` para o database `saas_control` também.

**Relacionado, ainda pendente de decisão do usuário:**
- [middleware.ts:5](middleware.ts#L5) tem `DEV_NO_AUTH = true` hardcoded (não lê mais env var) desde commit `6e86bf8` (2026-07-01) — desativa autenticação do ERP em produção para todas as rotas exceto `/admin`. Perguntar antes de reverter.
- `JWT_SECRET` de produção foi colado em texto puro nesta conversa — considerar comprometido; rotacionar com `openssl rand -hex 64` quando o login estiver resolvido (invalida sessões ativas).
- [app/api/auth/login/route.ts](app/api/auth/login/route.ts) já ganhou `try/catch` com `console.error('[login] erro interno:', err)` — manter esse padrão de log ao mexer nessa rota, senão erros voltam a ser 500 mudo.

---

## 18. Volume Railway para upload de arquivos (implementado 2026-07-22 — anexos de prontuário)

Volume persistente no Railway, montado em **`/data/uploads`** no serviço do app (Next.js). Env var é **`UPLOADS_DIR`** (plural — não `UPLOAD_DIR`, que era o nome planejado antes de implementar; se for configurar no Railway, confirmar o nome certo `UPLOADS_DIR`). Sem a env var, o código cai no default hardcoded `/data/uploads` — funciona igual em produção, só evita quebrar se a env var não foi setada.

**Implementado**: `lib/storage.ts` (`salvarArquivo`/`lerArquivo`/`removerArquivo`/`caminhoRelativoAnexo` — sanitiza nome de arquivo contra path traversal). Usado por `tab_prontuario_anexo` (anexos de exame por consulta, ver seção 9) via `app/api/clinica/prontuarios/anexos/(route.ts|[id]/route.ts)`.

Em dev local (Windows), `.env.local` sobrescreve com `UPLOADS_DIR=./uploads-dev` (pasta relativa, `.gitignore`d) — o path absoluto `/data/uploads` não existe fora do Railway.

**Restrição do volume Railway**: preso a **uma única réplica** — não persiste em ambiente com múltiplas instâncias/escala horizontal do mesmo serviço. Como o serviço hoje é single-instance, sem problema, mas checar isso antes de qualquer decisão de escalar.

---

## 19. Recuperação de senha por e-mail (implementado 2026-07-23)

Portado do padrão do projeto irmão `digitalrf-help` (Resend + JWT stateless), adaptado pro multi-tenant do ERP.

**Diferença-chave vs. `digitalrf-help`:** lá é banco único, aqui cada cliente tem seu próprio database (`tab_instancia.database_name`). O token de reset carrega `database_name` junto (não só `usuario_id`), porque e-mail não é único entre tenants — sem isso não daria pra saber em qual banco fazer o `UPDATE` na hora de redefinir.

**Arquivos:**
- `lib/email/resend.ts` — client Resend; `EMAIL_FROM`/`EMAIL_REPLY_TO` via env (default `VitaRF <noreply@digitalrf.com.br>`)
- `lib/email/send.ts` — `emailRecuperacaoSenha({email, nome, token})`, template HTML inline
- `types/session.ts` — `PasswordResetToken { type:'password_reset', usuario_id, database_name }`
- `lib/auth/jwt.ts` — `Payload` union ganhou `PasswordResetToken`; guard `isPasswordResetToken()`
- `POST /api/auth/recuperar-senha` — recebe `{slug, email}` (não só email — precisa do slug pra resolver o tenant via `dbControl`). Sempre responde `{ok:true}` mesmo se slug/e-mail não existir (anti-enumeração), só retorna erro em falha real de envio
- `POST /api/auth/redefinir-senha` — recebe `{token, senha}`, valida `isPasswordResetToken`, resolve `getDb(database_name)` do payload e faz `UPDATE tab_usuario SET senha_hash`
- `app/(auth)/recuperar-senha/page.tsx` e `.../redefinir-senha/page.tsx` — telas no estilo do login (`card`/`input-field`/`btn-primary`, ver `app/globals.css`)
- Link "Esqueci minha senha" adicionado em `app/(auth)/login/page.tsx`

**Env necessárias** (`.env.example`): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. Trocar de domínio/remetente depois é só mudar essas envs, sem tocar código.

**Config atual (dev local, `.env.local`):** reaproveitando a mesma `RESEND_API_KEY` e domínio `digitalrf.com.br` já verificado no `digitalrf-help` — mesma conta Resend. **Atenção:** essa key está num plano com cota baixa (`x-resend-daily-quota: 4`, `x-resend-monthly-quota: 40` visto no header de resposta) — insuficiente pra produção com vários clientes, checar/trocar de plano antes de ir pra produção.

**Não testado ainda:** fluxo feliz ponta-a-ponta (usuário real recebe e-mail → clica → redefine). Testado apenas: páginas carregam, slug/e-mail inexistente não vaza informação, envio Resend funciona (teste manual), token inválido/senha curta retornam 400. Evitei mandar e-mail de teste pro único usuário real do tenant de teste (`hiitcor` / `Josevicente@live.com`) ou criar usuário fake no banco remoto compartilhado sem combinar antes — se for validar o fluxo completo, decidir com o usuário qual conta de teste usar.

**Revisão de segurança/desempenho (2026-07-23) — 2 falhas reais corrigidas:**
1. **Rate limiting ausente** — nada impedia flood em `/api/auth/recuperar-senha`, e a cota do Resend é de só 4 e-mails/dia (ver acima): um script simples esgotaria o envio pro dia inteiro pra todos os clientes. Corrigido com `lib/rate-limit.ts` (limitador em memória — Map por chave/janela; ok porque o serviço roda numa única réplica no Railway, ver seção 18). Limites aplicados: `recuperar-senha` — 5/15min por IP **e** 3/hora por combinação slug+email; `redefinir-senha` — 10/15min por IP (protege o `bcrypt.hash` de custo de CPU contra flood).
2. **Token de reset reutilizável** — o JWT stateless valia por 1h inteira mesmo depois de já ter sido usado pra redefinir a senha uma vez; se o e-mail antigo fosse comprometido dentro da janela, dava pra resetar de novo. Corrigido sem precisar de tabela nova: o token agora carrega `pwd_v` (fingerprint sha256 do `senha_hash` no momento da emissão). Ao redefinir, comparamos com o `senha_hash` atual — se já mudou (por este link ou por qualquer outro meio), o token vira inválido automaticamente. Efeito colateral bom: também invalida um link antigo se a senha for trocada por outra via (ex: admin resetou manualmente).

**Risco já conhecido, não corrigido (decisão consciente):** o token de reset é assinado com o mesmo `JWT_SECRET` das sessões de login — que a seção 17 já registra como possivelmente comprometido. Um secret vazado aqui é pior que pra sessão (dá reset de senha = takeover persistente, não só acesso temporário). Rotacionar o `JWT_SECRET` continua pendente de decisão do usuário (invalida sessões ativas).

## 19a. Logo da empresa no agendamento (implementado 2026-07-23) — revisão de carregamento

Primeira versão buscava a logo (`tab_empresa.logo_base64`, data URL ~200KB) embutida no JSON de `GET /api/auth/me` — que é chamado em 3 páginas (`agendamento`, `sala-espera`, `usuarios`), então as outras duas passaram a baixar a logo inteira sem nunca exibi-la, sem cache algum (JSON de sessão não é cacheável).

**Corrigido:** logo agora é servida por endpoint dedicado `GET /api/cadastro/empresas/logo`, que decodifica o data URL e devolve bytes binários com `Content-Type` real + `Cache-Control: private, max-age=300` — o `<img src="/api/cadastro/empresas/logo">` vai direto no JSX (sem fetch/state), o navegador cacheia nativamente entre navegações, e só a página que realmente mostra a logo paga o custo. `/api/auth/me` voltou a ser leve (~200 bytes, era ~200KB). Componente controla exibição com `logoStatus` (`loading|ok|error`) via `onLoad`/`onError` da própria tag — sem logo cadastrada, o bloco inteiro some (não cai pra logo do sistema).

---

## 20. Voa — "Contexto do atendimento" (histórico do paciente enviado à IA, implementado 2026-07-28)

**Objetivo:** a Voa grava e transcreve a consulta, mas às vezes é útil dar a ela informação clínica que não vem da fala — histórico de consultas anteriores, alergias, medicação em uso. A própria Voa tem um campo nativo pra isso ("Contexto do atendimento" → "Contexto do paciente"), mas não é óbvio como preenchê-lo programaticamente.

**Duas abordagens investigadas — só uma ficou:**

1. **`window.VoaPlugin.instance.addBackgroundHistory(markdown, sobrescrever)` (frontend, JS do SDK) — abandonada.** Existe de fato (confirmado inspecionando o bundle minificado do `plugin.js`, método não documentado publicamente), mas só funciona se o componente React interno da Voa que registra o callback (`setOnAddBackgroundHistoryCallback`) já estiver **montado** — o que só acontece depois que o profissional abre manualmente a aba "Contexto do atendimento" dentro do próprio widget. Chamar antes disso cai num no-op silencioso da Voa (sem erro, sem efeito). Implementamos e depois **removemos** um mecanismo de retry em intervalo (2s, até 2min) tentando contornar isso — funcionava, mas ficou frágil e substituído pela abordagem 2.

2. **`POST https://integration.voa.health/api/v1/ehr/` com `extra.context` (backend, API REST) — abordagem atual.** Endpoint não documentado publicamente, mas confirmado por teste direto (2026-07-28):
   - Aceita `{ type, consultation_id, doctor_id, patient_id, extra: { context } }`, autenticado com o mesmo `x-voa-token` (Auth Token de organização) já usado em `/integration/identify/`.
   - **Idempotente por `consultation_id`**: chamar de novo com o mesmo `consultation_id` reaproveita o mesmo atendimento (`200`, não `201`) e **não sobrescreve** o `extra.context` já salvo (confirmado via `PATCH` também: `PATCH /ehr/{id}/` atualiza `name` normalmente, mas **não** atualiza `extra.context` — é campo write-once na criação). Por isso só vale chamar essa API quando há contexto novo pra mandar (`if (contexto) { ... }`), nunca "pra garantir".
   - **Ordem importa:** essa chamada precisa terminar **antes** do frontend chamar `mount()`, senão corre risco de a própria Voa criar o atendimento primeiro (sem contexto) quando o widget monta, e nossa chamada chegar depois só reaproveitando o registro já criado sem contexto (write-once). Por isso é `await`ada dentro de `POST /api/voa/token`, no mesmo request que gera o token — não é fire-and-forget.

**Arquivos:**
- `lib/voa.ts` — `montarContextoHistorico(db, empresaId, pacienteId, agendamentoAtualId)` (monta markdown a partir de `tab_prontuario`, excluindo o próprio agendamento atual, limite de 10 consultas) e `criarAtendimentoVoaComContexto(...)` (o `POST /ehr/` acima; nunca lança — contexto é "nice to have", não bloqueia o fluxo se a Voa falhar).
- `app/api/voa/token/route.ts` — chama as duas funções acima antes de devolver o token. Aceita `body.contexto` (string, mesmo vazia) vindo do frontend; só cai no histórico automático via `montarContextoHistorico` se o chamador **nem mandar** esse campo (compatibilidade).
- `app/api/voa/contexto/route.ts` — `GET ?paciente_id=X&agendamento_id=Y`, usado pelo botão "Buscar histórico do paciente" na tela (reexpõe `montarContextoHistorico`).
- `components/clinica/HistoricoClinico.tsx` — ao clicar em "Gravar com Voa" pela **primeira vez** (não no "Retomar Voa"), abre um painel "Contexto do atendimento" com textarea editável + botão "Buscar histórico do paciente" (preenche automático) antes de montar o widget de fato (`iniciarPreparoVoa`/`preparandoVoaId`). O texto final (editado, digitado do zero, ou vazio de propósito) vai pro `VoaPluginView` via prop `contextoInicial`.

**Performance do início do atendimento (analisado e otimizado 2026-07-28):**
- `VoaPluginView.tsx`: token (`POST /api/voa/token`) e carregamento do script da Voa (`plugin.js`, ~7MB) agora rodam em **paralelo** (`Promise.all`) — antes eram sequenciais (esperava o token pra só então começar a baixar o script), somando os dois tempos à toa.
- `preconectarVoa()` (exportado de `VoaPluginView.tsx`) insere um `<link rel="preconnect">` pro CDN da Voa assim que a tela de histórico/atendimento monta (`HistoricoClinico.tsx`, não espera o clique) — aquece DNS/TLS antes da hora H.
- `POST /api/voa/token`: em `ambiente='producao'`, a pré-criação do atendimento (com contexto) e a troca de token via `/integration/identify/` rodam em paralelo (`Promise.all`) em vez de sequenciais — não se aplica hoje ao tenant de teste (`desenvolvimento`), mas evita somar os dois round-trips quando produção for usada de verdade.
- Medido: o `POST /ehr/` isolado leva ~200-300ms quando há contexto pra enviar (nada quando não há) — é round-trip real até a Voa, não dá pra cortar sem abrir mão de esperar a criação terminar antes do `mount()` (ver ordem acima).
- **Não implementado, decisão consciente:** pré-carregar o script da Voa (`modulepreload`) assim que a tela de atendimento abre (antes mesmo do clique em "Gravar com Voa") deixaria o widget pronto mais rápido ainda, mas baixa os ~7MB mesmo se o profissional nunca usar a Voa naquela consulta — trade-off de banda vs. velocidade, não decidido ainda.

---

## 21. Atestado Médico (implementado 2026-07-28)

Botão "Criar Atestado" em `HistoricoClinico.tsx`, ao lado de "Editar prontuário"/"Emitir Receita"/"Emitir Receita Sistema" — segue **exatamente** a arquitetura da Receita Sistema (§ código em `ReceitaSistema.tsx`/`receitaSistemaPrint.ts`), reaproveitando o mesmo endpoint de dados do prescritor/clínica (`GET /api/clinica/receitas-sistema?dados=true&agendamento_id=X`) em vez de duplicar a query.

**Arquivos:**
- `novos/49_atestado_medico.sql` — `tab_atestado_medico` (`tipo` VARCHAR livre: `AFASTAMENTO`/`COMPARECIMENTO`/`PERSONALIZADO`, `dias_afastamento`, `data_inicio`, `cid` opcional, `texto` — fonte da verdade pra reimpressão). GRANT já incluído na mesma migration (§8).
- `lib/validators/atestado.schema.ts` — Zod.
- `app/api/clinica/atestados/route.ts` — GET (`?agendamento_id=` ou `?paciente_id=`) / POST. Sem endpoint de dados próprio — reaproveita o da receita-sistema.
- `components/clinica/atestadoPrint.ts` — gera o HTML de impressão (mesmo layout A4/cabeçalho/assinatura/rodapé da receita), com corpo de texto justificado, CID opcional e "Cidade, DD de mês de AAAA" por extenso (`dataPorExtenso()`) antes da assinatura.
- `components/clinica/AtestadoMedico.tsx` — modal com prévia ao vivo. Texto é **auto-gerado** a partir de tipo/dias/data (`gerarTextoPadrao()`), mas totalmente editável — assim que o profissional edita manualmente, para de regenerar sozinho (flag `textoManual`), com botão "Restaurar texto padrão" pra voltar.
- `types/clinica.types.ts` — `AtestadoMedicoRegistro`.

**CID é opcional por design** — texto de aviso na UI sobre exigir consentimento do paciente (Resolução CFM), nunca preenchido automaticamente.

---

## 22. Médico Solicitante/Executor em exames (implementado 2026-08-13)

**Problema:** no agendamento de exame, quem pede o exame (médico solicitante) é conhecido na hora de marcar, mas quem vai efetivamente executar/laudar o exame muitas vezes só é decidido no dia (escala/disponibilidade) — e `tab_agendamento.profissional_id` é `NOT NULL` e já fazia triplo papel (dono do slot da agenda, quem aparece na grade, quem recebe o repasse via `tab_agendamento_tipo.percentual_profissional`).

**Solução escolhida (a mais barata das avaliadas — ver histórico de decisão se precisar entender as alternativas descartadas):** nenhuma mudança na criação/edição do agendamento. Continua exigindo `profissional_id`. Pra exame sem executor definido ainda, a recepção agenda usando um cadastro **placeholder** que representa a própria clínica (`tab_pessoa.eh_clinica = true`) como `profissional_id`. O par solicitante/executor só é exigido depois, **no recebimento**, e só quando o `profissional_id` atual do agendamento é esse placeholder.

**Arquivos:**
- `novos/53_medico_solicitante_exame.sql` — `tab_pessoa.eh_clinica` (boolean) + `tab_agendamento.medico_solicitante_id` (FK nullable). Aditiva/idempotente (`ADD COLUMN IF NOT EXISTS`). **Já aplicada no banco remoto compartilhado (`hiitcor`)** em 2026-08-13.
- `lib/validators/pessoa.schema.ts` / `app/api/cadastro/pessoas/(route.ts|[id]/route.ts)` — campo `eh_clinica` no schema e nos INSERT/UPDATE de `tab_pessoa` (adicionado como última coluna/parâmetro pra não precisar renumerar os `$N` existentes).
- `components/cadastro/PessoaFormPage.tsx` — checkbox "Representa a Clínica" na seção Classificação, junto dos outros `ind_*`.
- `app/api/clinica/agendamentos/route.ts` (GET) — expõe `profissional_eh_clinica` (join com `tab_pessoa`) e `medico_solicitante_id`/`nome`.
- `app/api/clinica/profissionais/route.ts` — expõe `eh_clinica` (usado pelo front pra excluir o placeholder dos dropdowns de solicitante/executor).
- `app/api/clinica/recebimentos/route.ts` (POST) — pro cada item do lote, se `profissional_id` do agendamento tem `eh_clinica=true`, exige `medico_solicitante_id`+`medico_executor_id` no payload (400 se faltar, antes de qualquer INSERT). No fim da transação, `UPDATE tab_agendamento SET medico_solicitante_id=..., profissional_id=<executor>` — o executor substitui o placeholder, então a partir daí fechamento diário/repasse (que leem `profissional_id`, ver §3) já enxergam o médico certo sem precisar de nenhuma mudança nessas outras rotas.
- `components/clinica/RecebimentoModal.tsx` — pra cada agendamento do lote com `profissional_eh_clinica`, renderiza um bloco com 2 selects (solicitante/executor) alimentados por `/api/clinica/profissionais` (filtrando `eh_clinica` fora da lista). Bloqueia o "Confirmar Recebimento" se faltar preencher.

**Armadilha encontrada e corrigida na mesma implementação:** a tela de edição de pessoa (`app/(erp)/cadastro/pessoas/[id]/page.tsx`) tem sua **própria** query direta no banco pra montar os dados iniciais do form — não usa a rota `GET /api/cadastro/pessoas/[id]`. As duas queries são independentes e precisam ser mantidas em sincronia manualmente: o `SELECT` da rota de API foi atualizado primeiro, mas o da page.tsx ficou esquecido, então salvar `eh_clinica=true` funcionava (confirmado direto no banco), mas reabrir a tela sempre mostrava desmarcado — o form nunca via a coluna. **Ao adicionar qualquer coluna nova em `tab_pessoa`, checar as duas queries**, não só a rota de API.

**Risco conhecido, não corrigido (decisão consciente, mesmo padrão já existente em `profissional_id`):** o `UPDATE tab_agendamento` no recebimento grava `medico_solicitante_id`/`profissional_id` a partir de IDs vindos direto do payload do cliente, sem checar se essas pessoas pertencem à `empresa_id_ativa` da sessão — igual ao que já acontecia (antes desta feature) na criação de agendamento com `profissional_id`. Revisão de segurança feita em 2026-08-13 não reportou como finding por ser padrão pré-existente replicado, não uma superfície nova; endurecer isso é trabalho futuro que vale aplicar de uma vez em todos os campos `*_id` que referenciam `tab_pessoa`, não só nestes dois.

---

## 23. Categorização gerencial de despesas (cadastro feito 2026-08-13/14) — PENDÊNCIA de continuação

> **AJUSTAR/RETOMAR QUANDO SOLICITADO.** Buscar por "PENDÊNCIA" neste arquivo para achar rápido.

**Origem:** cliente mandou planilha financeira mensal (Excel, fora do sistema) categorizando cada despesa em 9 grupos gerenciais tipo DRE — `(CSV) CUSTOS`, `(SG&A) DESPESAS`, `FOLHA DE PAGAMENTO`, `INVESTIMENTO MKT`, `INVESTIMENTO`, `DESPESAS FINANCEIRAS`, `DESPESAS COMERCIAIS`, `DESPESAS ADMINISTRATIVA`, `IMPOSTO - DAS` — além de forma de pagamento (PIX/débito/cartão/boleto), fatura de cartão detalhada item a item, e folha de pagamento aberta por colaborador+encargos. Pediu análise de como o ERP poderia reproduzir essa categorização e gerar relatório equivalente.

**Decisão de arquitetura tomada:** usar a hierarquia `pai_id` que já existe em `tab_tipo_despesa` (não criar coluna nova, não usar `tab_centro_custo` — esse é semanticamente pra rateio por unidade/departamento, não pra esse agrupamento gerencial). Pai = grupo sintético (codigo `"1"`..`"9"`), filho = item analítico (codigo `"N.NN"`), mesmo padrão de numeração do plano de contas. Todo texto em MAIÚSCULO e sem acentuação (decisão do cliente, apesar de LATIN1 aceitar acentuação — é convenção pedida, não limitação técnica).

**Feito:**
- `scripts/cadastrar_tipos_despesa_hiitcor.js` — script idempotente (dry-run por padrão, `--commit` grava; upsert via `ON CONFLICT (empresa_id, codigo)`) que cadastrou os 9 grupos + 33 itens analíticos em `tab_tipo_despesa` (empresa `hiitcor`, id=1). Rodado com `--commit` em produção — **42 registros gravados e íntegros** (conferido: nenhum filho com `pai_id` órfão).
- Mapeamento completo grupo→itens está no próprio script (fonte da verdade pra reabrir/ajustar) — não duplicar a lista aqui, ela desatualiza.

**Deixado de fora de propósito — retomar depois:**
1. **Repasse médico por percentual** — ✅ **RESOLVIDO 2026-08-27, ver §25** (tabela `tab_profissional_tipo_percentual` por par profissional×tipo; aba "Atendimentos" no cadastro do profissional). Falta só o relatório mensal de repasse (fase 2 na §25).
2. **Fornecedores recorrentes** (Amazon, Mercado Livre, contabilidade, assessoria jurídica, Unimed, etc.) — ainda não cadastrados como `tab_pessoa` (`ind_fornecedor=true`). Sem isso, os lançamentos de despesa não têm o fornecedor vinculado, só o tipo de despesa.
3. **Relatório de DRE gerencial** — não existe rota que agrupe `tab_despesa`/`tab_titulo_pagar` por essa hierarquia de `tab_tipo_despesa` (o Fluxo de Caixa Gerencial atual agrupa por origem do módulo, não por tipo de despesa). É essa rota que reproduziria a planilha (totais por grupo + detalhe por item, igual ao resumo que a planilha do cliente já tem).
4. **Cartão de crédito corporativo como forma de pagamento de despesa** — não precisa de módulo novo (o módulo `tab_venda_cartao`/fatura existente é pra venda/recebimento, não serve aqui). Só lançar `tab_despesa`/`tab_titulo_pagar` normal com `cod_tipo_cobranca = CARTÃO DE CRÉDITO`; a "fatura" da planilha é só o agrupamento por mês de competência no relatório do item 3.

---

## 24. Log de auditoria genérico (fases 1-3: usuários/permissões, financeiro, clínica e tela de consulta — implementado 2026-08-27)

**Objetivo:** o sistema não tinha trilha de auditoria — `created_by` existe na criação de alguns registros, mas edição e exclusão não deixavam rastro de quem fez. Decisão: tabela genérica de auditoria (não `updated_by` por tabela), porque captura histórico completo com snapshot antes/depois em JSONB e cobre UPDATE **e** DELETE com a mesma estrutura.

**Arquivos:**
- `novos/54_log_auditoria.sql` — `tab_log_auditoria` (`empresa_id` nullable — ações em `tab_usuario` não têm empresa única —, `usuario_id`, `usuario_nome` denormalizado tipo `created_by`, `tabela`, `registro_id` INT, `acao` CHECK IN INSERT/UPDATE/DELETE, `dados_antes`/`dados_depois` JSONB, índices em `(tabela, registro_id)` e `(empresa_id, created_at DESC)`). GRANT incluído na mesma migration (§8). **Já aplicada no banco remoto compartilhado (`hiitcor`)** em 2026-08-27.
- `lib/auditoria.ts` — `registrarAuditoria(db, session, params)`. **Nunca lança exceção** (try/catch interno, só `console.error`) — logging é best-effort e não pode derrubar a ação principal do usuário.
- Instrumentado em `app/api/cadastro/usuarios/[id]/route.ts` e `app/api/financeiro/{despesas,receitas,titulos-pagar,titulos-receber}/[id]/route.ts` (PATCH e DELETE). Rotas de criação (POST) e o fechamento diário (que já tem log próprio em `tab_reclassificacao_recebimento`, §17/§18) ficaram de fora, fora de escopo desta fase. **Fase 4 (2026-09-18):** `PUT /api/clinica/profissionais/[id]/percentuais` (`tab_profissional_tipo_percentual`) também é auditado — ver §25. **Armadilha ao auditar uma tabela nova:** o nome da tabela precisa entrar em 3 lugares, senão a tela mostra o nome cru ou quebra o tipo: `types/log-auditoria.types.ts` (union `LogAuditoriaTabela`), `LABEL_TABELA` em `app/(erp)/configuracoes/log-auditoria/page.tsx` **e** o `LABEL_TABELA` duplicado em `components/configuracoes/DetalheAuditoriaModal.tsx`. Snapshot com lista aninhada fica ilegível no diff lado a lado: achatar em `chave → valor` (ver `resumoRegras()` na rota de percentuais).

**Padrão de instrumentação (repetir em qualquer PATCH/DELETE novo que precise de auditoria):**
- **DELETE**: trocar `DELETE ... WHERE ...` por `... RETURNING *` — captura a linha apagada numa query só, vira `dadosAntes`.
- **PATCH com `{status}` ou `{ativo}` isolado (atalho)**: `RETURNING` no UPDATE pra pegar o valor novo, loga só `dadosDepois` (sem SELECT extra) — suficiente pra saber quem mudou o quê.
- **PATCH completo**: o SELECT de "antes" e o UPDATE (`RETURNING *`) **sempre dentro da mesma transação** (`client.connect()` + `BEGIN`/`COMMIT`), com `FOR UPDATE` no SELECT — nunca como duas queries soltas no `Pool`. Motivo: sem isso há uma janela real entre o SELECT e o UPDATE onde outra conexão pode alterar a linha, e o `dados_antes` gravado não reflete o estado imediatamente anterior (achado em revisão de segurança/performance de 2026-08-27, aplicado retroativamente nas 5 rotas da fase 1 — inclusive nas que já usavam transação pro próprio UPDATE, porque o SELECT de antes tinha ficado fora do `BEGIN`).
- A chamada a `registrarAuditoria` roda **depois do `COMMIT`**, usando o `Pool` (`db`), não o `client` da transação — como nunca lança erro, não precisa estar dentro dela.
- Nunca incluir `senha_hash` (ou equivalente) no snapshot — em `tab_usuario`, `antes`/`depois` usam lista explícita de colunas, nunca `SELECT *`/`RETURNING *`.

**Armadilha encontrada durante o teste manual (não é bug da auditoria, é comportamento pré-existente das rotas):** `titulos-pagar`/`titulos-receber` (e as demais rotas financeiras) fazem PATCH **full-replace** — campo omitido no body vira `NULL` na coluna, não é ignorado. Testando manualmente, um PATCH sem `despesa_id`/`receita_id` no body zerou esse vínculo de verdade (o título ficou "órfão", sem cascade de exclusão junto com a despesa-pai). Ao testar (ou integrar no front), sempre reenviar o objeto **completo** — buscar via GET antes de montar o PATCH, nunca só os campos que mudaram.

**Fase 2 — clínica (agendamentos e recebimentos, 2026-08-27):** mesmo padrão da fase 1, aplicado em `app/api/clinica/agendamentos/[id]/route.ts` (PUT completo com transação+`FOR UPDATE`, PATCH de status, DELETE) e `app/api/clinica/recebimentos/[id]/route.ts`. Recebimento **não tem PATCH de edição** — só POST (criação, já tem `created_by`, fora de escopo) e o `DELETE`, que na verdade é um **estorno em lote** (reverte todos os recebimentos/títulos/movimentos/venda-cartão do mesmo `batch_agendamento_id`, não só a linha clicada). Decisão: uma única linha de auditoria por estorno (`tabela: 'tab_recebimento_consulta'`, `registroId` = o recebimento clicado), com `dadosAntes` resumindo tudo que foi afetado (`recebimentos_estornados`, `titulos_receber_estornados`, `movimentos_caixa_estornados`, `movimentos_banco_estornados`, `vendas_cartao_estornadas`) — em vez de uma linha por registro revertido (mais simples de ler, e resolve de graça uma lacuna real: **`motivo_estorno` era exigido no payload mas nunca era salvo em lugar nenhum antes disso**, só validado e descartado).

**Fase 3 — tela de consulta em Configurações (2026-08-27):** `app/(erp)/configuracoes/log-auditoria/page.tsx` + `app/api/configuracoes/log-auditoria/route.ts` (GET paginado, filtros de módulo/ação/período/usuário) + `components/configuracoes/DetalheAuditoriaModal.tsx` (mostra antes/depois lado a lado, destaca o que mudou) + `types/log-auditoria.types.ts`. Item de menu abaixo de "Empresas" em `components/layout/Sidebar.tsx`.
- **Restrita a `perfil === 'admin'`** — tanto a API (403) quanto a página (bloqueio visual "Acesso restrito", mesmo padrão de `app/(erp)/usuarios/page.tsx`). A API é a barreira real; a UI é só cosmética.
- **Resolvida a pendência da fase 1**: a API filtra `linha_digitavel`/`codigo_barras`/`nosso_numero` do JSONB antes de responder, para `tab_titulo_pagar` **e** `tab_titulo_receber` (a fase 1 tinha citado só titulo_receber, mas titulo_pagar tem os mesmos campos de boleto).
- **Filtros só valem depois de clicar em "Filtrar"** (ou Enter) — não a cada tecla/seleção. Motivo: a tabela de log só cresce, então buscar a cada mudança de filtro (ou sem filtro nenhum) bateria o banco sem necessidade. Estado dividido em `rascunho` (o que o usuário está digitando) e `filtros` (o que foi de fato aplicado, do qual o fetch depende) — paginação continua instantânea, não exige clicar em Filtrar de novo.
- **Padrão de período: últimos 7 dias por padrão** (no primeiro carregamento e no botão "Limpar") — evita consulta sem limite de data logo na abertura da tela.
- **Armadilha de fuso horário ao formatar datas dentro do snapshot JSON** (`DetalheAuditoriaModal.tsx`): colunas `DATE` puras (ex: `data_vencimento`) chegam do driver `pg` como timestamp `T00:00:00.000Z` — convertê-las direto pro fuso local com `toLocaleDateString` pode "voltar" um dia (mesma raiz do problema já documentado em memória "pg DATE precisa de TO_CHAR"). A função `formatarValor` detecta isso: se a hora for exatamente `00:00:00Z`, extrai o `dd/mm/aaaa` direto da string (sem conversão de fuso); senão, usa `toLocaleString('pt-BR')` normalmente (formato `dd/mm/aaaa, HH:mm:ss`).

**Pendências conhecidas, não bloqueantes (ver revisões de segurança/performance de 2026-08-27):**
- Falta índice em `usuario_id` — só adicionar quando existir uma tela/consulta por "o que esse usuário fez" (hoje a tela filtra por módulo/ação/período/nome, não por usuário específico via índice).
- `CAMPOS_SENSIVEIS_TITULO` em `log-auditoria/route.ts` é uma lista fixa — se o schema de título ganhar outro campo sensível de boleto no futuro, precisa lembrar de atualizar essa lista.
- Enquanto `DEV_NO_AUTH` estiver ativo (§17), todo registro fica em nome de `usuario_id=1`/`nome='Dev'` — passa a refletir usuários reais quando o login for reativado.

---

## 25. Repasse do profissional por (profissional × tipo) + tipos que o profissional realiza (implementado 2026-08-27)

**Resolve o item 1 da PENDÊNCIA §23.** O percentual de repasse deixou de ser por tipo de atendimento (`tab_agendamento_tipo.percentual_profissional` — **coluna removida** na migração 55) e passou a ser por par **(profissional × tipo)**.

**`tab_profissional_tipo_percentual` (migração `novos/55_...`, já aplicada no `hiitcor` com `user_dba`) tem DUPLO papel — não separar em duas tabelas/colunas:**
1. **Linha existe = o profissional realiza aquele tipo de atendimento.** Sem linha = não realiza.
2. `percentual_profissional` (NOT NULL, 0–100) = a parte do valor recebido que fica com esse profissional nesse tipo; a clínica fica com o resto.

- Migração **semeou** todo par (profissional `ativo=true` × tipo) com o valor que estava no tipo (consulta/retorno=100, exames=35). Profissional **inativo** não recebeu linhas — se for reativado, começa sem atendimento nenhum habilitado até configurar.
- Snapshot congelado em `tab_recebimento_consulta`: `percentual_profissional`, `valor_profissional`, `valor_clinica` — gravado no `POST /api/clinica/recebimentos` **depois** de resolver executor/placeholder (§22: o executor é quem recebe o repasse do exame). `reclassificar` só copia o snapshot antigo. **Recebimentos anteriores à migração 55 ficam com snapshot NULL** — o Fechamento Diário mostra `repasse=0 / clínica=total` pra eles (fallback), e o relatório da fase 2 **não deve** recalcular retroativo com a config atual (estaria errado) — mostrar "sem rateio".
- Resolver: `lib/clinica/repasse.ts` — `regraRepasse(db, profId, tipoId)` (antes `percentualRepasse`) retorna `{ percentual, valor_fixo }` e cai em **100% / sem valor fixo** se não houver linha (então um recebimento de um par não-configurado paga 100% silenciosamente); `dividirRepasse(total, regra)` (soma sempre = total).
- `GET /api/clinica/profissionais` expõe `tipo_ids: number[]`; `AgendamentoModal` filtra o dropdown de tipo por esse array (dropdown travado até escolher o profissional; ao editar, injeta o tipo já gravado mesmo se depois foi desabilitado; trocar de profissional limpa o tipo se ele não fizer aquele).
- `PUT /api/clinica/profissionais/[id]/percentuais` recebe o **conjunto completo** de tipos habilitados — tipo ausente do payload é DELETADO. UI: aba **"Atendimentos"** no cadastro da pessoa (`PessoaFormPage.tsx`, só se `ind_profissional`), checkbox "Realiza" + % por tipo + botões "Marcar/Desmarcar todos". Grava o conjunto num único `INSERT ... unnest(...)` (eram N idas ao banco, uma por tipo).
- **Valor fixo (migração `novos/58_valor_fixo_repasse_profissional.sql`, aplicada no `hiitcor` em 2026-09-18):** `tab_profissional_tipo_percentual.valor_fixo NUMERIC(15,2)` NULL, **só vale com `percentual_profissional = 0`** — o profissional recebe esse valor por atendimento (limitado ao total recebido: a clínica nunca fica negativa) e a clínica fica com o resto. `valor_fixo` NULL com 0% = profissional não recebe nada (comportamento anterior do 0%, nada mudou pra quem já usava). O PUT grava NULL quando % > 0 ou o valor é inválido/negativo. **Não há snapshot próprio do valor fixo:** `tab_recebimento_consulta.valor_profissional` já congela o valor pago; `percentual_profissional = 0` + `valor_profissional > 0` = "valor fixo" (a tela deduz assim). Cadastro: coluna "Valor Fixo (R$)" na aba "Atendimentos"; o campo só abre na linha com % = 0 (`percFixo` em `PessoaFormPage.tsx`).
- Fechamento Diário (`app/(erp)/gerencial/fechamento-diario/page.tsx`): Repasse / Clínica **por profissional** (cartão "Por Profissional") e **por atendimento** (lista "Agendamentos do Dia", com a regra aplicada: `35%`, `valor fixo` ou `sem rateio` pra recebimento anterior à migração 55). `rateioDoAtendimento()` usa o mesmo fallback dos totais da rota (snapshot NULL ⇒ repasse 0 / clínica = total). Só leitura — **não há correção manual de repasse** (possível fase futura: admin + motivo + auditoria, dia aberto).

**PRÓXIMO AJUSTE — fase 2: relatório "Repasse Médico" em Gerencial** (filtro período + profissional; substitui a planilha do cliente). Antes de começar, resolver:
- **Índices:** pra consulta "repasse de um médico no mês" (`tab_recebimento_consulta` JOIN `tab_agendamento` por `profissional_id`), **o índice `idx_rc_agendamento` (em `tab_recebimento_consulta(agendamento_id)`) já existe** — conferido em 2026-09-19; a versão anterior desta nota dizia o contrário e estava errada. Só vale avaliar um composto `tab_agendamento(empresa_id, profissional_id, data_hora_inicio)` se o volume crescer (hoje ~60 agendamentos).
- Tratar recebimentos pré-migração 55 (snapshot NULL) como "sem rateio".
- Modelo visual pronto: as colunas Repasse/Clínica do Fechamento Diário.

**Achados de segurança:**
- `PUT .../percentuais` **agora é auditado** (§24; antes/depois achatados em `TIPO → "35%"` / `"0% + valor fixo R$ 100.00"`, só grava se algo mudou). **Continua sem checar `perfil`** — qualquer usuário autenticado altera % / valor fixo (dado financeiro). Decisão de produto pendente: exigir `perfil === 'admin'`.
- ~~Filtro de tipo por profissional só client-side~~ **RESOLVIDO (§30):** `POST`/`PUT /api/clinica/agendamentos` validam `tipo_id` contra `tab_profissional_tipo_percentual` (422).
- `medico_executor_id` do payload de recebimento segue sem validação de empresa (pré-existente, §22) — o cálculo de repasse herda isso; impacto novo nulo (fallback 100%, id já era gravado antes).

**Achado de desempenho (não corrigido):** `POST /api/clinica/recebimentos` chama `regraRepasse` **1 query por item, sequencial, dentro da transação**. Lotes pequenos (1-5) hoje. Se lista de espera com muitos itens virar comum, trocar por 1 query só buscando todos os pares antes do loop.

---

## 26. Logo do cliente/empresa nas marcas do sistema (implementado 2026-08-27)

Duas exibições distintas da logo, com fontes e endpoints diferentes — **não confundir**:

### 26a. Tela de login — logo pelo identificador digitado (rota pública)

- **`GET /api/auth/branding/logo?slug=<slug>`** ([app/api/auth/branding/logo/route.ts](app/api/auth/branding/logo/route.ts)) — **rota pública, sem sessão** (é a tela de login). Resolve `slug` → `tab_instancia` (só `status ativo`/`trial`) → `getDb(database_name)` → `SELECT logo_base64 FROM tab_empresa WHERE ativo=true AND logo_base64 IS NOT NULL ORDER BY id LIMIT 1`. Decodifica o data URL e devolve **bytes binários** com `Content-Type` real + `Cache-Control: public, max-age=600`.
  - **Qualquer falha responde `404` seco** (sem corpo) — slug inválido, inexistente, instância suspensa, empresa sem logo. Não confirma/nega existência de cliente pra quem tenta enumerar slugs (mesmo princípio de `/api/auth/recuperar-senha`).
  - Validação do slug por regex `^[a-z0-9-]{2,50}$`; rate-limit `60/min` por IP (`lib/rate-limit`), protege criação de pool de conexão.
  - `dynamic = 'force-dynamic'` obrigatório (usa `dbControl`/`getDb`, não pode pré-renderizar).
- **`app/(auth)/login/page.tsx`**: o identificador digitado é *debounced* (500ms) → `slugLogo` → `<img key={url} src="/api/auth/branding/logo?slug=...">`. `onLoad` → mostra a logo do cliente no lugar da `logo-horizontal.svg`; `onError`/enquanto carrega → mantém a marca VitaRF. Quando mostra a logo do cliente, aparece "com tecnologia VitaRF" abaixo (`.auth-brand-powered`).
- CSS em `app/globals.css` sob `/* Marca exibida no topo do card de login */`: `.auth-brand` (container, `min-height` reserva espaço pra não haver salto), `.auth-brand-cliente` (`max-height: 128px; max-width: 320px; object-fit: contain`), `@keyframes authBrandIn` (fade-in). **O card de login é branco** — logo com fundo transparente/escuro renderiza bem direto, sem chip.

### 26b. Cabeçalho da sidebar (app autenticado) — logo da empresa ativa

- Usa a rota **já existente** `GET /api/cadastro/empresas/logo` (autenticada, empresa ativa da sessão — ver §19a), **não** a rota pública de branding.
- **`components/layout/Sidebar.tsx`**: estado `logoEmpresa: 'loading'|'ok'|'error'`. A logo vai dentro de um **chip branco** (`.sidebar-logo-chip`, `width: 100%`, `background: #fff`, `border-radius`) porque a sidebar tem fundo **verde escuro** (`--sidebar-bg: #0B3A35`) e a maioria das logos (ex: HiitCor, verde escuro) ficaria ilegível direto sobre ele. `.sidebar-logo-chip img { width: 100%; max-height: 88px; object-fit: contain }` — ocupa quase toda a largura do cabeçalho. Sem logo (`error`) → marca `logo-horizontal-branca.svg` centralizada.
- **Armadilha corrigida — `onLoad` não dispara pós-hidratação:** o `<img>` da logo vem no HTML do SSR e pode terminar de carregar **antes** do React hidratar e anexar o handler `onLoad` — nesse caso o estado nunca sai de `'loading'` e a logo fica escondida (chip `display:none`) pra sempre. Solução: `useRef` no `<img>` + `useEffect(() => { if (img.complete) setLogoEmpresa(img.naturalWidth > 0 ? 'ok' : 'error') }, [])` no mount, **além** do `onLoad`/`onError` (que cobrem o caso não-cacheado). A tela de agendamento (§19a) não tinha esse problema porque lá o `<img>` só renderiza depois de um fetch client-side, nunca no SSR.

### 26c. Badge da empresa no cabeçalho do dashboard

- `components/dashboard/EmpresaBadge.tsx` (usado em `app/(erp)/dashboard/page.tsx`, canto superior direito) mostra **só o nome** da empresa (`nome_fantasia || razao_social`) num pill. **Não** tem mais logo/iniciais — foi removida em 2026-08-27 porque a logo da empresa já aparece no cabeçalho da sidebar (§26b) e as duas juntas eram redundantes. A query do dashboard não seleciona mais `logo_base64`.

**Não implementado / decisões conscientes:**
- Nenhuma das rotas faz downscale da imagem — a logo do `hiitcor` tem ~150KB (data URL). Aceitável: no login só carrega quando um slug válido é digitado (cache 600s); na sidebar é exibida em todas as telas mas com cache de 300s e agora é de fato usada (diferente do cenário da §19a). Se virar problema, redimensionar no endpoint.
- A rota pública de branding, como a `/api/auth/login`, permite descobrir se um slug existe pela latência (query real vs. rejeição por regex) — não pelo status code. Não endurecido; consistente com o que o login já expõe.

## 27. Layout da sidebar — rodapé (usuário + Sair) sempre visível (ajustado 2026-08-27)

`.sidebar` ([app/globals.css](app/globals.css)) é `display: flex; flex-direction: column` com 3 filhos: `.sidebar-logo`, `<nav class="sidebar-section">` e o rodapé `.sidebar-footer` (nome do usuário + botão **Sair**). Vale para `Sidebar.tsx` e `AdminSidebar.tsx` (mesma marcação).

- **Regra:** o scroll fica **só no `<nav>`**, nunca no `<aside>`. `.sidebar` usa `height: 100dvh` + `overflow: hidden`; `.sidebar-logo` e `.sidebar-footer` são `flex-shrink: 0`; `.sidebar-section` é `flex: 1; min-height: 0; overflow-y: auto` (o `min-height: 0` é o que permite o nav encolher e rolar dentro do flex).
- **Armadilha corrigida:** antes `.sidebar` era `min-height: 100vh` + `overflow-y: auto` no aside inteiro. Com todos os grupos de menu expandidos o `<nav>` crescia além da viewport e empurrava o rodapé pra baixo da dobra — o botão **Sair** ficava inacessível sem rolar a barra toda. Não usar `min-height` nem scroll no `<aside>`.
- Scrollbar fina customizada no `.sidebar-section` (`scrollbar-width: thin` + `::-webkit-scrollbar` 6px, thumb em `--sidebar-border`).
- Qualquer filho novo direto do `.sidebar` que deva ficar fixo (topo ou base) precisa de `flex-shrink: 0`.

---

## 28. Receituário de Controle Especial (implementado 2026-08-27)

Documento da Portaria SVS/MS 344/98 (Anexo X) para prescrição de medicamentos da lista C1 e afins. Botão **"Receituário Especial"** (vermelho `#B02A37`, ícone `FileWarning`) em `HistoricoClinico.tsx`, ao lado de "Criar Atestado". Segue **exatamente** a arquitetura do Atestado (§21) / Receita Sistema.

**Arquivos:**
- `novos/56_receituario_controle_especial.sql` — `tab_receituario_especial` (`prescricao` TEXT texto livre = fonte da verdade; `paciente_endereco` VARCHAR(300) **congelado na emissão** — o endereço do cadastro pode mudar depois). GRANT + `client_encoding=LATIN1` inclusos. **Aplicada no `hiitcor`** em 2026-08-27.
- `lib/validators/receituario-especial.schema.ts` — Zod; reusa `paraLatin1()` de `prontuario.schema.ts` em `prescricao` e `paciente_endereco` (§9 — texto livre de textarea quebra INSERT LATIN1 com 500 mudo).
- `app/api/clinica/receituarios-especiais/route.ts` — GET (`?agendamento_id` / `?paciente_id`) / POST. Sem endpoint de dados próprio — **reaproveita `receitas-sistema?dados=true`**. `paciente_id`/`profissional_id` vêm da linha do agendamento (verificada contra `empresa_id_ativa`), nunca do payload; só `prescricao` e `paciente_endereco` são do cliente.
- `components/clinica/receituarioEspecialPrint.ts` — HTML A4 em **2 vias** (`.folha` com `page-break-after`), layout do talão: caixa do título, quadro "Identificação do Emitente" (nome/CRM/UF + endereço+telefone **da clínica**), Paciente + Endereço, área de Prescrição pautada (`repeating-linear-gradient`), quadros "Comprador" e "Fornecedor" em branco lado a lado (preenchidos à mão na farmácia). `montarEnderecoPaciente(dados)` monta o fallback do endereço.
- `components/clinica/ReceituarioEspecial.tsx` — modal com prévia ao vivo. Campo "Endereço do paciente" pré-preenche do cadastro (`montarEnderecoPaciente`); ao editar, para de auto-preencher (`enderecoTocado`).
- `types/clinica.types.ts` — `ReceituarioEspecialRegistro`.

**Extensão em `receitas-sistema?dados=true`:** o SELECT e a interface `DadosPrescritor` ganharam `paciente_logradouro/numero/complemento/bairro/cidade/uf/cep` (o endereço do paciente não vinha antes — só o da empresa). Beneficia qualquer documento que use esse endpoint.

**Logo da clínica no documento (§26):** bloco `.brand` centralizado no topo de **cada via**, acima da caixa do título — papel timbrado, mesmo padrão de Receita Sistema/Atestado. `empresa_logo_base64` já vinha no endpoint. Imprime em papel branco → sem "chip" branco (diferente da sidebar, §26b). Sem logo → nome da empresa em negrito.

**`<title>` da janela de impressão = `&nbsp;`** de propósito: o navegador imprime o `<title>` no cabeçalho de cada folha (acima do conteúdo). Deixar em branco tira esse texto. Data/URL nas bordas só saem desmarcando "Cabeçalhos e rodapés" no diálogo de impressão (config do navegador, não dá pra forçar).

---

## 29. Recebimento da clínica = check-in (pagamento ANTES do atendimento) (ajustado 2026-08-28)

**Regra de negócio:** na clínica o paciente **paga na recepção antes da consulta**. Portanto o recebimento faz o **check-in**, não marca a consulta como realizada.

| Status antes de pagar | Depois de pagar |
|---|---|
| AGENDADO / CONFIRMADO | **AGUARDANDO** (entra na sala de espera — `sala-espera/page.tsx` só lista `status='AGUARDANDO'`) |
| AGUARDANDO | AGUARDANDO (sem mudança) |
| ATENDIDO | ATENDIDO (pagamento na saída) |
| CANCELADO / FALTOU | sem mudança |

**Quem marca ATENDIDO:** só o botão "Finalizar atendimento" do médico (`finalizarAtendimento()` em `PacienteCheckInFormModal.tsx` → `PATCH /api/clinica/agendamentos/[id]` com `{status:'ATENDIDO'}`). A rota PATCH não tem trava de transição e grava `horario_inicio_atendimento`.

**Onde o status muda no recebimento (2 caminhos, os dois com a mesma regra `CASE`):**
1. `POST /api/clinica/recebimentos` — `UPDATE tab_agendamento SET status = CASE WHEN status IN ('AGENDADO','CONFIRMADO') THEN 'AGUARDANDO' ELSE status END, horario_chegada = COALESCE(horario_chegada, NOW()) ... WHERE status NOT IN ('CANCELADO','FALTOU')`.
2. Trigger `fn_guardar_status_agendamento_cli` (`novos/57_trigger_recebimento_status_aguardando.sql`, **aplicada no `hiitcor` em 2026-08-28**) — dispara no INSERT de `tab_movimento_caixa`/`tab_movimento_banco` com `tipo='E' AND origem_modulo='CLI'` (dinheiro/PIX). Antes forçava `ATENDIDO` (era de `21_fix_trigger_recebimento.sql`); agora leva a `AGUARDANDO` só se `status IN ('AGENDADO','CONFIRMADO')`. **Cartão e A Prazo não têm movimento → não passam pela trigger, só pelo caminho 1.**

Os dois caminhos rodam juntos para dinheiro/PIX (trigger no INSERT do movimento + UPDATE explícito depois) — são idempotentes, sem conflito. Não remover nenhum (defesa em profundidade, mesmo padrão que já existia com ATENDIDO).

**Estorno** (`DELETE /api/clinica/recebimentos/[id]`): reverte `AGUARDANDO → CONFIRMADO` e limpa `horario_chegada` (passo "F", depois de desfazer movimentos/títulos/venda-cartão, dentro da transação). **Não** mexe em `ATENDIDO` (consulta já realizada) nem em `CANCELADO`/`FALTOU`. Antes desta mudança o estorno não tocava no status (ficava ATENDIDO). Edge case aceito: se o paciente tinha feito check-in manual (AGENDADO→AGUARDANDO na recepção) e só depois pagou, o estorno derruba pra CONFIRMADO mesmo assim — não há histórico do status anterior.

**`PacienteCheckInFormModal.handleRecebimentoSalvo()`** ainda faz um PATCH pra `AGUARDANDO` depois do modal salvar — virou **rede de segurança redundante** (a rota já faz). O filtro exclui `ATENDIDO` além de `CANCELADO`/`FALTOU` pra não reabrir consulta já finalizada (pagamento na saída via esse modal).

**Impacto em relatórios:** Fechamento Diário e repasse (§3, §25) trabalham sobre `tab_recebimento_consulta` (`status_recebimento='PAGO'`), **não** sobre o status do agendamento — não afetados. Agendamentos já marcados `ATENDIDO` por pagamentos antigos não mudam retroativamente. A timeline de `HistoricoClinico` (`agendamentos?status=ATENDIDO`) passa a não mostrar consulta paga-mas-não-atendida — correto, ela ainda não foi realizada (o `agendamentoAtual` cobre a consulta em andamento).

---

## 30. Agendamento: lançamento rápido + tipo de atendimento validado no servidor (2026-09-18)

**Fluxo do lançamento: 1 chamada HTTP e 2 idas ao banco** (antes: disponibilidade + POST + 3 GETs, ~6 idas em série). `POST /api/clinica/agendamentos`:
1. **SELECT único** com tipo habilitado (`tab_profissional_tipo_percentual`) + dados de disponibilidade (`sqlDadosDisponibilidade` + `avaliarDisponibilidade` em `lib/clinica/disponibilidade.ts`; regra: exceção do dia > grade semanal > pausas). Recusa com **422** e a razão em `erro` (tipo ausente, tipo não habilitado, fora do expediente...).
2. **`WITH ins AS (INSERT ... SELECT ... WHERE NOT EXISTS (conflito) RETURNING *) SELECT <colunas da lista>`** — devolve `{ id, agendamento }` no formato de `AgendamentoListItem`. 0 linhas = **409**. As colunas/joins da lista ficam em `lib/clinica/agendamento-lista.ts`, **compartilhadas com o GET** — alterar o item da lista é num lugar só.

**⚠ A guarda de conflito no INSERT REDUZ a janela de corrida, não a elimina.** Em READ COMMITTED dois INSERTs realmente simultâneos ainda podem passar no `NOT EXISTS` (nenhum enxerga o outro não commitado). Fechar de vez = constraint `EXCLUDE USING gist` parcial (`status NOT IN ('CANCELADO','FALTOU')`, exige `btree_gist` e checar sobreposições já existentes) ou advisory lock numa transação (+2 idas). **Não feito**; o PUT também não fecha (o `FOR UPDATE` trava só a própria linha).

**Tipo de atendimento só se for habilitado pro profissional (aba "Atendimentos", §25) — agora também no servidor:** `lib/clinica/tipo-habilitado.ts` (`MSG_TIPO_NAO_HABILITADO`, `profissionalRealizaTipo`). O **PUT só revalida quando o tipo OU o profissional mudam** — reagendar só o horário de um agendamento antigo cujo tipo foi desabilitado depois continua permitido (o `NovoHorarioModal` reenvia o corpo inteiro). `tipo_id` é obrigatório no POST; o schema zod segue opcional pro PUT/legado.

**Regras de código a manter:**
- **Fuso:** o horário local vem do SQL pelo fuso da **sessão do banco** (`America/Sao_Paulo` hoje), o mesmo pressuposto do resto do sistema (filtros de data da agenda, fechamento). **Não hardcodar fuso no código** — é multi-tenant; se entrar cliente em outro fuso, o certo é fuso por empresa.
- `sqlDadosDisponibilidade(dataExpr)` **concatena** `dataExpr` no SQL: só passar expressão escrita no código (com placeholders `$N`), nunca texto vindo de requisição.
- `GET /profissionais/[id]/disponibilidade` continua existindo pra consulta avulsa (valida id, data e horas); o modal **não** chama mais.

**Front:**
- `AgendamentoModal`: `setSaving(true)` desde o clique (antes a checagem de disponibilidade rodava sem nenhum indicador); `onSaved(agendamento?)` entrega o item criado; `carregado` evita mostrar tipos da abertura anterior enquanto a config dos profissionais recarrega; o tipo já gravado só é injetado no dropdown ao **editar**, nunca num lançamento novo.
- Agenda (`page.tsx`): `aoSalvarAgendamento` insere o item no estado (grade do período, `agsMes`, aba Confirmar) sem refazer as 3 listas; sem item (editar/excluir/reagendar) cai em `recarregarAgenda` (aba Confirmar só recarrega se estiver aberta — ela já recarrega ao abrir). `carregarDiasIndisponíveis` saiu de dentro de `carregar()`: só roda ao mudar período/profissional e no botão Atualizar.
- `tipos-agendamento?limit=100`: a rota pagina em 50 por padrão e cortaria tipos em silêncio; o teto da rota é 100 — passando disso, precisa paginar de verdade.

**Medido (dev → banco remoto, RTT ~15 ms):** validação 20 ms + INSERT 34 ms. O pool descarta conexão ociosa após 30 s (`idleTimeoutMillis`), então a 1ª ação depois de uma pausa paga conexão nova (~75 ms local, mais em produção) — **não alterado**: subir isso mexe no total de conexões do Postgres compartilhado, é decisão à parte.

**Pendências conhecidas (não corrigidas):** `paciente_id`/`categoria_id` do POST não são validados por empresa (pré-existente); `regraRepasse` ainda faz 1 query por item no recebimento; `scripts/run-migrations.js` tem a **senha do admin do banco escrita no arquivo (e no histórico do git — rotacionar)** e **derruba todas as tabelas** — nunca usar pra aplicar migração nova: aplicar o `.sql` avulso com um script que leia as credenciais do `.env.local`.

---

## 31. Fechamento Diário: relatório impresso "Pacientes pelo tipo de atendimento" (2026-09-18/19)

Botão **"Imprimir relatório"** no cabeçalho de `app/(erp)/gerencial/fechamento-diario/page.tsx` → modal (período de/até começando no dia da tela, médico, categoria, **"Agrupar por médico"** marcado por padrão) → janela de impressão **compacta: A4 retrato (agrupado) / A4 paisagem (lista única)**. Baseado no relatório do sistema anterior do cliente (foto de referência: título "Emissão de Relatórios / Pacientes pelo tipo de atendimento", filtros Médico/Categoria/Período, colunas Paciente / Telefone / Categoria / Dt. Visita / Médico / Vlr. Pagar / Vlr. Pago / Atendimento) **+ a coluna "Forma de Pgto" e sem a coluna Telefone** (removida a pedido do cliente em 2026-09-19; a rota nem devolve mais o telefone).

**Fluxo:** clique em "Imprimir" no modal → `window.open` **imediato** (antes do fetch, senão o navegador bloqueia como pop-up) com "Gerando relatório..." → `GET /api/gerencial/fechamento-diario/relatorio` → `gerarHtmlRelatorioAtendimentos(itens, opções)` → `document.write` na janela → `window.print()` no `onload`. Erro ou dia sem atendimento: a janela é fechada e a mensagem aparece no modal.

> **Base compartilhada (2026-09-19):** helpers (`esc`, `brl`, `logoSegura`, `paraCss`...), o CSS (`cssBase`), o cabeçalho, os chips de filtro e a etiqueta de forma de pagamento moram em `components/gerencial/relatorioImpressaoBase.ts`; a validação de período/ids e a forma de pagamento da rota em `lib/gerencial/relatorio-fechamento.ts`. Existe um 2º relatório que usa a mesma base: §33. A extração foi verificada com HTML **byte a byte idêntico** (36 combinações) e resposta de API idêntica (6 chamadas) — repita essa comparação se mexer na base.

### Onde mexer para cada tipo de ajuste

| Quero mudar... | Mexa em |
|---|---|
| **Adicionar/tirar coluna** | rota (`SELECT` + mapeamento em `itens`) → `ItemRelatorioAtendimento` → `linhaItem` e `<thead>` → larguras `W` (têm que somar 100%) → `totalColunas` / `colunasAntesValores` e os `colspan` das linhas de total/grupo |
| **Quem entra / de onde vêm os valores** | `WHERE` e `SELECT` de `app/api/gerencial/fechamento-diario/relatorio/route.ts` |
| **Visual** (fonte, margens, cores, etiquetas) | `cssBase()` em `components/gerencial/relatorioImpressaoBase.ts` — **vale para os DOIS relatórios (§33)**; confira os dois. Larguras (`W`) ficam em cada módulo |
| **Filtros do modal** | `components/gerencial/RelatorioAtendimentosModal.tsx` **e** a validação na rota |
| **Orientação/papel** | const `papel` no início do `<style>` (agrupado = `A4 portrait`, lista única = `A4 landscape`) **e** o `W` de cada modo |
| **Novo tipo de pagamento com cor própria** | `CLASSE_FORMA` + classe `.f-*` no `<style>` |

### Regras de negócio

- **Quem entra:** status `AGUARDANDO`/`ATENDIDO` **ou** com recebimento `PAGO` (mesmo `FALTOU`) — assim a soma de "Vlr. Pago" **confere com o "Total Recebido" do Fechamento** (conferido dia a dia, 18/18). Sem o "ou pago", o pagamento de quem faltou sumiria do relatório e continuaria no fechamento. Pagamento **a prazo conta como pago** (mesma regra do fechamento, §3).
- **Vlr. Pago** = `total_recebimento` (0 se não pagou). **Vlr. Pagar** = `valor_original` gravado no recebimento; sem recebimento, o **valor de tabela atual** do tipo pra categoria (`COALESCE(atc.valor, tp.valor)` — pode diferir do preço da época do atendimento). Retorno sai R$ 0,00 / R$ 0,00.
- **Forma de pagamento** = `tab_condicao_pagamento.descricao` do recebimento (PIX, DINHEIRO, VISA DEBITO...); **crédito parcelado** acrescenta `Nx` de `tab_venda_cartao.qtd_parcelas` (`VISA CREDITO 3x`); a prazo já vem na descrição (`PARCELADO 6X`). Sem pagamento: `Pendente` (há valor a pagar) ou `-` (retorno). O item da API traz `pago`, `forma_pagamento` e `tipo_pagamento` (o tipo só escolhe a cor da etiqueta).
- **Agrupado:** faixa por médico (nome completo), subtotal por médico, TOTAL GERAL e, com 2+ médicos, "Resumo por médico" no fim; a coluna Médico some (o nome está na faixa). **Desmarcado:** lista única com a coluna Médico (sem o título DR./DRA.) e TOTAL GERAL.
- Datas com `TO_CHAR` no SQL (memória "pg DATE precisa de TO_CHAR"). **Sem telefone** (coluna removida a pedido do cliente; é dado pessoal que o relatório não precisa).
- **Rota:** valida datas (YYYY-MM-DD, fim ≥ início, máx. **366 dias**), ids inteiros positivos (senão 400), teto de **5.000 linhas** (422); devolve `itens` + `empresa_nome` / `empresa_logo` / `emitido_por`.

### Decisões de design — não reverter sem o cliente pedir

- **O objetivo é caber o máximo de atendimentos por página.** Topo numa faixa só (logo pequena | título | emissão), **4 filtros numa linha pequena** (Médico, Categoria, Período, Agrupamento) e **nada entre o filtro e a grade**.
- Os **cartões-resumo** (atendimentos, pagamentos registrados, total a pagar, total pago) e o **"Resumo por forma de pagamento"** foram **removidos de propósito** a pedido do cliente. Os totais ficam nos subtotais/TOTAL GERAL e, agrupado com 2+ médicos, no "Resumo por médico" (só no fim).
- **Papel por modo:** **agrupado = A4 retrato** (sem a coluna Médico são 7 colunas e a página tem ~46% mais altura); **lista única = A4 paisagem** (com a coluna Médico, no retrato "JOSE VICENTE TONIN / JUNIOR" e "CONSULTA / CARDIOLOGICA" quebram em 2 linhas e o ganho some — medido: 34 linhas/página, igual à paisagem antiga). **Retrato na lista única foi tentado e descartado.**
- Fonte **7,4 pt**, linhas justas (`padding` 1,4 px), `table-layout: fixed`, margens 0,8 / 0,8 / 1,15 cm.
- **Medido** (342 linhas, contra o layout paisagem com telefone): agrupado **38 → 49 linhas/página (+29%)**; lista única **34 → 38 (+11%)**. (Histórico: antes do layout compacto eram 21 e 16.) **Armadilha:** na lista única, nome de médico quebrado em 2 linhas dobra a altura da linha — a coluna Médico precisa de ~17,5% da largura (só isso levou a lista de 24 → 35). **Mexeu em larguras (`W`) ou fonte? Refaça a medição.**
- **Totais grandes (retrato):** as colunas Vlr. Pagar/Pago são estreitas (10,5%) e o TOTAL GERAL é negrito — na 1ª versão saiu "R$ 6.500,00R$ 6.500,00" (colado). A fonte dos totais/subtotais agora **encolhe conforme o maior valor** (`fsTotais`, 7,6 → 6,2 pt); testado sem estouro até R$ 1,5 milhão. Se mexer nas larguras de valor, refazer esse teste (checar `scrollWidth > clientWidth` nas células `.num` e nas linhas `total`/`subtotal`).
- A etiqueta de forma de pagamento **pode quebrar em 2 linhas** (raro, ex.: `VISA CREDITO 3x`) em vez de vazar pra coluna do lado (`.pill` sem `nowrap`).

### Segurança do HTML (manter)

- **Todo texto vindo do banco passa por `esc()`**; texto que vai dentro de string CSS (rodapé `@bottom-left/@bottom-center`) passa por `paraCss()` (só `[\p{L}\p{N} .,:;-/()|]` — nada de aspas, `<` ou `\` que fechariam a string ou a tag `<style>`); a logo só é aceita se for data URL de imagem (`logoSegura`); a etiqueta usa **classe fixa** (`CLASSE_FORMA`), **nunca texto do banco em `class`**.
- Rodapé "Emitido em ... por ... | Período ..." e "Página X de Y" ficam **nas margens da página** (`@page { @bottom-left/@bottom-center/@bottom-right }`, Chrome/Edge ≥ 131). **Não usar `position: fixed` no rodapé**: repete em toda página mas sobrepõe a última linha da tabela. Em navegador sem suporte o rodapé simplesmente não sai; o resto não muda.

### Receita para ajustar e testar (sem abrir impressora)

1. **Servidor:** use o `next dev` do usuário se já estiver de pé (porta 3000) e só faça chamadas de leitura. **Não suba um segundo `next dev` no projeto** (§32). Valide tipos com `npx tsc --noEmit`, nunca `next build` com dev ativo.
2. **Gerar o HTML sem a tela:** transpile `relatorioAtendimentosPrint.ts` com `typescript.transpileModule` + `new Function('module','exports', js)` e alimente com os `itens` de `GET /api/gerencial/fechamento-diario/relatorio?inicio=..&fim=..`. Tire `<script>window.onload...print</script>` antes de renderizar.
3. **Ver o resultado:** Chrome headless `--screenshot --window-size=1123,794` (A4 paisagem a 96 dpi = 1123×794 px; retrato = 794×1123); adicione `body{padding:30px 34px 44px}` pra simular as margens. A captura **não mostra o rodapé** das margens (ele funciona na impressão real — ver "Limites conhecidos"); pra ver a página exatamente como sai, peça ao usuário o PDF impresso.
4. **Medir capacidade por página:** Playwright `page.setContent(html)` + `page.pdf({ preferCSSPageSize: true })` e contar `/Type /Page` no buffer (`/\/Type\s*\/Page[^s]/g`), com **300+ linhas** (repita os itens reais). Compare com a versão anterior via `git show HEAD:components/gerencial/relatorioAtendimentosPrint.ts`. Referência atual: agrupado 40, lista 35 linhas/página.
5. **Fluxo real:** Playwright com `channel: 'chrome'`: clicar "Imprimir relatório", preencher as datas, `ctx.waitForEvent('page')` pro popup e checar `.filtro`, `thead th`, `tr.total`. **Não fixe totais no teste** (o banco é vivo e muda): confira "soma de Vlr. Pago do relatório = Total Recebido do fechamento" dia a dia.
6. **Escape:** teste com nome de paciente `<script>alert(1)</script>` e atendimento `<img src=x onerror=alert(2)>` — têm que sair como texto.

### Limites conhecidos

- **Conferido em impressão real** (PDF gerado pelo cliente no Chrome, 2026-09-19, período 01/09–19/09, 13 atendimentos agrupados; layout da época: paisagem, com Telefone): A4 em 1 página, filtros numa linha, etiquetas e cores impressas, sem sobreposição, e **rodapé nas 3 posições** — esquerda "Emitido em ... por ... | Período ...", centro nome da clínica, direita "Página 1 de 1". Os totais do PDF batem com a API e com a soma do Total Recebido do fechamento. Pela altura das linhas no PDF, cabem ~38 linhas/página no agrupado (medido: 40).
- **Ainda não visto em impressão real:** o **retrato** do agrupado e a remoção do Telefone (2026-09-19 — só por captura de tela e contagem de páginas) e relatório de **várias páginas** (o PDF de exemplo tem 1 página) — cabeçalho da grade repetido a cada página, grupo de médico atravessando a quebra, "Página X de Y" com Y > 1. O ambiente de teste não rasteriza PDF, então isso só foi inferido pelo CSS e pela contagem de páginas.
- 7,4 pt é pequeno; se o cliente reclamar, subir a fonte e **refazer a medição** (cabe menos linha por página).
- A logo (~200 KB em base64) viaja em toda geração; aceito por ser uso eventual.
- Teto de 366 dias / 5.000 linhas na rota.

---

## 32. Fechamento Diário: análise de desempenho das buscas (2026-09-19)

**Resultado: buscas saudáveis; 1 defeito real de tela corrigido + 3 ajustes.**

**Medido** (dev → banco remoto, RTT ~15 ms; 59 agendamentos / 10 recebimentos):
- Consulta principal do dia (`GET /api/gerencial/fechamento-diario`): execução **0,54 ms** (planning 2,7 ms). Com `enable_seqscan=off` o plano usa `idx_ag_data (empresa_id, data_hora_inicio)` + `idx_rc_agendamento` — com a tabela grande o filtro do dia continua por índice; hoje o planner faz seqscan só porque a tabela é minúscula (normal, não é problema).
- HTTP (warm): **~70 ms → ~43 ms** depois de rodar as 2 consultas da rota em `Promise.all`. O relatório impresso leva ~70 ms, mas a resposta pesa ~206 KB (≈200 KB é a logo em base64) — aceito, uso eventual; se virar problema, guardar a logo no cliente entre relatórios.
- Índices conferidos, nada faltando: `tab_agendamento` (`idx_ag_data`, `idx_ag_profissional`…), `tab_recebimento_consulta` (`idx_rc_agendamento`, `idx_rc_data`…), `tab_fechamento_caixa_diario` (unique empresa+data).

**Defeito corrigido — "só a última resposta vale" (corrida de respostas):** clicando rápido entre dias, a resposta lenta de um dia anterior chegava depois e sobrescrevia o estado: a tela mostrava agendamentos/totais de 27/08 (11) com o seletor em 28/08 (2) — e "Fechar caixa do dia" agiria sobre a data do seletor. Reproduzido com Playwright (`page.route` atrasando o dia A). Correção em `page.tsx`: `buscaAtual` (ref com id sequencial + `AbortController`) cancela a busca anterior e ignora qualquer resposta que não seja da última; **erro (HTTP ≠ 200 ou queda) limpa `dados` e mostra aviso com "Tentar novamente"** em vez de manter os números do dia anterior; "Fechar/Reabrir caixa" ficam desabilitados enquanto `loading`. **Padrão a seguir em toda tela que busca a partir de seletor de data/filtro.** A tela de Agendamento (`carregar` em `app/(erp)/clinica/agendamento/page.tsx`) usa o mesmo padrão sem essa guarda — **provavelmente tem o mesmo problema; não foi testado.**

**Outros ajustes:**
- Rota: as duas consultas (fechamento do dia + agendamentos) em `Promise.all`. Só o erro `42P01` (tabela `tab_fechamento_caixa_diario` inexistente, migration 51 não aplicada) é tolerado como "dia aberto"; **qualquer outra falha vira 500** — antes o `catch` genérico mostrava como ABERTO um dia que podia estar FECHADO.
- `condicoes-pagamento` só é buscada ao abrir "Corrigir" (1ª vez), não em toda visita (só o admin corrige).
- Sem paginação de propósito: um dia tem dezenas de linhas. O relatório limita 366 dias / 5.000 linhas.

**Como foi testado:** scripts Playwright + Chrome (corrida com resposta atrasada, HTTP 500 + "Tentar novamente", botão travado durante a carga, `condicoes-pagamento` carregada sob demanda) e a conferência "soma do relatório = Total Recebido do fechamento", dia a dia (18/18). **Cuidado ao testar:** não subir um segundo `next dev` neste projeto enquanto o do usuário roda — os dois disputam o `.next` e o segundo trava em "Starting..." (e pode corromper o do usuário); testar contra o servidor que já está de pé, só com chamadas de leitura.


---

## 33. Fechamento Diário: relatório impresso "Exames pelo médico executante" (2026-09-19)

Mesmo desenho do §31, só de **exames**, organizado pelo **médico que executou** e mostrando o **solicitante**. É a **segunda opção** do modal do botão "Imprimir relatório" (radio "Tipo de relatório"; o padrão continua sendo "Pacientes pelo tipo de atendimento", que não mudou). Decisão: **um botão só + seletor no modal** (não uma flag dentro do relatório antigo) porque as colunas, a rota e o critério de quem entra são diferentes — misturar deixaria o relatório antigo cheio de `if`.

**O que é "exame":** coluna **`tab_agendamento_tipo.eh_exame`** (migração `novos/59_tipo_atendimento_eh_exame.sql`, aplicada no hiitcor em 2026-09-19; classificação inicial = tudo que não começa com CONSULTA/RETORNO). Caixa **"É exame"** no cadastro do tipo **e coluna "É exame" na grade** `clinica/tipos-atendimento` (caixa clicável: marca/desmarca **com `confirm()` antes** (mensagem diz o efeito no relatório; cancelar não envia nada — a caixa é controlada pelo estado), depois atualização otimista e desfaz + aviso se o servidor falhar; usa `PATCH /api/clinica/tipos-agendamento/[id]` com **só** `{ eh_exame }`, ramo próprio da rota — o UPDATE geral regrava `valor` e `voa_clinical_type`, então um PATCH parcial com outro campo apagaria esses dois) (`TipoAtendimentoFormPage`; schema `eh_exame` boolean default false; PATCH usa `COALESCE($7, eh_exame)` pra um PATCH parcial não zerar o flag). **Tipo novo de exame = marcar a caixa**, senão ele some do relatório sem aviso. **Outros bancos/clientes: aplicar a 59** — sem a coluna, o cadastro de tipos, a agenda (que lista tipos) e este relatório dão 500.

**Quem é o executante (§22):** no recebimento de exame agendado no "médico da clínica" (placeholder `tab_pessoa.eh_clinica`) a rota de recebimentos **troca** `agendamento.profissional_id` pelo executor e grava o solicitante em `medico_solicitante_id`. Logo: `profissional_id` = executante; `profissional_id` = placeholder ⇒ **executante ainda a definir** (grupo âmbar "Executante a definir", sempre por último, com nota explicativa no rodapé). Exame agendado direto com o médico real já sai no grupo dele. O filtro do modal exclui o placeholder da lista de executantes.

**Arquivos:** rota `app/api/gerencial/fechamento-diario/relatorio-exames/route.ts` (filtros `profissional_id` = executante, `tipo_id` = exame, `categoria_id`; mesmas validações/limites do §31; `tp.eh_exame = true`; mesmo critério de presença/pagamento) · `components/gerencial/relatorioExamesPrint.ts` · seletor no `RelatorioAtendimentosModal.tsx` (rota e gerador escolhidos por `tipo`) · base do §31.

**Layout:** agrupado por executante = A4 **retrato** (8 colunas: Paciente/Categoria/Exame/Solicitante/Dt. Visita/Vlr. Pagar/Vlr. Pago/Forma); lista única = A4 **paisagem** (+ coluna Executante, 9). Subtotal por executante, TOTAL GERAL, "Resumo por médico executante" só com 2+ grupos. Sem coluna de repasse de propósito (não foi pedida e é dado sensível). Larguras `W` somam 100%; Categoria precisa de ~11% no retrato senão "UNIMED RIO VERDE"/"SUS - ACREÚNA" quebram em 2 linhas.

**Como foi testado (padrão a repetir):** (1) HTML sintético (3 executantes + a definir, valores até R$ 1,5 mi, XSS em paciente/solicitante/exame/empresa/logo) renderizado no Chrome: páginas, estouro horizontal, nenhum `alert`; (2) a **SQL real da rota extraída do arquivo** rodada em `BEGIN/ROLLBACK` com dados alterados (exame no placeholder ⇒ a definir; solicitante; tipo com `eh_exame=false` some) — os dados reais ainda não têm exame no placeholder nem solicitante; (3) itens do relatório novo == itens do relatório antigo para o mesmo tipo (8/8 idênticos); (4) Playwright no modal (2 tipos, filtro de exame com 33 opções, sem consulta/retorno, total = API, "Nenhum exame encontrado"); (5) schema + `UPDATE`/`INSERT` do tipo em `ROLLBACK`. **Não** salvar pelo formulário do tipo só pra testar: ele regrava também os valores por categoria (`PUT .../categorias`, vazio vira 0) no banco de produção.

**Ainda não visto em impressão real** (só por captura e contagem de páginas). Possível evolução: resumo por tipo de exame (quantos ECG cada médico fez).
