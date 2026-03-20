-- ============================================================
-- PATCH FASE 4 — Precios anuales corregidos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- I6: Actualizar precios anuales en calculate_model_price()
-- Fórmula correcta: mensual × 0.8 × 12
--   Solo:   49 × 0.8 = 39 → 39 × 12 = 468
--   Pro:    89 × 0.8 = 71 → 71 × 12 = 852
--   Agency: 349 × 0.8 = 279 → 279 × 12 = 3348

DROP FUNCTION IF EXISTS calculate_model_price(uuid);

CREATE OR REPLACE FUNCTION calculate_model_price(p_model_id uuid)
RETURNS TABLE (
  plan text, billing_cycle text, monthly_price numeric, annual_price numeric,
  base_price numeric, annual_discount_pct numeric, annual_discount_amount numeric,
  referral_discount_pct numeric, referral_discount_amount numeric,
  discount_code_pct numeric, discount_code_amount numeric,
  final_price numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
declare
  v_model models%rowtype;
  v_monthly numeric; v_annual numeric; v_base numeric;
  v_ref_count int; v_ref_pct numeric;
  v_ann_pct numeric; v_ann_amt numeric; v_ref_amt numeric;
  v_code_pct numeric := 0; v_code_amt numeric := 0;
  v_code record;
begin
  select * into v_model from models where id = p_model_id;

  -- Precios mensuales
  v_monthly := case v_model.plan
    when 'solo' then 49 when 'pro' then 89 when 'agency' then 349 else 49
  end;
  -- Precios anuales (mensual × 0.8 × 12 = 20% descuento)
  v_annual := case v_model.plan
    when 'solo' then 468 when 'pro' then 852 when 'agency' then 3348 else 468
  end;

  -- Precio base según ciclo
  v_base := case v_model.billing_cycle
    when 'annual' then v_annual else v_monthly
  end;

  -- Descuento anual (para mostrar ahorro vs mensual×12)
  if v_model.billing_cycle = 'annual' then
    v_ann_amt := (v_monthly * 12) - v_annual;
    v_ann_pct := round((v_ann_amt / (v_monthly * 12)) * 100, 2);
  else
    v_ann_amt := 0; v_ann_pct := 0;
  end if;

  -- Contar referidas activas (últimos 6 meses)
  select count(*) into v_ref_count from models
  where referred_by = v_model.id and status = 'active'
    and created_at >= now() - interval '6 months';

  v_ref_pct := least(v_ref_count * 10, 100);
  v_ref_amt := round(v_base * v_ref_pct / 100, 2);

  -- Descuento por código
  if v_model.applied_discount_code is not null then
    select * into v_code from discount_codes
    where code = v_model.applied_discount_code
      and is_active = true
      and (expires_at is null or expires_at > now())
      and (max_uses is null or current_uses < max_uses);
    if found then
      v_code_pct := v_code.discount_percent;
      v_code_amt := round((v_base - v_ref_amt) * v_code_pct / 100, 2);
    end if;
  end if;

  return query select
    v_model.plan, v_model.billing_cycle, v_monthly, v_annual,
    v_base, v_ann_pct, v_ann_amt,
    v_ref_pct, v_ref_amt,
    v_code_pct, v_code_amt,
    greatest(v_base - v_ref_amt - v_code_amt, 0);
end;
$$;
