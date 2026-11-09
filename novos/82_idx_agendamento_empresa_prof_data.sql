SET client_encoding = 'LATIN1';

-- A tela de Agenda sempre filtra por empresa_id + intervalo de data_hora_inicio (indice
-- idx_ag_data) e, na maioria das visualizacoes, tambem por profissional_id (filtro de
-- profissional) - hoje esse ultimo filtro e aplicado sem indice de apoio (residual sobre o
-- resultado do indice de data). Indice composto adicional, sem alterar o indice existente,
-- para cobrir esse padrao de consulta conforme o volume de agendamentos crescer.
CREATE INDEX IF NOT EXISTS idx_ag_empresa_prof_data
  ON tab_agendamento(empresa_id, profissional_id, data_hora_inicio);
