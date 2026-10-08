-- =============================================================
-- 72_mensagem_exclusao_oculta.sql
-- "Excluir mensagem" é soft-delete por usuário: a mensagem some só da tela
-- de quem excluiu, continua visível pro outro participante e salva no banco.
-- Rodar no database do cliente.
-- Pre-requisito: 71_mensagens_internas.sql ja aplicado (tab_mensagem)
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_mensagem
  ADD COLUMN IF NOT EXISTS oculta_remetente    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oculta_destinatario  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_mensagem.oculta_remetente IS 'true = o remetente excluiu a mensagem da própria tela (continua visível pro destinatário)';
COMMENT ON COLUMN tab_mensagem.oculta_destinatario IS 'true = o destinatário excluiu a mensagem da própria tela (continua visível pro remetente)';

-- GRANT de UPDATE já cobre essas colunas novas (concedido na tabela inteira em 71);
-- nada a mais a conceder aqui.
