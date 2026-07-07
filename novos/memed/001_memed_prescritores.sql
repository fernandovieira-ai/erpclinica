-- Tabela de vínculo entre o prescritor do seu ERP e o cadastro na Memed.
-- Guardamos o external_id (o que você controla) e o id retornado pela
-- Memed. NÃO recomendamos persistir o token de longa duração em produção,
-- já que ele é dinâmico e é renovado a cada atualização de cadastro —
-- trate-o como algo obtido sob demanda a cada sessão.

CREATE TABLE IF NOT EXISTS memed_prescritores (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuarios(id), -- ajuste para sua tabela de usuários/profissionais
    external_id       TEXT NOT NULL UNIQUE, -- o mesmo valor enviado como external_id para a Memed
    memed_usuario_id  TEXT,                  -- id retornado pela Memed no cadastro
    ultimo_status     TEXT,                  -- ex: "Em análise", "Ativo", "Inativo"
    ambiente          TEXT NOT NULL DEFAULT 'homologacao', -- 'homologacao' | 'producao'
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memed_prescritores_usuario_id
    ON memed_prescritores (usuario_id);
