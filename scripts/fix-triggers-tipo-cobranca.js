// Atualiza os triggers fn_trigger_despesa e fn_trigger_receita no banco hiitcor
// substituindo forma_pagamento_id por cod_tipo_cobranca

const { Pool } = require('pg')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  database: 'hiitcor',
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  ssl:      false,
})

async function run() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('Atualizando fn_trigger_despesa...')
    await client.query(`
CREATE OR REPLACE FUNCTION fn_trigger_despesa()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_caixa_id  INT;
  v_mov_banco_id  INT;
  v_titulo_id     INT;
  v_data_venc     DATE;
  v_valor_parcela NUMERIC(15,2);
  v_i             INT;
BEGIN
  IF NEW.status <> 'A' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'A' THEN RETURN NEW; END IF;

  IF NEW.ind_avista AND NEW.destino IS NULL THEN
    RAISE EXCEPTION 'Despesa à vista requer destino: C=Caixa ou B=Banco';
  END IF;
  IF NEW.ind_avista AND NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
    RAISE EXCEPTION 'Despesa à vista em banco requer conta_banco_id';
  END IF;

  IF NEW.ind_avista THEN

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_despesa SET
        movimento_caixa_id = v_mov_caixa_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;

    ELSE
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_despesa SET
        movimento_banco_id = v_mov_banco_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;
    END IF;

  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_despesa + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_pagar (
        empresa_id, pessoa_id, tipo_despesa_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, despesa_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_despesa_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'DES', NEW.id,
        NEW.data_despesa, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_despesa),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_despesa_parcela (
        despesa_id, numero_parcela, data_vencimento, valor, titulo_pagar_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
    `)
    console.log('  fn_trigger_despesa OK')

    console.log('Atualizando fn_trigger_receita...')
    await client.query(`
CREATE OR REPLACE FUNCTION fn_trigger_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_caixa_id  INT;
  v_mov_banco_id  INT;
  v_titulo_id     INT;
  v_data_venc     DATE;
  v_valor_parcela NUMERIC(15,2);
  v_i             INT;
BEGIN
  IF NEW.status <> 'A' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'A' THEN RETURN NEW; END IF;

  IF NEW.ind_avista AND NEW.destino IS NULL THEN
    RAISE EXCEPTION 'Receita à vista requer destino: C=Caixa ou B=Banco';
  END IF;
  IF NEW.ind_avista AND NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
    RAISE EXCEPTION 'Receita à vista em banco requer conta_banco_id';
  END IF;

  IF NEW.ind_avista THEN

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_receita SET
        movimento_caixa_id = v_mov_caixa_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;

    ELSE
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_receita SET
        movimento_banco_id = v_mov_banco_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;
    END IF;

  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_receita + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_receber (
        empresa_id, pessoa_id, tipo_receita_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, receita_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_receita_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'REC', NEW.id,
        NEW.data_receita, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_receita),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_receita_parcela (
        receita_id, numero_parcela, data_vencimento, valor, titulo_receber_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
    `)
    console.log('  fn_trigger_receita OK')

    await client.query('COMMIT')
    console.log('\nMigração concluída com sucesso.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('ERRO — rollback executado:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
