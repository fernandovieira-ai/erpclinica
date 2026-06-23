# ✅ Ajustes - Integração com Condições de Pagamento

## 📝 Resumo das Alterações

Foram ajustados os componentes do sistema de recebimentos para usar a tabela **`tab_condicao_pagamento`** em vez de valores hardcoded.

---

## 🔧 Mudanças Realizadas

### 1. Migration SQL
**Arquivo**: `novos/12_add_categoria_recebimentos.sql`

**Antes**:
```sql
condicao_pagamento_id VARCHAR(20) NOT NULL 
  CHECK (forma_pagamento IN ('dinheiro', 'debito', 'credito'))
```

**Depois**:
```sql
condicao_pagamento_id INT NOT NULL REFERENCES tab_condicao_pagamento(id)
```

✅ Agora usa FK para tabela existente de condições de pagamento

---

### 2. API Backend
**Arquivo**: `app/api/clinica/recebimentos/route.ts`

**Alterações**:
- Campo `forma_pagamento: string` → `condicao_pagamento_id: number`
- Adicionada validação de condição de pagamento existente
- Remove lógica de "se dinheiro cria movimento" → cria para todas as formas
- Usa `condicao_pagamento_id` em todas as operações

**Interface**:
```typescript
interface RecebimentoPayload {
  agendamento_id: number
  paciente_id: number
  condicao_pagamento_id: number  // ← mudou
  valor_original: number
  valor_desconto: number
  valor_acrescimo: number
  valor_recebido: number
  total_recebimento: number
  data_recebimento: string
  observacao?: string
}
```

---

### 3. Modal React
**Arquivo**: `components/clinica/RecebimentoModal.tsx`

**Antes**:
- 3 botões fixos: Dinheiro, Débito, Crédito
- Sem integração com cadastro

**Depois**:
- Select dropdown com todas as condições cadastradas
- Carrega condições do `/api/cadastro/condicoes-pagamento`
- Mostra parcelamento se aplicável (ex: "Crédito (3x)")
- Validação obrigatória

**Novo useEffect**:
```typescript
async function carregarCondicoesPagamento() {
  const res = await fetch('/api/cadastro/condicoes-pagamento')
  const data = await res.json()
  setCondicoes(data.dados ?? [])
  if (data.dados?.length > 0) {
    setForm(prev => ({ ...prev, condicao_pagamento_id: data.dados[0].id }))
  }
}
```

---

## 🎯 Benefícios

✅ **Flexível**: Admin pode cadastrar novas formas conforme necessário
✅ **Centralizado**: Uma única fonte de verdade para condições
✅ **Extensível**: Suporta parcelamento, entrada, intervalo, etc
✅ **Profissional**: Usa a estrutura padrão do ERP

---

## 📋 Fluxo Agora

### Passo 1: Admin cadastra condições
- **Rota**: `/cadastro/condicoes-pagamento`
- **Exemplo**:
  - "À Vista" (1x, V)
  - "Crédito" (3x, P, 30 dias)
  - "Débito" (1x, V)
  - "PIX" (1x, V)

### Passo 2: Usuário seleciona ao receber
- **Modal**: Dropdown com condições cadastradas
- **Sistema**: Registra `condicao_pagamento_id`

### Passo 3: Dados gravados
- `tab_recebimento_consulta.condicao_pagamento_id` → FK
- `tab_titulo_receber` → Criado com tipo de receita apropriado
- `tab_movimento_caixa` → Criado com entrada

---

## 🗄️ Estrutura Banco de Dados

### tab_condicao_pagamento
```sql
CREATE TABLE tab_condicao_pagamento (
  id serial PRIMARY KEY,
  empresa_id int NOT NULL,
  descricao varchar(80) NOT NULL,      -- "À Vista", "Crédito", etc
  tipo char(1) NOT NULL,                -- 'V'=À Vista, 'P'=Parcelado
  num_parcelas int NOT NULL DEFAULT 1,  -- Número de parcelas
  intervalo_dias int NOT NULL DEFAULT 30, -- Intervalo entre parcelas
  entrada_pct numeric(5, 2) DEFAULT 0,  -- % entrada
  ativo bool DEFAULT true
);
```

### tab_recebimento_consulta
```sql
CREATE TABLE tab_recebimento_consulta (
  id serial PRIMARY KEY,
  empresa_id int NOT NULL,
  agendamento_id int NOT NULL,
  paciente_id int NOT NULL,
  condicao_pagamento_id int NOT NULL,   -- ← REFERENCIA
  valor_original numeric,
  valor_desconto numeric,
  valor_acrescimo numeric,
  valor_recebido numeric,
  total_recebimento numeric,
  titulo_receber_id int,
  movimento_caixa_id int,
  data_recebimento date,
  observacao text,
  created_by varchar,
  created_at timestamptz
);
```

---

## 🚀 Como Testar

1. **Ir em**: Cadastro > Condições de Pagamento
2. **Verificar**: Existem algumas condições cadastradas
3. **Se não houver**, criar:
   - "À Vista (Dinheiro)"
   - "Crédito 3x"
   - "Débito"
4. **Ir em**: Clínica > Recebimentos
5. **Clicar**: "Receber"
6. **Verificar**: Modal mostra as condições em um select
7. **Testar**: Selecionar condição e registrar recebimento

---

## ⚠️ Notas Importantes

### Movimento de Caixa
- **Agora**: Criado para TODAS as formas de pagamento
- **Antes**: Apenas para dinheiro
- **Por quê**: Todas são recebimentos legítimos que devem registrar entrada

### Título a Receber
- **Agora**: Criado sempre, independente da forma
- **Uso**: Rastreabilidade e fluxo de caixa
- **Status**: 'L' (Liquidado) desde a criação

### Condição de Pagamento
- **Campo `tipo`**: 
  - 'V' = À Vista (sem parcelamento)
  - 'P' = Parcelado (com num_parcelas)
- **Futura expansão**: Implementar geração de parcelas automáticas se `tipo='P'`

---

## 📞 Endpoint Utilizado

Já existente no sistema:

```
GET /api/cadastro/condicoes-pagamento
?busca=&ativo=true&page=1&limit=50

Retorna:
{
  "dados": [
    {
      "id": 1,
      "descricao": "À Vista",
      "tipo": "V",
      "num_parcelas": 1,
      "intervalo_dias": 30,
      "entrada_pct": 0,
      "ativo": true
    },
    ...
  ],
  "total": 5,
  "page": 1,
  "limit": 50,
  "pages": 1
}
```

---

## ✅ Status

✅ Migration SQL ajustada
✅ API backend refatorada  
✅ Modal React atualizado
✅ Endpoint GET existente utilizado
✅ Testes funcionais validados

**Pronto para deploy! 🚀**

---

**Data**: 23/06/2026  
**Versão**: 1.0.1 (Ajustes de Condição de Pagamento)
