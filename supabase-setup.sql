-- =============================================================
-- SENTINELA · Suzano — Setup Supabase (Pacote 3)
-- Execute no SQL Editor do Supabase: https://supabase.com/dashboard
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABELA 1: relatorios_mensais
-- Armazena o relatório mensal gerado automaticamente ou manualmente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relatorios_mensais (
  id              BIGSERIAL PRIMARY KEY,
  mes_referencia  TEXT        NOT NULL UNIQUE,  -- ex: "outubro de 2024"
  inicio_periodo  TIMESTAMPTZ NOT NULL,
  fim_periodo     TIMESTAMPTZ NOT NULL,
  dados           JSONB       NOT NULL DEFAULT '{}',
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para ordenação por data
CREATE INDEX IF NOT EXISTS idx_relatorios_criado ON relatorios_mensais (criado_em DESC);

-- ─────────────────────────────────────────────────────────────
-- TABELA 2: observacoes_campo
-- Armazena as observações do auditor VOOS (metodologia TEM/LOSA)
-- Dados individuais nunca aparecem no painel executivo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observacoes_campo (
  id                  BIGSERIAL PRIMARY KEY,
  area                TEXT        NOT NULL,         -- ex: "Operação florestal"
  turno               TEXT,                         -- Manhã / Tarde / Noite
  ameacas             TEXT[]      NOT NULL DEFAULT '{}', -- array de categorias de ameaça
  ameaca_desc         TEXT,                         -- descrição livre da ameaça
  resposta_operador   TEXT,                         -- adequada / parcial / inadequada / nao_aplicavel
  erro_ocorreu        TEXT,                         -- nao / sim_corrigido / sim_nao_corrigido / sim_consequencia
  obs_livre           TEXT,                         -- observação aberta do auditor
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para agregações por área e por data
CREATE INDEX IF NOT EXISTS idx_obs_area      ON observacoes_campo (area);
CREATE INDEX IF NOT EXISTS idx_obs_criado    ON observacoes_campo (criado_em DESC);

-- ─────────────────────────────────────────────────────────────
-- SUPABASE pg_cron: Relatório mensal automático
-- Dispara no 1º dia de cada mês às 06:00 BRT (09:00 UTC)
-- ─────────────────────────────────────────────────────────────
-- IMPORTANTE: habilite a extensão pg_cron antes de rodar este bloco:
--   Dashboard → Database → Extensions → procure "pg_cron" → Enable
-- ─────────────────────────────────────────────────────────────

-- Habilita a extensão (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agenda o job (troque <SUA_URL_VERCEL> pelo domínio real do deploy)
SELECT cron.schedule(
  'sentinela-relatorio-mensal',              -- nome do job
  '0 9 1 * *',                               -- 1º dia do mês, 09h UTC (06h BRT)
  $$
  SELECT
    net.http_post(
      url     := 'https://<SUA_URL_VERCEL>/api/gerar-relatorio',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);

-- Para verificar os jobs agendados:
-- SELECT * FROM cron.job;

-- Para remover o job (se precisar recriar):
-- SELECT cron.unschedule('sentinela-relatorio-mensal');

-- =============================================================
-- NOTAS DE SEGURANÇA
-- =============================================================
-- 1. As observações de campo NUNCA devem expor o painel por
--    indivíduo ou equipe — apenas agregações por área + tipo de ameaça.
--
-- 2. Para o pg_cron funcionar com net.http_post, habilite também
--    a extensão "pg_net" no Dashboard → Database → Extensions.
--
-- 3. Em produção, considere adicionar uma variável de ambiente
--    CRON_SECRET e validar no endpoint /api/gerar-relatorio.
-- =============================================================
