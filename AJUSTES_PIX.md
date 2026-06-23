# ✅ Suporte a PIX - Sistema de Recebimentos

## 📋 Resumo das Alterações

Adicionado suporte completo para recebimentos via PIX com seleção automática da conta bancária que receberá o PIX.

---

## 🔧 Mudanças Realizadas

### 1. Migration SQL
**Arquivo**: `novos/13_add_pix_condicao_pagamento.sql`

**Alterações**:
1. Expandiu CHECK constraint de `tab_condicao_pagamento.tipo`:
   - Antes: `V` (À Vista), `P` (Parcelado)
   - Depois: `V` (À Vista), `P` (Parcelado), `X` (PIX)

2. Adicionadas colunas em `tab_recebimento_consulta`:
   - `conta_banco_id` - FK para `tab_conta_banco`
   - `tipo_recebimento` - CHAR(1): 'C'=Caixa, 'B'=Banco, 'X'=PIX

3. Criada VIEW `vw_recebimentos_consulta`:
   - Facilita consultas com joins automáticos
   - Inclui dados de conta bancária

---

### 2. API Backend
**Arquivo**: `app/api/clinica/recebimentos/route.ts`

**Interface atualizada**:
```typescript
interface RecebimentoPayload {
  // ... campos anteriores
  conta_banco_id: number | null  // ← novo
}
```

**Lógica nova**:
```typescript
// Detecta tipo de condição
const tipoCond = await db.query('SELECT tipo FROM tab_condicao_pagamento...')

if (tipoCond === 'X') {
  // PIX: cria movimento_banco
  INSERT INTO tab_movimento_banco (conta_banco_id=...)
  tipo_recebimento = 'X'
} else {
  // Outras formas: cria movimento_caixa
  INSERT INTO tab_movimento_caixa (...)
  tipo_recebimento = 'C'
}
```

**Resposta**:
```json
{
  "sucesso": true,
  "recebimento_id": 123,
  "titulo_receber_id": 456,
  "movimento_caixa_id": null,
  "movimento_banco_id": 789,
  "tipo_recebimento": "X",
  "mensagem": "Recebimento processado com sucesso"
}
```

---

### 3. Modal React
**Arquivo**: `components/clinica/RecebimentoModal.tsx`

**Alterações**:
1. Estado expandido:
   ```typescript
   interface FormRecebimento {
     condicao_pagamento_id: number
     conta_banco_id: number | null  // ← novo
     // ... campos anteriores
   }
   ```

2. Novo hook para detectar PIX:
   ```typescript
   const condicaoSelecionada = condicoes.find(c => c.id === form.condicao_pagamento_id)
   const ehPix = condicaoSelecionada?.tipo === 'X'
   ```

3. Carregamento de contas bancárias:
   ```typescript
   async function carregarContas() {
     const res = await fetch('/api/cadastro/contas-banco?ativo=true')
     setContas(data.dados ?? [])
   }
   ```

4. Novo campo condicional no formulário:
   ```jsx
   {ehPix && (
     <Field>
       <Label>Conta Bancária (PIX)</Label>
       <select value={form.conta_banco_id} onChange={...} />
     </Field>
   )}
   ```

5. Validação adicional:
   ```typescript
   if (ehPix && !form.conta_banco_id) {
     toast.error('Selecione a conta bancária para o PIX')
     return
   }
   ```

---

## 🎯 Fluxo de Uso

### Cenário 1: Pagamento em Dinheiro
```
1. Usuário: Clínica > Recebimentos > Receber
2. Modal: Mostra "À Vista" na lista de condições
3. Usuário: Seleciona "À Vista"
4. Sistema: NÃO mostra campo de banco
5. Usuário: Preenche valores e confirma
6. Sistema: 
   ✅ Cria título a receber
   ✅ Cria movimento_caixa
```

### Cenário 2: Pagamento via PIX
```
1. Usuário: Clínica > Recebimentos > Receber
2. Modal: Mostra "PIX [PIX]" na lista de condições
3. Usuário: Seleciona "PIX [PIX]"
4. Sistema: EXIBE campo de banco em destaque
5. Usuário: 
   - Preenche valores
   - Seleciona conta bancária (ex: "Banco Brasil - Ag. 0001")
   - Confirma
6. Sistema:
   ✅ Cria título a receber
   ✅ Cria movimento_banco (na conta selecionada)
   ✅ Registra tipo_recebimento='X'
```

---

## 💾 Estrutura de Dados

### Tipos de Recebimento
| Tipo | Descrição | Movimento | Tabela |
|------|-----------|-----------|--------|
| C | Caixa | movement_caixa | tab_movimento_caixa |
| B | Banco | movement_banco | tab_movimento_banco |
| X | PIX (Banco) | movement_banco | tab_movimento_banco |

### Condição de Pagamento
| tipo | Descrição | Parcelas | Usa Banco? |
|------|-----------|----------|-----------|
| V | À Vista | 1 | Não |
| P | Parcelado | 2+ | Não |
| X | PIX | 1 | **Sim** |

---

## 🔍 Consultas SQL Úteis

### Recebimentos PIX de hoje
```sql
SELECT 
  rc.id,
  pac.nome,
  cb.nome_conta,
  cb.banco,
  rc.total_recebimento,
  rc.created_at
FROM tab_recebimento_consulta rc
  JOIN tab_agendamento ag ON ag.id = rc.agendamento_id
  JOIN tab_pessoa pac ON pac.id = ag.paciente_id
  JOIN tab_conta_banco cb ON cb.id = rc.conta_banco_id
WHERE rc.tipo_recebimento = 'X'
  AND rc.data_recebimento = CURRENT_DATE
ORDER BY rc.created_at DESC;
```

### Total por tipo de recebimento
```sql
SELECT 
  tipo_recebimento,
  COUNT(*) as quantidade,
  SUM(total_recebimento) as total
FROM tab_recebimento_consulta
WHERE data_recebimento = CURRENT_DATE
GROUP BY tipo_recebimento;
```

### Reconciliação PIX
```sql
SELECT 
  rc.id,
  pac.nome,
  cb.nome_conta,
  rc.total_recebimento,
  mb.valor as movimento_valor,
  CASE WHEN rc.total_recebimento = mb.valor THEN 'OK' ELSE 'DIVERGÊNCIA' END
FROM tab_recebimento_consulta rc
  JOIN tab_agendamento ag ON ag.id = rc.agendamento_id
  JOIN tab_pessoa pac ON pac.id = ag.paciente_id
  JOIN tab_conta_banco cb ON cb.id = rc.conta_banco_id
  JOIN tab_movimento_banco mb ON mb.id = rc.movimento_banco_id
WHERE rc.tipo_recebimento = 'X'
  AND rc.data_recebimento >= CURRENT_DATE - INTERVAL '7 days';
```

---

## 📊 Integração com Financeiro

### Quando registra PIX:
1. ✅ **Título a Receber** é criado (status L - Liquidado)
2. ✅ **Movimento Banco** é criado (tipo E - Entrada, na conta selecionada)
3. ✅ **Recebimento** é registrado (tipo_recebimento='X')

### Visualização:
- **Contas a Receber**: Mostra o título com referência do agendamento
- **Movimento Banco**: Mostra entrada de PIX na conta especificada
- **Fluxo de Caixa**: Inclui PIX como receita do dia

---

## ⚙️ Configuração Necessária

### 1. Cadastrar Contas Bancárias
**Rota**: `/cadastro/contas-banco`
- Criar contas que receberão PIX
- Marcá-las como ativas

### 2. Cadastrar Condição de Pagamento PIX
**Rota**: `/cadastro/condicoes-pagamento`
- Criar: "PIX" ou "PIX - A Vista"
- Tipo: `X` (PIX)
- Parcelas: 1
- Ativo: Sim

### 3. Testar
- Clínica > Recebimentos
- Selecionar condição "PIX"
- Verificar se aparece campo de banco
- Selecionar conta e registrar

---

## 🔐 Segurança

✅ Validação obrigatória de conta_banco_id para PIX
✅ FK garante que conta existe
✅ Usuário criador é registrado (created_by)
✅ Transação SQL garante integridade
✅ Movimento_banco sempre vinculado a movimento_caixa ou recebimento

---

## 📈 Futuras Expansões

- [ ] Extrato automático de PIX
- [ ] Conciliação automática PIX
- [ ] Notificação quando PIX for recebido
- [ ] Relatório de PIX por conta
- [ ] Agendamento de PIX (QR Code futuro)

---

## ✅ Checklist Pós-Instalação

- [ ] Migration SQL 13 aplicada
- [ ] Contas bancárias cadastradas
- [ ] Condição "PIX" criada (tipo='X')
- [ ] App reiniciada
- [ ] Modal mostra campo de banco ao selecionar PIX
- [ ] Recebimento PIX registrado com sucesso
- [ ] Movimento_banco criado na conta correta
- [ ] Título a receber criado

---

**Data**: 23/06/2026  
**Versão**: 1.0.2 (Suporte a PIX)
