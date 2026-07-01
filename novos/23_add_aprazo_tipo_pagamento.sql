-- =============================================================
-- 23_add_aprazo_tipo_pagamento.sql
-- Adiciona 'a_prazo' como tipo de pagamento válido em
-- tab_condicao_pagamento
-- =============================================================

SET client_encoding = 'LATIN1';

-- Remove o CHECK constraint existente (gerado automaticamente pelo ADD COLUMN)
-- e recria com 'a_prazo' incluído
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'tab_condicao_pagamento'
    AND constraint_type = 'CHECK'
    AND constraint_name ILIKE '%tipo_pagamento%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE tab_condicao_pagamento DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

ALTER TABLE tab_condicao_pagamento
  ADD CONSTRAINT chk_cp_tipo_pagamento
    CHECK (tipo_pagamento IN ('dinheiro', 'debito', 'credito', 'pix', 'a_prazo'));

COMMENT ON COLUMN tab_condicao_pagamento.tipo_pagamento
  IS 'dinheiro|debito|credito|pix|a_prazo - Tipo de pagamento';
