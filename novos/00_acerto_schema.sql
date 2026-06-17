-- =============================================================
-- 00_acerto_schema.sql
-- Script de acerto: remove estruturas do projeto anterior (ERP v1)
-- e prepara o banco para o novo schema financeiro/fiscal
--
-- ⚠️  ATENÇÃO: Rodar ANTES dos scripts 01 ao 06
-- ⚠️  Faz DROP de tabelas — NÃO rodar em banco com dados reais
--     sem backup prévio
--
-- Projeto anterior:  ERP SaaS multi-tenant (Drizzle ORM, LATIN1,
--                    Docker por instância, 3 níveis SaaS)
-- Projeto novo:      Sistema Financeiro/Fiscal (raw pg, LATIN1,
--                    VPS única, multi-database por cliente)
-- =============================================================

SET client_encoding = 'LATIN1';

-- =============================================================
-- BLOCO 1 — TABELAS DE IA (renomeadas/reestruturadas)
-- Anterior: tab_ia_conversa, tab_ia_mensagem, tab_ia_memoria,
--           tab_ia_sugestao, tab_ia_feedback, tab_ia_dashboard_widget,
--           tab_ia_config_empresa, tab_ia_log
-- Novo:     tab_ia_log (unificada, criada no 05_schema_ia.sql)
-- =============================================================
DROP TABLE IF EXISTS tab_ia_feedback          CASCADE;
DROP TABLE IF EXISTS tab_ia_dashboard_widget  CASCADE;
DROP TABLE IF EXISTS tab_ia_sugestao          CASCADE;
DROP TABLE IF EXISTS tab_ia_memoria           CASCADE;
DROP TABLE IF EXISTS tab_ia_mensagem          CASCADE;
DROP TABLE IF EXISTS tab_ia_conversa          CASCADE;
DROP TABLE IF EXISTS tab_ia_config_empresa    CASCADE;
DROP TABLE IF EXISTS tab_ia_log               CASCADE;

-- =============================================================
-- BLOCO 2 — TABELAS DE PESSOA (arquitetura alterada)
-- Anterior: tab_pessoa + tab_pessoa_papel + tab_pessoa_contato
--           + tab_pessoa_endereco (modelo com tabelas separadas)
-- Novo:     tab_pessoa unificada com flags booleanas e campos
--           de endereço/contato inline (padrão EMSys3)
-- =============================================================
DROP TABLE IF EXISTS tab_pessoa_papel     CASCADE;
DROP TABLE IF EXISTS tab_pessoa_contato   CASCADE;
DROP TABLE IF EXISTS tab_pessoa_endereco  CASCADE;
DROP TABLE IF EXISTS tab_pessoa           CASCADE;

-- =============================================================
-- BLOCO 3 — TABELAS DE USUÁRIO (renomeadas)
-- Anterior: tab_usuario (com conta_saas_id + perfil_global)
--           tab_usuario_empresa_acesso
--           tab_perfil_modulos_padrao
-- Novo:     tab_usuario (sem conta_saas_id, perfil simplificado)
--           tab_usuario_empresa
-- =============================================================
DROP TABLE IF EXISTS tab_perfil_modulos_padrao   CASCADE;
DROP TABLE IF EXISTS tab_usuario_empresa_acesso  CASCADE;
DROP TABLE IF EXISTS tab_usuario                 CASCADE;

-- =============================================================
-- BLOCO 4 — TABELAS SaaS DE CONTROLE (movidas para saas_control)
-- Anterior: tab_conta_saas ficava dentro do banco do cliente
-- Novo:     tab_instancia fica no banco saas_control separado
--           Dentro do banco do cliente NÃO existe mais tab_conta_saas
-- =============================================================
DROP TABLE IF EXISTS tab_conta_saas CASCADE;

-- =============================================================
-- BLOCO 5 — TABELAS FINANCEIRAS (totalmente reescritas)
-- Anterior: tab_conta + tab_parcela (genéricas, sem separação
--           pagar/receber, sem triggers de movimento)
-- Novo:     tab_titulo_pagar + tab_titulo_receber + parcelas
--           + movimentos caixa/banco com triggers automáticos
-- =============================================================
DROP TABLE IF EXISTS tab_parcela  CASCADE;
DROP TABLE IF EXISTS tab_conta    CASCADE;

-- =============================================================
-- BLOCO 6 — TABELAS DE PRODUTO (fora do escopo do novo sistema)
-- O novo sistema é financeiro/fiscal — não tem módulo de produtos
-- Anterior: tab_produto, tab_produto_empresa, tab_lista_preco,
--           tab_lista_preco_item
-- Novo:     removidas — produto aparece apenas nos itens da NF-e
--           como texto/descrição (sem catálogo próprio nesta fase)
-- =============================================================
DROP TABLE IF EXISTS tab_lista_preco_item   CASCADE;
DROP TABLE IF EXISTS tab_lista_preco        CASCADE;
DROP TABLE IF EXISTS tab_produto_empresa    CASCADE;
DROP TABLE IF EXISTS tab_produto            CASCADE;

-- =============================================================
-- BLOCO 7 — TABELAS DE PEDIDO (fora do escopo)
-- Anterior: tab_pedido + tab_pedido_item
-- Novo:     fora do escopo desta versão do sistema
-- =============================================================
DROP TABLE IF EXISTS tab_pedido_item CASCADE;
DROP TABLE IF EXISTS tab_pedido      CASCADE;

-- =============================================================
-- BLOCO 8 — TABELAS DE ESTOQUE (fora do escopo)
-- =============================================================
DROP TABLE IF EXISTS tab_estoque_movimentacao CASCADE;

-- =============================================================
-- BLOCO 9 — TABELA DE EMPRESA (reescrita)
-- Anterior: tab_empresa com conta_saas_id + campos genéricos ERP
-- Novo:     tab_empresa com campos fiscais NF-e, certificado A1,
--           ambiente SEFAZ, série/numeração — sem conta_saas_id
-- =============================================================
DROP TABLE IF EXISTS tab_empresa CASCADE;

-- =============================================================
-- BLOCO 10 — FUNCTIONS E TRIGGERS DO PROJETO ANTERIOR
-- =============================================================
DROP FUNCTION IF EXISTS fn_adicionar_papel(INT, INT, TEXT, JSONB)  CASCADE;
DROP FUNCTION IF EXISTS fn_empresas_do_usuario(INT)                CASCADE;
DROP FUNCTION IF EXISTS fn_check_modulo(INT, INT, TEXT)            CASCADE;
DROP FUNCTION IF EXISTS fn_atualizar_estoque()                     CASCADE;
DROP FUNCTION IF EXISTS fn_ia_atualizar_cota()                     CASCADE;
DROP FUNCTION IF EXISTS fn_proxima_porta()                         CASCADE;
-- fn_set_updated_at é mantida — igual nos dois projetos
-- DROP FUNCTION IF EXISTS fn_set_updated_at() CASCADE;

-- =============================================================
-- BLOCO 11 — VIEWS DO PROJETO ANTERIOR
-- =============================================================
DROP VIEW IF EXISTS vw_clientes           CASCADE;
DROP VIEW IF EXISTS vw_fornecedores       CASCADE;
DROP VIEW IF EXISTS vw_pacientes          CASCADE;
DROP VIEW IF EXISTS vw_pessoa_papeis      CASCADE;
DROP VIEW IF EXISTS vw_produto_empresa    CASCADE;
DROP VIEW IF EXISTS vw_conta_empresas     CASCADE;
DROP VIEW IF EXISTS vw_ia_uso_mensal      CASCADE;
-- Views do saas_control (se existirem no banco do cliente por engano)
DROP VIEW IF EXISTS vw_painel_admin       CASCADE;

-- =============================================================
-- BLOCO 12 — ENCODING
-- Banco mantém LATIN1 — encoding do banco existente, não alterar.
-- NÃO É POSSÍVEL alterar encoding de um banco existente no PostgreSQL.
-- A solução correta é:
--   1. Fazer dump do banco antigo (se tiver dados para migrar)
--   2. Dropar o banco
--   3. Recriar com LATIN1
--   4. Rodar os scripts 01 ao 06
--
-- Se o banco já é novo (sem dados), apenas confirme o encoding:
--   SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();
-- O resultado deve ser 'LATIN1'
-- =============================================================

-- =============================================================
-- VERIFICAÇÃO FINAL
-- Rodar após o script para confirmar que não sobrou nada do v1
-- =============================================================
DO $$
DECLARE
  v_tabelas_antigas TEXT[] := ARRAY[
    'tab_conta_saas', 'tab_produto', 'tab_produto_empresa',
    'tab_lista_preco', 'tab_lista_preco_item', 'tab_pedido',
    'tab_pedido_item', 'tab_estoque_movimentacao', 'tab_conta',
    'tab_parcela', 'tab_pessoa_papel', 'tab_pessoa_contato',
    'tab_pessoa_endereco', 'tab_perfil_modulos_padrao',
    'tab_usuario_empresa_acesso', 'tab_ia_conversa',
    'tab_ia_mensagem', 'tab_ia_memoria', 'tab_ia_sugestao',
    'tab_ia_feedback', 'tab_ia_dashboard_widget', 'tab_ia_config_empresa'
  ];
  v_tabela TEXT;
  v_existe BOOLEAN;
  v_total  INT := 0;
BEGIN
  FOREACH v_tabela IN ARRAY v_tabelas_antigas LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tabela
    ) INTO v_existe;

    IF v_existe THEN
      RAISE WARNING '⚠️  Tabela ainda existe: %', v_tabela;
      v_total := v_total + 1;
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE NOTICE '✅ Acerto concluído — nenhuma tabela do projeto anterior encontrada.';
  ELSE
    RAISE WARNING '❌ % tabela(s) do projeto anterior ainda presente(s). Verificar manualmente.', v_total;
  END IF;
END;
$$;

-- =============================================================
-- RESUMO DAS MUDANÇAS
-- =============================================================
--
-- REMOVIDAS (drop):
--   tab_conta_saas              → movida para saas_control (banco separado)
--   tab_produto                 → fora do escopo financeiro
--   tab_produto_empresa         → fora do escopo
--   tab_lista_preco             → fora do escopo
--   tab_lista_preco_item        → fora do escopo
--   tab_pedido                  → fora do escopo
--   tab_pedido_item             → fora do escopo
--   tab_estoque_movimentacao    → fora do escopo
--   tab_conta                   → substituída por tab_titulo_pagar/receber
--   tab_parcela                 → substituída por tab_*_parcela dedicadas
--   tab_pessoa_papel            → incorporada como flags em tab_pessoa
--   tab_pessoa_contato          → incorporada inline em tab_pessoa
--   tab_pessoa_endereco         → incorporada inline em tab_pessoa
--   tab_perfil_modulos_padrao   → lógica movida para código (checkModulo)
--   tab_usuario_empresa_acesso  → renomeada para tab_usuario_empresa
--   tab_ia_conversa             → substituída por tab_ia_log (05_schema_ia)
--   tab_ia_mensagem             → idem
--   tab_ia_memoria              → idem
--   tab_ia_sugestao             → idem
--   tab_ia_feedback             → idem
--   tab_ia_dashboard_widget     → idem
--   tab_ia_config_empresa       → idem
--
-- RECRIADAS (reescritas nos novos scripts):
--   tab_empresa      → 01_schema_cadastros.sql (+ campos NF-e/fiscal)
--   tab_usuario      → 01_schema_cadastros.sql (sem conta_saas_id)
--   tab_pessoa       → 01_schema_cadastros.sql (unificada com flags)
--   tab_ia_log       → 05_schema_ia.sql
--
-- MANTIDAS (sem alteração):
--   fn_set_updated_at            → igual nos dois projetos
--
-- NOVAS (não existiam antes):
--   tab_banco, tab_conta_banco   → 01_schema_cadastros.sql
--   tab_centro_custo             → 01_schema_cadastros.sql
--   tab_plano_contas             → 01_schema_cadastros.sql
--   tab_tipo_despesa/receita     → 01_schema_cadastros.sql
--   tab_condicao/forma_pagamento → 01_schema_cadastros.sql
--   tab_titulo_pagar/receber     → 02_schema_financeiro.sql
--   tab_movimento_caixa/banco    → 02_schema_financeiro.sql
--   tab_despesa/receita          → 02_schema_financeiro.sql
--   tab_fechamento_caixa         → 02_schema_financeiro.sql
--   tab_transferencia_conta      → 02_schema_financeiro.sql
--   tab_nota_fiscal (reescrita)  → 03_schema_fiscal.sql
--   tab_nota_fiscal_item         → 03_schema_fiscal.sql
--   tab_nota_fiscal_parcela      → 03_schema_fiscal.sql
--   tab_nota_fiscal_retencao     → 03_schema_fiscal.sql
--   tab_nota_fiscal_evento       → 03_schema_fiscal.sql
--   tab_livro_fiscal_*           → 03_schema_fiscal.sql
--   tab_lancamento_contabil      → 04_schema_contabil.sql (pendente)
--   tab_dre_lancamento           → 04_schema_contabil.sql (pendente)
--   tab_fluxo_caixa              → 04_schema_contabil.sql (pendente)
