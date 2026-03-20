-- ============================================================
-- PATCH FASE 5 — Rendimiento
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- P1: Función RPC para contar spins verificados por modelo (evita N+1)
CREATE OR REPLACE FUNCTION count_spins_by_models(model_ids uuid[])
RETURNS TABLE (model_id uuid, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.model_id, COUNT(*) AS cnt
  FROM spins s
  WHERE s.model_id = ANY(model_ids)
    AND s.verified = true
  GROUP BY s.model_id;
$$;
