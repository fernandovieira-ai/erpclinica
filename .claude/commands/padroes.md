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
