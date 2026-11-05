SET client_encoding = 'LATIN1';

-- Relatorio "Agendamentos por Usuario" (Gerencial) filtra tab_agendamento pela data de
-- LANCAMENTO (created_at), nao pela data da consulta (data_hora_inicio, ja indexada em
-- idx_ag_data). Sem indice de apoio, esse filtro cai em sequential scan conforme o historico
-- crescer - hoje (centenas de linhas) irrelevante, indice criado agora pra quando o volume subir.
CREATE INDEX IF NOT EXISTS idx_ag_created_at ON tab_agendamento(empresa_id, created_at);
