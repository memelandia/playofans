-- ============================================
-- PATCH FASE 3: Bugs Funcionales
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ----------------------------------------
-- F4: Tabla contact_messages
-- ----------------------------------------
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz default now()
);

alter table contact_messages enable row level security;

-- ----------------------------------------
-- F2: Columna applied_discount_code en models
-- + calculate_model_price con descuentos
-- ----------------------------------------
alter table models add column if not exists applied_discount_code text;

-- Eliminar función anterior (el return type cambió, hay que dropearla primero)
drop function if exists calculate_model_price(uuid);

create or replace function calculate_model_price(p_model_id uuid)
returns table (
  base_price numeric,
  billing_cycle text,
  annual_discount_pct numeric,
  annual_discount_amount numeric,
  referral_discount_pct numeric,
  referral_discount_amount numeric,
  discount_code_pct numeric,
  discount_code_amount numeric,
  final_price numeric,
  referral_count int
) as $$
declare
  v_model models%rowtype;
  v_monthly numeric;
  v_annual numeric;
  v_base numeric;
  v_ref_count int;
  v_ref_pct numeric;
  v_ann_pct numeric;
  v_ann_amt numeric;
  v_ref_amt numeric;
  v_dc_pct numeric := 0;
  v_dc_amt numeric := 0;
  v_after_ref numeric;
begin
  select * into v_model from models where id = p_model_id;

  -- Precios mensuales
  v_monthly := case v_model.plan
    when 'solo' then 49 when 'pro' then 89 when 'agency' then 349 else 49
  end;
  -- Precios anuales
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
  select count(*) into v_ref_count
  from models
  where referred_by = v_model.referral_code
    and active = true
    and created_at > now() - interval '6 months';

  -- Descuento por referidos
  v_ref_pct := case
    when v_ref_count >= 3 then 15
    when v_ref_count = 2 then 10
    when v_ref_count = 1 then 5
    else 0
  end;

  v_ref_amt := round(v_base * v_ref_pct / 100, 2);
  v_after_ref := v_base - v_ref_amt;

  -- Descuento por código de descuento
  if v_model.applied_discount_code is not null then
    select dc.discount_pct into v_dc_pct
    from discount_codes dc
    where dc.code = v_model.applied_discount_code
      and dc.active = true
      and (dc.valid_until is null or dc.valid_until > now())
      and (dc.max_uses is null or dc.times_used < dc.max_uses);

    if v_dc_pct is not null and v_dc_pct > 0 then
      v_dc_amt := round(v_after_ref * v_dc_pct / 100, 2);
    else
      v_dc_pct := 0;
    end if;
  end if;

  return query select
    v_base, v_model.billing_cycle,
    v_ann_pct, round(v_ann_amt, 2),
    v_ref_pct, v_ref_amt,
    v_dc_pct, v_dc_amt,
    v_after_ref - v_dc_amt, v_ref_count;
end;
$$ language plpgsql security definer;

-- Actualizar generate_monthly_billing para incluir discount_code_pct/amount
-- (los campos nuevos se almacenan en las columnas existentes; billing_records
--  ya tiene credit_applied, y el total_amount final ya se calcula con final_price)
-- No requiere cambios en generate_monthly_billing porque usa v_price.final_price
-- que ya incluye el descuento de código.
