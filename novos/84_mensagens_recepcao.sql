-- =============================================================
-- 84_mensagens_recepcao.sql
-- Mensagem em grupo para "Recepcao": usuario marcado como recepcionista
-- vira destino compartilhado - a mensagem aparece pra todas as
-- recepcionistas ativas da empresa, e a primeira que RESPONDER assume a
-- conversa (ela deixa de aparecer pendente pra todas as outras).
-- Rodar no database do cliente.
-- Pre-requisito: 71_mensagens_internas.sql ja aplicado.
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_usuario ADD COLUMN IF NOT EXISTS ind_recepcionista BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN tab_usuario.ind_recepcionista IS 'Recebe mensagens enviadas ao grupo "Recepcao" (fila compartilhada) - a primeira que responder assume a conversa';

-- destinatario_id NULL = mensagem endereçada ao grupo Recepcao, ainda sem ninguem ter assumido
ALTER TABLE tab_mensagem ALTER COLUMN destinatario_id DROP NOT NULL;

ALTER TABLE tab_mensagem ADD COLUMN IF NOT EXISTS atendido_por INT NULL REFERENCES tab_usuario(id);
COMMENT ON COLUMN tab_mensagem.destinatario_id IS 'NULL = mensagem pendente endereçada ao grupo Recepcao (ainda não atendida)';
COMMENT ON COLUMN tab_mensagem.atendido_por    IS 'Recepcionista que assumiu esta mensagem de grupo ao responder (NULL = ainda pendente ou mensagem normal 1-para-1)';

-- Fila de pendentes do grupo Recepcao - poucas linhas, consultada por todas as recepcionistas a cada tick do SSE
CREATE INDEX IF NOT EXISTS idx_mensagem_grupo_pendente ON tab_mensagem (empresa_id, remetente_id) WHERE destinatario_id IS NULL;
