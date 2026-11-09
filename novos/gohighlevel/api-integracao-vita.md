# API de integração ERP → Vita (GoHighLevel)

Documentação de consumo dos endpoints externos do ERP para a integração com a Vita, via token de
API. Cobre os 3 endpoints pedidos em `pedido-api-vita-09nov.pdf` (agendamentos, recebimentos e as
melhorias em pacientes). Testados com dado real do tenant hiiltcor em 09/11/2026.

## Ambiente

```
Produção: https://app.vitarf.com.br
```

Todas as rotas ficam sob `/api/integracoes/gohighlevel/`.

## Autenticação

Header obrigatório em toda requisição:

```
Authorization: Bearer <token>
```

O token é único por empresa/clínica (gerado pela DigitalRF no cadastro da empresa). Não envie o
token em query string nem em logs.

### Erros de autenticação

| Status | Corpo | Causa |
|---|---|---|
| 401 | `{"erro":"Token não informado"}` | Header `Authorization` ausente |
| 401 | `{"erro":"Token inválido ou inativo"}` | Token errado, revogado ou desativado |
| 429 | `{"erro":"Muitas requisições, tente novamente em breve"}` | Limite de requisições excedido (ver Rate limit) |

## Rate limit

Dois limites, compartilhados entre os 3 endpoints abaixo:
- **Por IP**: 120 requisições / 60s (aplicado mesmo antes de validar o token).
- **Por token**: 60 requisições / 60s (aplicado depois do token validado).

Ao estourar, a resposta é `429`. Use polling espaçado (ver recomendação no fim do documento) em vez
de rajadas.

## Paginação

`agendamentos`, `recebimentos` e `pacientes` usam o mesmo envelope:

```json
{
  "dados": [ ... ],
  "total": 748,
  "page": 1,
  "limit": 100,
  "pages": 8
}
```

- `page` começa em 1 (default `1`).
- `limit` tem teto de 500 em `agendamentos`/`recebimentos` e 100 em `pacientes` (default 100 / 20
  respectivamente). Valores acima do teto são truncados, não rejeitados.
- `page`/`limit` funcionam de verdade (contagem real + `OFFSET`) — páginas diferentes sempre trazem
  registros diferentes.

---

## 1. GET `/api/integracoes/gohighlevel/agendamentos`

Lista de agendamentos. Não inclui nenhum dado clínico (motivo da consulta, observações, prontuário).

### Query params

| Param | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `inicio` | não | `YYYY-MM-DD` | Filtra `data_hora_inicio >= inicio` |
| `fim` | não | `YYYY-MM-DD` | Filtra `data_hora_inicio <= fim 23:59:59` |
| `page` | não | inteiro ≥ 1 | Página (default 1) |
| `limit` | não | inteiro | Itens por página (default 100, teto 500) |

### Exemplo

```bash
curl "https://app.vitarf.com.br/api/integracoes/gohighlevel/agendamentos?inicio=2026-11-01&fim=2026-11-30&page=1&limit=100" \
  -H "Authorization: Bearer <token>"
```

### Campos de cada item em `dados`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | int | id do agendamento |
| `data_hora_inicio` | timestamp ISO | |
| `status` | string | ex.: `AGENDADO`, `ATENDIDO`, `CANCELADO`, `FALTOU` |
| `created_by` | string | quem lançou |
| `created_at` | timestamp ISO | |
| `paciente_id` | int | cruza com `pacientes` |
| `paciente_celular` | string \| null | formato E.164, ex.: `+5564999999999` |
| `paciente_cpf` | string \| null | só dígitos |
| `tipo_descricao` | string | ex.: `CONSULTA CARDIOLOGICA` |
| `tipo_eh_exame` | boolean | `true` = exame, `false` = consulta |
| `profissional_nome` | string | médico/executante |
| `recebimento_id` | int \| null | preenchido só quando há recebimento **pago** |
| `status_recebimento` | string \| null | `PAGO` quando `recebimento_id` não é nulo; `null` caso contrário |
| `total_recebimento` | numeric string \| null | valor pago |

> `recebimento_id`/`status_recebimento`/`total_recebimento` só vêm preenchidos quando o
> atendimento já foi pago — um agendamento sem cobrança lançada ainda, ou com cobrança pendente,
> traz os três como `null`.

---

## 2. GET `/api/integracoes/gohighlevel/recebimentos`

Lançamento a lançamento de recebimentos **pagos** (1 linha por recebimento), já com taxa de cartão
e repasse profissional/clínica calculados.

### Query params

| Param | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `inicio` | não | `YYYY-MM-DD` | Filtra `data_recebimento >= inicio` |
| `fim` | não | `YYYY-MM-DD` | Filtra `data_recebimento <= fim` (dia inteiro) |
| `page` | não | inteiro ≥ 1 | Página (default 1) |
| `limit` | não | inteiro | Itens por página (default 100, teto 500) |

### Exemplo

```bash
curl "https://app.vitarf.com.br/api/integracoes/gohighlevel/recebimentos?inicio=2026-11-01&fim=2026-11-30" \
  -H "Authorization: Bearer <token>"
```

### Campos de cada item em `dados`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | int | id do recebimento |
| `data_recebimento` | `YYYY-MM-DD` | |
| `paciente_id` | int | cruza com `pacientes` |
| `procedimento` | string | tipo de atendimento |
| `executante_nome` | string | médico que atendeu |
| `solicitante_nome` | string \| null | médico solicitante externo, quando houver |
| `forma_pagamento` | string | descrição da condição de pagamento (ex.: `PIX`, `CARTÃO DE CRÉDITO`) |
| `qtd_parcelas` | int \| null | só quando pago em cartão parcelado |
| `valor_bruto` | number | |
| `valor_taxa` | number | taxa de cartão já descontada |
| `valor_liquido` | number | `valor_bruto - valor_taxa` |
| `valor_profissional` | number | repasse do profissional |
| `valor_clinica` | number | parte da clínica |

---

## 3. GET `/api/integracoes/gohighlevel/pacientes`

### Query params

| Param | Obrigatório | Formato | Descrição |
|---|---|---|---|
| `page` | não | inteiro ≥ 1 | Página (default 1) |
| `limit` | não | inteiro | Itens por página (default 20, teto 100) |
| `atualizado_desde` | não | data/hora ISO (ex.: `2026-11-01` ou `2026-11-01T00:00:00Z`) | Só retorna pacientes com `updated_at >= atualizado_desde` |
| `updated_since` | não | idem | Alias de `atualizado_desde` |

Se `atualizado_desde`/`updated_since` vier num formato que não dá pra interpretar como data, a API
responde `400 {"erro":"atualizado_desde inválido"}`.

### Exemplo (sincronização incremental)

```bash
curl "https://app.vitarf.com.br/api/integracoes/gohighlevel/pacientes?atualizado_desde=2026-11-08T00:00:00Z&limit=100" \
  -H "Authorization: Bearer <token>"
```

### Campos de cada item em `dados`

| Campo | Tipo |
|---|---|
| `id` | int |
| `nome` | string |
| `data_nascimento` | `YYYY-MM-DD` \| null |
| `telefone` | string \| null |
| `celular` | string \| null (E.164) |
| `whatsapp` | string \| null |
| `email` | string \| null |
| `cidade` | string \| null |
| `uf` | string \| null |
| `ativo` | boolean |
| `created_at` | timestamp ISO |
| `updated_at` | timestamp ISO |

---

## Recomendação de uso (polling)

1. Primeira carga: paginar `agendamentos`/`recebimentos` por período (ex.: mês a mês) e `pacientes`
   sem filtro de data, até `page == pages`.
2. Rodadas seguintes: `pacientes?atualizado_desde=<último updated_at lido>` pra pegar só quem mudou,
   e `agendamentos`/`recebimentos` com `inicio`/`fim` cobrindo a janela desde a última rodada (ex.:
   últimas 24h), sem precisar varrer tudo de novo.
3. Respeite os limites de rate limit (seção acima) — se for pollar várias empresas com o mesmo
   processo, espace as chamadas por token.

## Pendente / fora desta entrega

- Campo "origem do paciente" (anúncio/indicação/site/convênio) — ainda não implementado, sem data
  definida.
- Webhooks (agendamento criado, status alterado, recebimento baixado) — não implementado; o padrão
  atual é polling via estes 3 endpoints.
