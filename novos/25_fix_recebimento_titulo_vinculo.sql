-- =============================================================
-- 25_fix_recebimento_titulo_vinculo.sql
-- Corrige vínculo entre tab_recebimento_consulta e os N títulos
-- gerados por um pagamento parcelado.
--
-- Problema anterior:
--   titulo_receber_id = FK para UM único tab_titulo_receber (o 1º).
--   Com N parcelas = N títulos, isso amarra apenas o primeiro título,
--   deixando os demais sem referencia direta no recebimento.
--
-- Solucao:
--   1. Adiciona coluna batch_agendamento_id = mesmo valor que
--      tab_titulo_receber.origem_id usa para agrupar o lote.
--   2. Remove a coluna titulo_receber_id (era ambigua e incorreta).
-- =============================================================

SET client_encoding = 'LATIN1';

-- 1. Adicionar coluna de agrupamento do lote
ALTER TABLE tab_recebimento_consulta
  ADD COLUMN IF NOT EXISTS batch_agendamento_id INT;

COMMENT ON COLUMN tab_recebimento_consulta.batch_agendamento_id IS
  'ID do agendamento raiz do lote (= tab_titulo_receber.origem_id). Liga recebimento a todos os N titulos do lote.';

-- 2. Popular batch_agendamento_id nos registros existentes que têm titulo_receber_id preenchido
--    (vai pelo titulo -> origem_id que e o agendamento raiz do batch)
UPDATE tab_recebimento_consulta rc
SET    batch_agendamento_id = t.origem_id
FROM   tab_titulo_receber t
WHERE  t.id = rc.titulo_receber_id
  AND  rc.batch_agendamento_id IS NULL;

-- 3. Para recebimentos à vista (titulo_receber_id IS NULL),
--    batch_agendamento_id = agendamento_id (batch de um só)
UPDATE tab_recebimento_consulta
SET    batch_agendamento_id = agendamento_id
WHERE  titulo_receber_id IS NULL
  AND  batch_agendamento_id IS NULL;

-- 4. Índice para buscas por lote
CREATE INDEX IF NOT EXISTS idx_rc_batch ON tab_recebimento_consulta(batch_agendamento_id);

-- 5. Remover a coluna ambígua titulo_receber_id
--    (o vinculo agora e via batch_agendamento_id <-> tab_titulo_receber.origem_id)
ALTER TABLE tab_recebimento_consulta
  DROP COLUMN IF EXISTS titulo_receber_id CASCADE;
