# 🚀 DEPLOY - Sistema de Recebimentos

## ⏱️ Tempo Estimado: 5 minutos

## Step 1️⃣ - Aplicar Migration SQL

```bash
# Conecte ao PostgreSQL como superuser e execute:
psql -U postgres -d fin_{seu_slug} -f novos/12_add_categoria_recebimentos.sql
```

**Saída esperada:**
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
```

## Step 2️⃣ - Verificar Tipo de Receita

```sql
-- No pgAdmin ou psql, execute:
SELECT id, descricao FROM tab_tipo_receita WHERE descricao ILIKE '%consul%' LIMIT 1;
```

**Se não retornar nada, crie:**
```sql
INSERT INTO tab_tipo_receita (empresa_id, descricao, ativo)
VALUES (1, 'Consulta Clínica', true);
```

## Step 3️⃣ - Configurar Valores nos Tipos de Atendimento

```sql
-- Configure os valores dos tipos de atendimento:
UPDATE tab_agendamento_tipo
SET valor = 150.00
WHERE descricao = 'Consulta';

UPDATE tab_agendamento_tipo
SET valor = 80.00
WHERE descricao = 'Retorno';

-- Verifique:
SELECT id, descricao, valor FROM tab_agendamento_tipo;
```

## Step 4️⃣ - Restart da Aplicação

```bash
# No terminal do projeto:
npm run dev
# ou
yarn dev
```

## Step 5️⃣ - Testar

1. Vá para **Clínica > Recebimentos**
2. Selecione um dia com agendamentos
3. Clique em **"Receber"** em qualquer agendamento
4. Preencha e clique **"Confirmar Recebimento"**
5. Verifique se apareceu em **Financeiro > Contas a Receber**

---

## ✅ Checklist Final

- [ ] Migration SQL aplicada (sem erros)
- [ ] Tipo de receita existe
- [ ] Tipos de atendimento tem valores
- [ ] Aplicação reiniciada
- [ ] Página `/clinica/recebimentos` carrega
- [ ] Recebimento processado com sucesso
- [ ] Título apareceu em Financeiro
- [ ] Movimento de caixa criado (dinheiro)

---

## 🆘 Erro na Migration?

### Erro: "relation already exists"
```sql
-- Já existe, pode executar de novo (harmless)
```

### Erro: "permission denied"
```bash
# Tente como superuser:
sudo -u postgres psql -d fin_{slug} -f novos/12_add_categoria_recebimentos.sql
```

### Erro: "database fin_{slug} does not exist"
```bash
# Verifique o slug correto:
psql -U postgres -l | grep fin
```

---

## 📂 Arquivos Afetados

- ✅ `components/clinica/RecebimentoModal.tsx` (NOVO)
- ✅ `app/(erp)/clinica/recebimentos/page.tsx` (NOVO)
- ✅ `app/api/clinica/recebimentos/route.ts` (NOVO)
- ✅ `novos/12_add_categoria_recebimentos.sql` (NOVO)
- ✅ `components/layout/Sidebar.tsx` (MODIFICADO - adicionado link)
- ✅ `types/clinica.types.ts` (MODIFICADO - adicionado tipo_valor)
- ✅ `app/api/clinica/agendamentos/route.ts` (MODIFICADO - adicionado tipo_valor)

---

## 🎯 Resultado Esperado

Após deploy bem-sucedido:

1. ✅ Menu mostra **"Recebimentos"** em Clínica
2. ✅ Clique leva para `/clinica/recebimentos`
3. ✅ Página mostra agendamentos do dia com valores
4. ✅ Botão "Receber" funciona e abre modal
5. ✅ Modal permite selecionar forma de pagamento
6. ✅ Recebimento cria título em Contas a Receber
7. ✅ Dinheiro cria movimento em Movimento Caixa

---

**Pronto! Sistema de recebimentos está operacional. 🎉**

Para dúvidas técnicas, consulte: `SETUP_RECEBIMENTOS.md`
