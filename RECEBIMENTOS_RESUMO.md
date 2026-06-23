# Recebimentos - Resumo de Implementação

## 🎯 O que foi implementado

### 1. **Estrutura de Banco de Dados**
- ✅ Coluna `status_recebimento` em `tab_recebimento_consulta` (PAGO, ESTORNADO, PENDENTE)
- ✅ Coluna `movimento_banco_id` para associar movimentos de PIX

### 2. **Fluxo de Recebimento**
- ✅ Modal para receber consultas com:
  - Seleção de condição de pagamento
  - Cálculo de descontos e acréscimos
  - Criação automática de título a receber
  - Registro automático na contabilidade

### 3. **Estados de Recebimento**
- ✅ **PAGO**: Recebimento processado com sucesso
- ✅ **ESTORNADO**: Recebimento foi desfeito
- ✅ **PENDENTE**: Aguardando recebimento

### 4. **Interface Atualizada**
- ✅ Página de Recebimentos mostra:
  - Status do agendamento (AGENDADO, CONFIRMADO, ATENDIDO, etc)
  - Status do recebimento (PAGO, ESTORNADO)
  - Botão "Receber" (para agendamentos não recebidos)
  - Botão "Estornar" (para recebimentos já feitos)
  - Botão "Receber Novamente" (para recebimentos estornados)

### 5. **Funcionalidades**
- ✅ Receber consulta → Marca como PAGO
- ✅ Estornar recebimento → Volta para ESTORNADO + permite receber novamente
- ✅ Ajustes de desconto e acréscimo
- ✅ Integração com título a receber e movimentos de caixa/banco

---

## 📋 SQLs para Executar

Execute os seguintes arquivos SQL **no banco de dados do cliente** em ordem:

```bash
1. novos/12_add_categoria_recebimentos.sql
2. novos/13_add_pix_condicao_pagamento.sql
3. novos/14_fix_recebimento_movimento_banco.sql
4. novos/15_recebimento_com_triggers.sql
```

### ⚠️ Instruções

1. Abra o pgAdmin ou seu cliente PostgreSQL
2. Conecte ao banco de dados: `fin_{slug}` (seu banco da clínica)
3. Abra cada arquivo SQL na ordem acima
4. Execute os comandos

**Verificação:**
```sql
-- Verificar se coluna existe
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tab_recebimento_consulta' 
AND column_name = 'status_recebimento';

-- Deve retornar uma linha com 'status_recebimento'
```

---

## 🎮 Como Usar

### Receber uma Consulta

1. Acesse **Clínica → Recebimentos**
2. Selecione a data desejada
3. Procure o agendamento com status **ATENDIDO**
4. Clique no botão **"Receber"** (verde)
5. No modal:
   - Selecione a **Condição de Pagamento** (ex: DINHEIRO, PIX, PARCELADO)
   - Insira o **Valor Recebido** (já vem preenchido)
   - Aplique **Desconto** ou **Acréscimo** se necessário
   - Adicione **Observação** se quiser
6. Clique em **"Confirmar Recebimento"**

✅ **Resultado:**
- Status muda para **PAGO** 💰
- Título a receber criado automaticamente
- Movimento de caixa/banco registrado

### Estornar um Recebimento

1. Na lista, procure o agendamento com status **PAGO** 💰
2. Clique em **"Estornar"** (vermelho)
3. Insira o **Motivo do Estorno**
4. Clique confirmar

✅ **Resultado:**
- Status muda para **ESTORNADO**
- Movimentos de caixa/banco são revertidos
- Título a receber reabre como "Aberto"
- Botão muda para **"Receber Novamente"**

### Receber Novamente após Estorno

1. Clique em **"Receber Novamente"** no agendamento estornado
2. Repita o processo de recebimento

---

## 📊 Status do Agendamento

| Status | Descrição | Pode Receber? |
|--------|-----------|---------------|
| AGENDADO | Marcado para o futuro | ✅ Sim |
| CONFIRMADO | Paciente confirmou | ✅ Sim |
| AGUARDANDO | Aguardando chegada | ✅ Sim |
| ATENDIDO | Consulta realizada | ✅ Sim |
| FALTOU | Paciente não compareceu | ❌ Não |
| CANCELADO | Cancelado | ❌ Não |

---

## 💾 Dados Salvos

Cada recebimento registra:
- **Agendamento** relacionado
- **Paciente**
- **Profissional**
- **Valor original** da consulta
- **Desconto** aplicado
- **Acréscimo** (juros, taxa)
- **Total recebimento** = original - desconto + acréscimo
- **Condição de pagamento** (DINHEIRO, PIX, etc)
- **Título a receber** criado
- **Movimento** (caixa ou banco)
- **Data e observação**

---

## 🔍 Troubleshooting

### "Erro ao processar recebimento"

**Causa:** Coluna `movimento_banco_id` não existe

**Solução:**
```sql
-- Executar no seu banco
ALTER TABLE tab_recebimento_consulta
  ADD COLUMN IF NOT EXISTS movimento_banco_id INT REFERENCES tab_movimento_banco(id);

CREATE INDEX IF NOT EXISTS idx_rc_movimento_banco ON tab_recebimento_consulta(movimento_banco_id);
```

### Recebimento não aparece após salvar

1. Atualize a página (F5)
2. Verifique se a **Condição de Pagamento** está ativa
3. Verifique os logs do servidor

### Não consegue estornar

Possíveis causas:
- Recebimento já foi estornado
- Movimentos de caixa/banco já foram conciliados
- Falta de permissão

---

## 📝 Notas Importantes

- **Maiúsculas**: Todos os campos de texto são salvos em MAIÚSCULA (conforme regra do projeto)
- **Data**: A data do recebimento é sempre a data do agendamento
- **PIX**: Se a condição de pagamento for PIX, a conta bancária precisa estar configurada
- **Sincronização**: Recebimentos são sincronizados em tempo real com o financeiro

---

## 🚀 Próximas Melhorias

- [ ] Relatório de recebimentos
- [ ] Integração com boletos
- [ ] Agendamento automático de notificações de pagamento
- [ ] Extrato de recebimentos por período
- [ ] Filtro avançado de recebimentos

