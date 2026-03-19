-- ============================================
-- PATCH: Migrar sistema de afiliados a v2
-- Comisión: 20% → 10%
-- Duración: 12 meses → 6 meses
-- Pago: efectivo → saldo a favor (crédito)
-- Base comisión: sobre precio después de dto anual, antes de dto referidos
-- ============================================

-- 1. Añadir columna credit_balance a affiliates
alter table affiliates add column if not exists credit_balance numeric not null default 0;

-- 2. Actualizar defaults de affiliates
alter table affiliates alter column commission_pct set default 10;
alter table affiliates alter column months_remaining set default 6;

-- 3. Añadir columna credit_applied a billing_records
alter table billing_records add column if not exists credit_applied numeric not null default 0;

-- 4. Actualizar constraint de status en affiliate_commissions para incluir 'credited'
alter table affiliate_commissions drop constraint if exists affiliate_commissions_status_check;
alter table affiliate_commissions add constraint affiliate_commissions_status_check
  check (status in ('credited', 'pending', 'paid', 'cancelled'));
alter table affiliate_commissions alter column status set default 'credited';

-- 5. Actualizar default de commission_pct en affiliate_commissions
alter table affiliate_commissions alter column commission_pct set default 10;

-- 6. Actualizar registros existentes de afiliados a nuevos valores
update affiliates set commission_pct = 10 where commission_pct = 20;

-- 7. Recalcular funciones

-- calculate_model_price: 6 meses, nuevos tiers (1=5%, 2=10%, 3+=15%)
create or replace function calculate_model_price(p_model_id uuid)
returns table (
  base_price numeric, billing_cycle text,
  annual_discount_pct numeric, annual_discount_amount numeric,
  referral_discount_pct numeric, referral_discount_amount numeric,
  final_price numeric, referral_count int
) as $$
declare
  v_model models%rowtype;
  v_monthly numeric; v_annual numeric; v_base numeric;
  v_ref_count int; v_ref_pct numeric;
  v_ann_pct numeric; v_ann_amt numeric; v_ref_amt numeric;
begin
  select * into v_model from models where id = p_model_id;
  v_monthly := case v_model.plan when 'solo' then 49 when 'pro' then 89 when 'agency' then 349 else 49 end;
  v_annual := case v_model.plan when 'solo' then 399 when 'pro' then 699 when 'agency' then 2800 else 399 end;
  v_base := case v_model.billing_cycle when 'annual' then v_annual else v_monthly end;
  if v_model.billing_cycle = 'annual' then
    v_ann_amt := (v_monthly * 12) - v_annual;
    v_ann_pct := round((v_ann_amt / (v_monthly * 12)) * 100, 2);
  else v_ann_amt := 0; v_ann_pct := 0; end if;
  select count(*) into v_ref_count from models
  where referred_by = v_model.referral_code and active = true
    and created_at > now() - interval '6 months';
  v_ref_pct := case when v_ref_count >= 3 then 15 when v_ref_count = 2 then 10
    when v_ref_count = 1 then 5 else 0 end;
  v_ref_amt := round(v_base * v_ref_pct / 100, 2);
  return query select v_base, v_model.billing_cycle, v_ann_pct, round(v_ann_amt, 2),
    v_ref_pct, v_ref_amt, v_base - v_ref_amt, v_ref_count;
end;
$$ language plpgsql security definer;

-- generate_monthly_billing: aplica saldo a favor
create or replace function generate_monthly_billing()
returns json as $$
declare
  v_model record; v_price record;
  v_period_start date; v_period_end date; v_period text;
  v_created int := 0;
  v_credit numeric; v_credit_used numeric; v_final numeric;
begin
  for v_model in
    select * from models where active = true
    and next_billing_date is not null
    and next_billing_date <= current_date + 7
  loop
    v_period_start := v_model.next_billing_date;
    v_period_end := case v_model.billing_cycle
      when 'annual' then (v_period_start + interval '1 year')::date
      else (v_period_start + interval '1 month')::date end;
    v_period := to_char(v_period_start, 'YYYY-MM');
    if not exists (select 1 from billing_records where model_id=v_model.id and period_start=v_period_start) then
      select * into v_price from calculate_model_price(v_model.id);
      -- Aplicar saldo a favor
      v_final := v_price.final_price;
      v_credit_used := 0;
      select coalesce(credit_balance, 0) into v_credit from affiliates where model_id=v_model.id;
      if v_credit > 0 then
        v_credit_used := least(v_credit, v_final);
        v_final := v_final - v_credit_used;
        update affiliates set credit_balance=credit_balance-v_credit_used where model_id=v_model.id;
      end if;
      insert into billing_records (model_id, period, period_start, period_end, billing_cycle, plan,
        base_price, annual_discount_pct, annual_discount_amount,
        referral_discount_pct, referral_discount_amount, credit_applied, total_amount)
      values (v_model.id, v_period, v_period_start, v_period_end, v_model.billing_cycle, v_model.plan,
        v_price.base_price, v_price.annual_discount_pct, v_price.annual_discount_amount,
        v_price.referral_discount_pct, v_price.referral_discount_amount, v_credit_used, v_final);
      v_created := v_created + 1;
    end if;
  end loop;
  return json_build_object('created', v_created);
end;
$$ language plpgsql security definer;

-- mark_billing_paid: 10% comisión, 6 meses, base sin dto referidos, crédito en vez de pago
create or replace function mark_billing_paid(
  p_billing_id uuid, p_payment_method text default null, p_payment_reference text default null
) returns json as $$
declare
  v_billing billing_records%rowtype; v_model models%rowtype;
  v_affiliate models%rowtype; v_commission_amount numeric; v_months_elapsed int;
begin
  select * into v_billing from billing_records where id = p_billing_id;
  if not found then return json_build_object('error', 'Registro no encontrado'); end if;
  update billing_records set status='paid', paid_at=now(),
    payment_method=p_payment_method, payment_reference=p_payment_reference where id=p_billing_id;
  select * into v_model from models where id = v_billing.model_id;
  update models set subscription_expires_at=v_billing.period_end,
    next_billing_date=v_billing.period_end, active=true, grace_period_until=null
  where id=v_billing.model_id;
  if v_model.referred_by is not null then
    select * into v_affiliate from models where referral_code=v_model.referred_by and active=true;
    if found and v_model.created_at > now() - interval '6 months' then
      select count(*) into v_months_elapsed from affiliate_commissions
      where referred_model_id=v_model.id and affiliate_model_id=v_affiliate.id;
      if v_months_elapsed < 6 then
        v_commission_amount := round((v_billing.base_price - v_billing.annual_discount_amount) * 0.10, 2);
        insert into affiliate_commissions (affiliate_model_id, referred_model_id, billing_record_id,
          period, commission_pct, base_amount, commission_amount, month_number, status)
        values (v_affiliate.id, v_model.id, p_billing_id, v_billing.period,
          10, v_billing.base_price - v_billing.annual_discount_amount, v_commission_amount, v_months_elapsed+1, 'credited');
        update affiliates set total_earned=total_earned+v_commission_amount,
          credit_balance=credit_balance+v_commission_amount,
          months_remaining=greatest(0, 6-(v_months_elapsed+1)) where model_id=v_affiliate.id;
      end if;
    end if;
  end if;
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ✅ Patch v2 completado
