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
1. **Repasse médico por percentual** (Jose Vicente, Joao Antonio, Wendell, Elio Neto e demais médicos não-sócios; regra: sócio fica com 100% da consulta, médico não-sócio 70%/clínica 30%, exame 35% pro médico executante/65% clínica) — cliente pediu explicitamente pra deixar de fora deste cadastro e tratar "em outra parte", porque o cálculo do rateio já existe (`tab_agendamento_tipo.percentual_profissional`, ver §22 sobre solicitante/executor). **Gap real identificado:** hoje esse percentual é definido por tipo de atendimento, igual pra todo mundo — não diferencia sócio de não-sócio pro mesmo tipo de atendimento. Pra automatizar o repasse de verdade (e não só categorizar lançamento manual) falta resolver isso: ou `ind_socio` em `tab_pessoa` + regra fixa (sócio=100%, ignora o percentual cadastrado), ou tabela nova de percentual por par profissional+tipo_atendimento (mais flexível). Ainda não decidido qual caminho.
2. **Fornecedores recorrentes** (Amazon, Mercado Livre, contabilidade, assessoria jurídica, Unimed, etc.) — ainda não cadastrados como `tab_pessoa` (`ind_fornecedor=true`). Sem isso, os lançamentos de despesa não têm o fornecedor vinculado, só o tipo de despesa.
3. **Relatório de DRE gerencial** — não existe rota que agrupe `tab_despesa`/`tab_titulo_pagar` por essa hierarquia de `tab_tipo_despesa` (o Fluxo de Caixa Gerencial atual agrupa por origem do módulo, não por tipo de despesa). É essa rota que reproduziria a planilha (totais por grupo + detalhe por item, igual ao resumo que a planilha do cliente já tem).
4. **Cartão de crédito corporativo como forma de pagamento de despesa** — não precisa de módulo novo (o módulo `tab_venda_cartao`/fatura existente é pra venda/recebimento, não serve aqui). Só lançar `tab_despesa`/`tab_titulo_pagar` normal com `cod_tipo_cobranca = CARTÃO DE CRÉDITO`; a "fatura" da planilha é só o agrupamento por mês de competência no relatório do item 3.

---

## 24. Log de auditoria genérico (fases 1-3: usuários/permissões, financeiro, clínica e tela de consulta — implementado 2026-08-27)

**Objetivo:** o sistema não tinha trilha de auditoria — `created_by` existe na criação de alguns registros, mas edição e exclusão não deixavam rastro de quem fez. Decisão: tabela genérica de auditoria (não `updated_by` por tabela), porque captura histórico completo com snapshot antes/depois em JSONB e cobre UPDATE **e** DELETE com a mesma estrutura.

**Arquivos:**
- `novos/54_log_auditoria.sql` — `tab_log_auditoria` (`empresa_id` nullable — ações em `tab_usuario` não têm empresa única —, `usuario_id`, `usuario_nome` denormalizado tipo `created_by`, `tabela`, `registro_id` INT, `acao` CHECK IN INSERT/UPDATE/DELETE, `dados_antes`/`dados_depois` JSONB, índices em `(tabela, registro_id)` e `(empresa_id, created_at DESC)`). GRANT incluído na mesma migration (§8). **Já aplicada no banco remoto compartilhado (`hiitcor`)** em 2026-08-27.
- `lib/auditoria.ts` — `registrarAuditoria(db, session, params)`. **Nunca lança exceção** (try/catch interno, só `console.error`) — logging é best-effort e não pode derrubar a ação principal do usuário.
- Instrumentado em `app/api/cadastro/usuarios/[id]/route.ts` e `app/api/financeiro/{despesas,receitas,titulos-pagar,titulos-receber}/[id]/route.ts` (PATCH e DELETE). Rotas de criação (POST) e o fechamento diário (que já tem log próprio em `tab_reclassificacao_recebimento`, §17/§18) ficaram de fora, fora de escopo desta fase.

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
