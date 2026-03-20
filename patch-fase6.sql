-- ============================================================
-- PATCH FASE 6 — Features y Menores
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- M3: Añadir columna must_change_password a models
ALTER TABLE models ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- P1 (de fase 5 — incluido aquí si no se ejecutó patch-fase5):
-- RPC para contar spins por modelo
CREATE OR REPLACE FUNCTION count_spins_by_models(model_ids uuid[])
RETURNS TABLE (model_id uuid, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.model_id, COUNT(*) AS cnt
  FROM spins s
  WHERE s.model_id = ANY(model_ids)
    AND s.verified = true
  GROUP BY s.model_id;
$$;

-- RLS: permitir que modelos lean y actualicen su propio must_change_password
-- (La política existente de models ya debería cubrir esto via supabase_user_id)
