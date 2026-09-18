// Colunas e joins do item de lista de agendamento (AgendamentoListItem).
// Usado por GET /agendamentos e pelo POST, que devolve o item já pronto pro front
// inserir na grade sem precisar refazer a consulta da lista.
// Alias esperados: a = tab_agendamento (ou CTE com as mesmas colunas).

export const AGENDAMENTO_LISTA_COLUNAS = `
       a.id, a.data_hora_inicio, a.data_hora_fim, a.status, a.motivo, a.observacao,
       a.horario_chegada, a.horario_inicio_atendimento,
       pac.id   AS paciente_id,    pac.nome  AS paciente_nome,
       pac.celular AS paciente_celular, pac.cpf_cnpj AS paciente_cpf,
       pro.id   AS profissional_id, pro.nome AS profissional_nome,
       pro.eh_clinica AS profissional_eh_clinica,
       a.medico_solicitante_id, sol.nome AS medico_solicitante_nome,
       tp.id    AS tipo_id,         tp.descricao AS tipo_descricao,
       tp.cor   AS tipo_cor,        tp.duracao_min AS tipo_duracao_min,
       tp.voa_clinical_type AS tipo_voa_clinical_type,
       COALESCE(atc.valor, tp.valor) AS tipo_valor,
       atc.valor_prazo AS tipo_valor_prazo,
       esp.id   AS especialidade_id, esp.descricao AS especialidade_descricao,
       esp.cor  AS especialidade_cor,
       cat.id   AS categoria_id,    cat.descricao AS categoria_descricao`

export const AGENDAMENTO_LISTA_JOINS = `
       JOIN tab_pessoa pac  ON pac.id = a.paciente_id
       JOIN tab_pessoa pro  ON pro.id = a.profissional_id
       LEFT JOIN tab_pessoa sol ON sol.id = a.medico_solicitante_id
       LEFT JOIN tab_agendamento_tipo tp  ON tp.id = a.tipo_id
       LEFT JOIN tab_agendamento_tipo_categoria atc ON atc.tipo_id = a.tipo_id AND atc.categoria_id = a.categoria_id
       LEFT JOIN tab_especialidade    esp ON esp.id = a.especialidade_id
       LEFT JOIN tab_categoria        cat ON cat.id = a.categoria_id`

// Agendamento recém-criado ainda não tem recebimento
export const AGENDAMENTO_LISTA_SEM_RECEBIMENTO = `,
       NULL::INT AS recebimento_id, NULL::VARCHAR AS status_recebimento, NULL::NUMERIC AS total_recebimento,
       NULL::INT AS movimento_caixa_id, NULL::INT AS movimento_banco_id, NULL::INT AS batch_agendamento_id`
