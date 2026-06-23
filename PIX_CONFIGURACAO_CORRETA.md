# ✅ PIX - Configuração Correta

## 🎯 Fluxo Correto

### Passo 1: Admin Cadastra Condição PIX
**Local**: `/cadastro/condicoes-pagamento`

1. Clique em **"+ Novo"**
2. Preencha:
   - **ID**: 5 (ou próximo disponível)
   - **Descrição**: PIX
   - **Tipo**: À Vista
   - **Pagamento a vista**: 1 parcela
   - **Ativo**: Sim

3. **Novo campo** (em nossa migration): 
   - **Tipo de Pagamento**: PIX
   - **Conta Bancária (PIX)**: Selecione a conta que receberá os PIX

4. Clique em **"Salvar"**

### Passo 2: Usuário Registra Recebimento
**Local**: `/clinica/recebimentos`

1. Selecione a data
2. Clique em **"Receber"**
3. Modal abre:
   - **Condição de Pagamento**: Seleciona "PIX" (já vem pré-configurada a conta)
   - **Valores**: Preenche quanto recebeu
   - Clica **"Confirmar"**

4. Sistema automaticamente:
   - ✅ Marca consulta como ATENDIDA
   - ✅ Cria título a receber
   - ✅ Cria movimento em BANCO (na conta pré-configurada)

---

## 📋 Estrutura de Dados

### tab_condicao_pagamento (EXPANDIDA)
```sql
CREATE TABLE tab_condicao_pagamento (
  id serial PRIMARY KEY,
  empresa_id int NOT NULL,
  descricao varchar(80) NOT NULL,          -- "PIX", "À Vista", etc
  tipo char(1) NOT NULL,                   -- V=À Vista, P=Parcelado
  num_parcelas int DEFAULT 1,
  intervalo_dias int DEFAULT 30,
  entrada_pct numeric DEFAULT 0,
  tipo_pagamento varchar(20) DEFAULT 'dinheiro',  -- ← NOVO
  conta_banco_pix_id int,                  -- ← NOVO: FK se tipo_pagamento=pix
  ativo bool DEFAULT true
);
```

### Exemplos de Condições Cadastradas
| ID | Descrição | Tipo | Tipo Pagamento | Conta PIX |
|----|-----------|------|----------------|-----------|
| 1  | À Vista   | V    | dinheiro       | NULL |
| 2  | Débito    | V    | debito         | NULL |
| 3  | Crédito 3x| P    | credito        | NULL |
| 4  | PIX       | V    | pix            | 2 (Banco Brasil) |
| 5  | PIX-Caixa | V    | pix            | 3 (Caixa) |

---

## 🔄 Fluxo de Dados

```
┌─────────────────────────────┐
│ ADMIN: Cadastra PIX         │
│ Tipo Pagamento = PIX        │
│ Conta PIX = Banco Brasil    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ USUÁRIO: Recebe Consulta    │
│ Seleciona Condição = PIX    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ API: Processa Recebimento   │
│ 1. Lê tipo_pagamento        │
│ 2. Lê conta_banco_pix_id    │
│ 3. Cria movimento_banco     │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ SISTEMA: Registra Tudo      │
│ ✅ Consulta = ATENDIDA      │
│ ✅ Título criado            │
│ ✅ Movimento em Banco       │
└─────────────────────────────┘
```

---

## 🗂️ Benefícios da Forma Correta

✅ **Admin controla**: Qual banco recebe cada tipo de PIX  
✅ **Sem dúvida**: Usuário seleciona e sistema já sabe o resto  
✅ **Segurança**: Não permite usar conta errada  
✅ **Auditoria**: Rastreia qual conta recebeu cada PIX  
✅ **Escalável**: Pode ter múltiplas contas PIX configuradas  

---

## 📊 Visualização no Recebimento

**Antes (Usuario seleciona conta)**:
```
Condição de Pagamento: [PIX ▼]
Conta Bancária:        [Banco Brasil ▼]
Valor:                 [150.00]
```

**Depois (Já vem pré-preenchido)**:
```
Condição de Pagamento: [PIX [PIX] ▼]
                       ✓ PIX - Conta bancária pré-configurada
Valor:                 [150.00]
```

---

## 🚀 Implementação

### Migration
```sql
ALTER TABLE tab_condicao_pagamento
  ADD COLUMN tipo_pagamento VARCHAR(20) DEFAULT 'dinheiro',
  ADD COLUMN conta_banco_pix_id INT REFERENCES tab_conta_banco(id);
```

### API
```typescript
// Lê tipo e conta da condição
const { tipo_pagamento, conta_banco_pix_id } = await db.query(
  'SELECT tipo_pagamento, conta_banco_pix_id FROM tab_condicao_pagamento WHERE id = ?'
)

// Se PIX, cria movimento_banco
if (tipo_pagamento === 'pix') {
  INSERT INTO tab_movimento_banco (conta_banco_id = conta_banco_pix_id, ...)
}
```

### Modal
```jsx
// Mostra informação que PIX já vem pré-configurado
{condicaoSelecionada?.tipo_pagamento === 'pix' && (
  <div>✓ PIX - Conta bancária pré-configurada</div>
)}
```

---

## ✅ Checklist

- [ ] Migration SQL 13 aplicada
- [ ] Contas bancárias cadastradas (PIX)
- [ ] Condição "PIX" criada com conta_banco_pix_id preenchida
- [ ] Modal mostra "Conta pré-configurada" para PIX
- [ ] Recebimento PIX cria movimento_banco na conta correta
- [ ] Título a receber criado
- [ ] Teste: Registrar PIX e verificar em Movimento Banco

---

**Data**: 23/06/2026  
**Versão**: 1.0.3 (PIX Vinculado à Condição)
