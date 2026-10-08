SET client_encoding = 'LATIN1';

-- Lançamento direto na tela de Recebimento, sem passar pela agenda (sem checar
-- disponibilidade/conflito de horário, sem aparecer na grade Visão Dia/Semana).
-- Serve só pra gerar o vínculo (paciente/profissional/tipo/categoria) que o recebimento
-- e a ficha do paciente já sabem ler - GET /api/clinica/agendamentos exclui avulso=true
-- por padrão (parâmetro incluir_avulso=true usado pela tela de Recebimentos e pela Ficha
-- do Paciente).
ALTER TABLE tab_agendamento ADD COLUMN avulso BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_agendamento.avulso IS 'Lançamento direto feito na tela de Recebimento (sem passar pela agenda) - oculto da grade Visão Dia/Semana.';
