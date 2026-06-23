# Setup - Sistema de Recebimentos de Consultas

## 📋 Pré-requisitos

1. Banco de dados PostgreSQL com os schemas:
   - `01_schema_cadastros.sql` ✅
   - `02_schema_financeiro.sql` ✅
   - `04_schema_clinica.sql` ✅

2. Tabelas necessárias:
   - `tab_agendamento` (agendamentos)
   - `tab_titulo_receber` (títulos a receber)
   - `tab_movimento_caixa` (movimentos de caixa)
   - `tab_tipo_receita` (tipos de receita)
   - `tab_pessoa` (pacientes)

## 🔧 Passos de Instalação

### Passo 1: Aplicar Migration SQL

Execute o script SQL para criar as novas tabelas e colunas:

```bash
psql -U postgres -d fin_{slug} -f novos/12_add_categoria_recebimentos.sql
```

**O que será criado:**

1. **Coluna `valor` em `tab_agendamento_tipo`**
   - Armazena o valor padrão de cada tipo de consulta
   - Exemplo: Consulta = R$ 150, Retorno = R$ 80

2. **Tabela `tab_categoria`**
   - Categorias de agendamentos (Primeira consulta, Retorno, etc.)
   - Cada empresa pode ter suas próprias categorias

3. **Tabela `tab_tipo_categoria_valor`**
   - Vinculação entre tipo de atendimento e categoria com valor customizado
   - Permite valores diferentes para o mesmo tipo conforme a categoria

4. **Tabela `tab_recebimento_consulta`**
   - Registro completo de todos os recebimentos
   - Rastreabilidade total
   - Vinculação com títulos a receber e movimentos de caixa

### Passo 2: Verificar Tipo de Receita

Certifique-se de que existe um tipo de receita configurado:

```sql
SELECT id, descricao FROM tab_tipo_receita LIMIT 5;
```

Se não existir, crie um:

```sql
INSERT INTO tab_tipo_receita (empresa_id, descricao, ativo)
VALUES (1, 'Consulta Clínica', true);
```

### Passo 3: Configurar Tipos de Atendimento com Valores

Para que o sistema funcione, configure os valores nos tipos de atendimento:

```sql
UPDATE tab_agendamento_tipo
SET valor = 150.00
WHERE descricao = 'Consulta';

UPDATE tab_agendamento_tipo
SET valor = 80.00
WHERE descricao = 'Retorno';
```

### Passo 4: Criar Categorias (Opcional)

```sql
INSERT INTO tab_categoria (empresa_id, descricao, ativo)
VALUES
  (1, 'Primeira Consulta', true),
  (1, 'Retorno', true),
  (1, 'Procedimento', true);
```

### Passo 5: Configurar Valores por Categoria (Opcional)

Se quiser valores diferentes por categoria:

```sql
INSERT INTO tab_tipo_categoria_valor (tipo_id, categoria_id, valor, ativo)
VALUES
  (1, 1, 200.00, true),  -- Tipo "Consulta" + Categoria "Primeira Consulta" = R$ 200
  (1, 2, 150.00, true);  -- Tipo "Consulta" + Categoria "Retorno" = R$ 150
```

## 🚀 Uso do Sistema

### No Aplicativo

1. **Clínica > Recebimentos**
2. Selecione a data desejada
3. Clique em "Receber" no agendamento
4. Preencha:
   - **Forma de Pagamento**: Dinheiro / Débito / Crédito
   - **Valor Recebido**: Valor que o paciente pagou
   - **Desconto**: Se houver (opcional)
   - **Acréscimo**: Se houver (opcional)
   - **Observação**: Informações adicionais (opcional)
5. Clique "Confirmar Recebimento"

### O que acontece automaticamente

1. ✅ Status da consulta → ATENDIDO
2. ✅ Título a receber → Criado e Liquidado
3. ✅ Movimento de caixa → Criado (se pagamento em dinheiro)
4. ✅ Registro de auditoria → Guardado em `tab_recebimento_consulta`

## 📊 Integração com Financeiro

### Títulos a Receber

Todos os recebimentos criam um título a receber liquidado:
- **Rota**: `/financeiro/contas-receber`
- **Status**: L (Liquidado)
- **Referência**: AG-### (número do agendamento)
- **Valores**: Original, Desconto, Acréscimo

### Movimento de Caixa

Se pagamento em **dinheiro**, cria movimento de caixa:
- **Rota**: `/financeiro/movimento-caixa`
- **Tipo**: E (Entrada)
- **Referência**: Vinculado ao título a receber

### Fluxo de Caixa / DRE

Os movimentos aparecem em:
- **Rota**: `/gerencial/fluxo-caixa`
- **Data**: Data do recebimento
- **Tipo**: Entrada de caixa

## 🔍 Consultas Úteis

### Recebimentos do dia

```sql
SELECT 
  rc.id,
  ag.id as agendamento_id,
  p.nome as paciente,
  rc.forma_pagamento,
  rc.total_recebimento,
  rc.created_at
FROM tab_recebimento_consulta rc
JOIN tab_agendamento ag ON ag.id = rc.agendamento_id
JOIN tab_pessoa p ON p.id = rc.paciente_id
WHERE rc.data_recebimento = CURRENT_DATE
ORDER BY rc.created_at DESC;
```

### Total recebido por forma de pagamento

```sql
SELECT 
  forma_pagamento,
  COUNT(*) as quantidade,
  SUM(total_recebimento) as total
FROM tab_recebimento_consulta
WHERE data_recebimento BETWEEN '2026-06-01' AND '2026-06-30'
GROUP BY forma_pagamento;
```

### Reconciliação: Recebimentos vs Títulos

```sql
SELECT 
  rc.id as recebimento_id,
  rc.agendamento_id,
  rc.total_recebimento,
  tr.valor_liquidado as titulo_valor,
  CASE WHEN rc.total_recebimento = tr.valor_liquidado THEN 'OK' ELSE 'DIVERGÊNCIA' END as status
FROM tab_recebimento_consulta rc
JOIN tab_titulo_receber tr ON tr.id = rc.titulo_receber_id
WHERE rc.data_recebimento >= CURRENT_DATE - INTERVAL '7 days';
```

## ⚠️ Troubleshooting

### Erro: "numero_titulo is NOT NULL"

**Problema**: Campo obrigatório não preenchido

**Solução**: Verifique se o endpoint está gerando `numero_titulo` corretamente

### Erro: "tab_recebimento_consulta not found"

**Problema**: Migration SQL não foi aplicada

**Solução**: 
```bash
psql -U postgres -d fin_{slug} -f novos/12_add_categoria_recebimentos.sql
```

### Recebimento não aparece no movimento de caixa

**Problema**: Forma de pagamento não é "dinheiro"

**Solução**: 
- Débito/Crédito: criar recebimento mas SEM movimento de caixa
- Dinheiro: cria movimento de caixa automaticamente
- Para débito/crédito em banco: usar o módulo financeiro direto

## 📝 Campos das Tabelas

### tab_recebimento_consulta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL | Chave primária |
| empresa_id | INT | Referência da empresa |
| agendamento_id | INT | Referência do agendamento |
| paciente_id | INT | Referência do paciente |
| forma_pagamento | VARCHAR | dinheiro \| debito \| credito |
| valor_original | NUMERIC | Valor base da consulta |
| valor_desconto | NUMERIC | Desconto aplicado |
| valor_acrescimo | NUMERIC | Acréscimo/taxa |
| valor_recebido | NUMERIC | Valor que paciente pagou |
| total_recebimento | NUMERIC | Valor final (recebido - desc + acresc) |
| titulo_receber_id | INT | FK para tab_titulo_receber |
| movimento_caixa_id | INT | FK para tab_movimento_caixa (apenas dinheiro) |
| data_recebimento | DATE | Data do recebimento |
| observacao | TEXT | Observações |
| created_by | VARCHAR | Usuário que registrou |
| created_at | TIMESTAMPTZ | Data/hora de criação |

## ✅ Checklist Pós-Instalação

- [ ] Migration SQL aplicada com sucesso
- [ ] Tipos de atendimento configurados com valores
- [ ] Tipos de receita existem na base
- [ ] Testar recebimento em dinheiro
- [ ] Testar recebimento em débito
- [ ] Verificar se título a receber foi criado
- [ ] Verificar se movimento de caixa foi criado (dinheiro)
- [ ] Validar valores no financeiro
- [ ] Testar relatório de recebimentos

---

**Suporte**: Fernando Vieira (fernando.vieira@digitalrf.com.br)
