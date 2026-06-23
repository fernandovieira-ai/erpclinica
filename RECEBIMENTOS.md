# Sistema de Recebimentos de Consultas

## Visão Geral

Nova estrutura para gerenciar recebimentos de consultas de forma profissional, gerando automaticamente movimentos financeiros (títulos a receber e movimentos de caixa).

## Arquivos Criados

### 1. Componente Modal de Recebimento
**Arquivo:** `components/clinica/RecebimentoModal.tsx`

Modal elegante e profissional para registrar recebimentos de consultas com:
- Exibição de informações da consulta (paciente, profissional, tipo, valor)
- Seleção de forma de pagamento (dinheiro, débito, crédito)
- Campos de valor recebido, desconto e acréscimo
- Campo de observação
- Cálculo automático do total com ajustes

**Props:**
```typescript
interface Props {
  open: boolean
  onClose: () => void
  agendamento: AgendamentoListItem | null
}
```

### 2. Página de Recebimentos
**Arquivo:** `app/(erp)/clinica/recebimentos/page.tsx`

Tela profissional que:
- Lista agendamentos do dia selecionado
- Filtra por status
- Mostra valor de cada consulta
- Permite navegar entre datas
- Botão "Receber" para cada agendamento elegível
- Total de valores a receber

**Funcionalidades:**
- Navegação por data (anterior/próxima)
- Volta para hoje com um clique
- Filtro por status de agendamento
- Atualização com refresh automático
- Design responsivo e intuitivo

### 3. Endpoint de Recebimentos
**Arquivo:** `app/api/clinica/recebimentos/route.ts`

API POST que processa recebimentos:

**Requisição:**
```json
{
  "agendamento_id": 123,
  "paciente_id": 456,
  "forma_pagamento": "dinheiro",
  "valor_original": 150.00,
  "valor_desconto": 0,
  "valor_acrescimo": 0,
  "valor_recebido": 150.00,
  "total_recebimento": 150.00,
  "data_recebimento": "2026-06-23",
  "observacao": "Obs opcional"
}
```

**Lógica:**
1. Valida os dados
2. Verifica se agendamento existe
3. Atualiza status do agendamento para "ATENDIDO"
4. Cria título a receber (liquidado)
5. Se forma de pagamento for dinheiro, cria movimento de caixa
6. Retorna ID do título criado

**Resposta:**
```json
{
  "sucesso": true,
  "titulo_receber_id": 789,
  "mensagem": "Recebimento processado com sucesso"
}
```

## Modificações em Arquivos Existentes

### 1. Tipos
**Arquivo:** `types/clinica.types.ts`

Adicionado campo opcional ao `AgendamentoListItem`:
```typescript
tipo_valor?: number | null
```

Permite que cada agendamento carregue o valor associado do tipo de atendimento.

### 2. API de Agendamentos
**Arquivo:** `app/api/clinica/agendamentos/route.ts`

Adicionado ao SELECT:
```sql
tp.valor AS tipo_valor
```

Agora retorna o valor do tipo de atendimento em todas as consultas de agendamentos.

### 3. Menu Sidebar
**Arquivo:** `components/layout/Sidebar.tsx`

Adicionado novo item ao menu "Clínica":
```typescript
{ label: 'Recebimentos', href: '/clinica/recebimentos', icon: <CreditCard size={14} /> }
```

Link direto para a página de recebimentos no menu principal.

## Fluxo de Funcionamento

### Usuário Final

1. Acessa **Clínica > Recebimentos** no menu
2. Visualiza lista de agendamentos do dia
3. Clica no botão **"Receber"** do agendamento desejado
4. Preenche informações:
   - Forma de pagamento (dinheiro/débito/crédito)
   - Valor recebido
   - Desconto (opcional)
   - Acréscimo (opcional)
   - Observação (opcional)
5. Clica **"Confirmar Recebimento"**
6. Sistema processa automaticamente:
   - Atualiza status da consulta para "ATENDIDO"
   - Gera título a receber (liquidado)
   - Se dinheiro: gera movimento de caixa
   - Registra observações

### Dados Financeiros

O sistema cria registros em:

1. **tab_titulo_receber** - Título de cobrança/recebimento
   - Status: 'L' (Liquidado)
   - Valores: original, desconto, acréscimo, juros
   - Observação com referência do agendamento

2. **tab_movimento_caixa** - Apenas para pagamentos em dinheiro
   - Tipo: 'E' (Entrada)
   - Vinculado ao título a receber
   - Documento: referência do agendamento (AG-###)

## Benefícios

✅ **Profissional**: Interface elegante e intuitiva
✅ **Automático**: Gera movimentos financeiros automaticamente
✅ **Rastreável**: Todos os recebimentos ficam registrados
✅ **Integrado**: Conecta clínica com financeiro
✅ **Flexível**: Permite descontos e acréscimos
✅ **Informativo**: Mantém histórico com observações

## Notas Técnicas

- Usa transações SQL para garantir integridade
- Valida dados antes de processar
- Trata erros graciosamente
- Campos obrigatórios: agendamento_id, paciente_id, valor_recebido > 0
- Compatível com formas de pagamento múltiplas
- Tipo de receita automaticamente detectado pela forma de pagamento

## Próximas Melhorias (Sugestões)

- [ ] Recibos em PDF
- [ ] Integração com NFC-e
- [ ] Parcelamento automático
- [ ] Cupom fiscal
- [ ] Histórico de recebimentos por paciente
- [ ] Relatório de recebimentos diários
- [ ] Reembolsos/devoluções
