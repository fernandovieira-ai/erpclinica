# Padrões do Projeto ERP — DigitalRF

Ao trabalhar neste projeto, siga SEMPRE os padrões abaixo sem precisar ser lembrado.

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

- **`tab_prontuario`**: 1:1 com `tab_agendamento` (`UNIQUE(agendamento_id)`), upsert via `ON CONFLICT (agendamento_id) DO UPDATE` em `POST /api/clinica/prontuarios`. Campos clínicos (queixas, HDA, antecedentes, exame físico, diagnóstico, medicação etc.) **não** passam pela regra de maiúsculo da seção 2 — é texto narrativo do profissional, preserva o case original.
- **Consultas do paciente**: `GET /api/clinica/agendamentos?paciente_id=X&status=ATENDIDO` (rota já aceitava `profissional_id`, ganhou o filtro `paciente_id` também). UI em `components/clinica/HistoricoClinico.tsx` — timeline expansível dentro da aba "Consultas" do cadastro de pessoas (só aparece se `ind_paciente`; aba "Agenda" só aparece se `ind_profissional`).
- **Integração Voa** (assistente de gravação/IA): configuração fica em `tab_empresa.voa_auth_token` + `voa_ambiente` (`desenvolvimento`/`producao`), editável na aba "Integração" do cadastro de empresa — nunca fixar token em env var, cada empresa tem o seu.
  - `POST /api/voa/token` gera o token: em modo `desenvolvimento` devolve o Auth Token bruto direto (documentado pela própria Voa); em `producao` tentaria trocar por Bearer Token via `/integration/identify/`, mas essa troca **não passou na validação** nos testes (401 em `/auth/validate-integration-token/`) — pendência a confirmar com `integration@voahealth.com` antes de usar produção de verdade.
  - `VoaPlugin` (script `https://integration.voa.health/plugin.js`) expõe `window.VoaPlugin` como **classe**, não singleton pronto — usar sempre `VoaPlugin.instance.init(...)` e `VoaPlugin.instance.mount(...)`, nunca `VoaPlugin.init(...)` direto (o próprio exemplo da doc oficial da Voa tem esse bug).
  - Preenchimento automático do prontuário usa `structuredOutputSchema` no `mount()` (JSON Schema com um `description` por campo) — a Voa dispara `voa.plugin.ehr.structured_output` com os valores extraídos quando o profissional clica em "Preencher prontuário" dentro do próprio widget da Voa. Ver `components/clinica/VoaPluginView.tsx`.
  - Callback passado para dentro do `VoaPluginView` (`onDadosExtraidos`) deve ir num `useRef`, nunca direto na dependency array do `useEffect` de mount — senão o widget remonta a cada re-render do formulário pai (cada tecla digitada).

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
