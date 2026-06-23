# ⚡ Executar SQLs - Recebimentos

## 🚀 Passo a Passo Rápido

### 1. Abrir pgAdmin
```
http://localhost:5050
```
ou seu host pgAdmin

### 2. Conectar ao Banco
- Navegue até: **Servers → PostgreSQL → Databases**
- Selecione o banco: `fin_{seu_slug}` (exemplo: `fin_clinica`)

### 3. Executar os SQLs em Ordem

#### **SQL 1: Categorias e Recebimentos Base**
```
Arquivo: novos/12_add_categoria_recebimentos.sql
```
- Clique no banco
- Clique em **Query Tool** (atalho: Alt + Ctrl + Q)
- Copie todo o conteúdo do arquivo
- Clique em **Execute** (F5)
- ✅ Sucesso: Nenhuma mensagem de erro

#### **SQL 2: PIX e Condição de Pagamento**
```
Arquivo: novos/13_add_pix_condicao_pagamento.sql
```
- Repetir o mesmo processo
- Este adiciona o suporte a PIX

#### **SQL 3: Corrigir Coluna de Movimento Banco**
```
Arquivo: novos/14_fix_recebimento_movimento_banco.sql
```
- Repetir o mesmo processo
- Este garante que a coluna `movimento_banco_id` existe

#### **SQL 4: Triggers Automáticas**
```
Arquivo: novos/15_recebimento_com_triggers.sql
```
- Repetir o mesmo processo
- ⚠️ Este é o mais importante, adiciona a automação

### 4. Verificar Sucesso

Execute este comando para verificar:

```sql
-- Verificar coluna status_recebimento
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tab_recebimento_consulta' 
AND column_name IN ('status_recebimento', 'movimento_banco_id')
ORDER BY column_name;
```

Deve retornar **2 linhas** (movement_banco_id e status_recebimento)

```sql
-- Verificar triggers
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name LIKE 'trg_%recebimento%'
ORDER BY trigger_name;
```

Deve retornar **2 linhas** (triggers de movimento_caixa e movimento_banco)

---

## ❌ Se der Erro

### Erro: "relation "tab_recebimento_consulta" does not exist"

**Significa**: A tabela não existe, você precisa executar primeiro o SQL #1

**Solução**: Execute o `12_add_categoria_recebimentos.sql`

### Erro: "column "status_recebimento" already exists"

**Significa**: A coluna já foi criada antes

**Solução**: Ignore o erro, continue para o próximo SQL

### Erro: "function fn_processar_recebimento_movimento() already exists"

**Significa**: A função já foi criada

**Solução**: Ignore o erro, continue

---

## 🧪 Testar após Executar

### 1. Ir para Recebimentos
- Navegue até: **Clínica → Recebimentos**

### 2. Selecionar um agendamento
- Procure um com status **ATENDIDO**

### 3. Clique em "Receber"
- Deve abrir o modal
- Selecione a condição de pagamento
- Clique em "Confirmar Recebimento"

### 4. Verificar Resultado
- Status deve mudar para **PAGO** 💰
- Deve aparecer botão **"Estornar"** (vermelho)
- Deve aparecer a cor **verde** indicando "Pago"

---

## 📞 Suporte

Se der erro, envie para o desenvolvedor:
1. Screenshot do erro
2. Qual SQL estava executando
3. Qual banco estava usando (fin_xxx)

---

## 💡 Dica

Se quiser executar tudo de uma vez, abra o Query Tool e copie:

```sql
-- Copie um SQL por vez, não todos juntos
-- Porque cada SQL demora um tempo para processar
```

**Melhor deixar executar um de cada vez e esperar terminar.**

