-- ============================================
-- PATCH: Reemplazar esquema billing del otro Claude
-- con la versión mergeada (columnas corregidas)
-- Seguro ejecutar si las tablas no tienen datos.
-- ============================================

-- 1. Borrar tablas viejas (cascade borra indexes, triggers, policies)
drop table if exists affiliate_commissions cascade;
drop table if exists billing_records cascade;

-- 2. Borrar funciones viejas
drop function if exists calculate_model_price(uuid);
drop function if exists generate_monthly_billing();
drop function if exists mark_billing_paid(uuid, text, text);
drop function if exists create_affiliate_record() cascade;

-- 3. Limpiar columnas redundantes que el otro Claude añadió a models
-- (base_price, annual_discount_pct, referral_discount_pct ya se calculan dinámicamente)
alter table models drop column if exists base_price;
alter table models drop column if exists annual_discount_pct;
alter table models drop column if exists referral_discount_pct;

-- 4. Añadir columnas correctas a models (si no existen)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='models' and column_name='billing_cycle') then
    alter table models add column billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='models' and column_name='next_billing_date') then
    alter table models add column next_billing_date date;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='models' and column_name='billing_notes') then
    alter table models add column billing_notes text;
  end if;
end $$;

-- 5. Crear billing_records con esquema mergeado
create table billing_records (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references models(id) on delete cascade,
  period text not null,
  period_start date not null,
  period_end date not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  plan text not null,
  base_price numeric not null,
  annual_discount_pct numeric not null default 0,
  annual_discount_amount numeric not null default 0,
  referral_discount_pct numeric not null default 0,
  referral_discount_amount numeric not null default 0,
  total_amount numeric not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method text,
  payment_reference text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Crear affiliate_commissions con esquema mergeado
create table affiliate_commissions (
  id uuid primary key default uuid_generate_v4(),
  affiliate_model_id uuid not null references models(id) on delete cascade,
  referred_model_id uuid not null references models(id) on delete cascade,
  billing_record_id uuid references billing_records(id) on delete set null,
  period text not null,
  commission_pct numeric not null default 20,
  base_amount numeric not null,
  commission_amount numeric not null,
  month_number int not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 7. Índices (drop primero por si existen en models u otros)
drop index if exists idx_billing_model;
drop index if exists idx_billing_period;
drop index if exists idx_billing_status;
drop index if exists idx_billing_period_start;
drop index if exists idx_billing_next;
drop index if exists idx_commissions_affiliate;
drop index if exists idx_commissions_referred;
drop index if exists idx_commissions_status;
drop index if exists idx_commissions_period;

create index idx_billing_model on billing_records(model_id);
create index idx_billing_period on billing_records(period);
create index idx_billing_status on billing_records(status);
create index idx_billing_period_start on billing_records(period_start);
create index idx_billing_next on models(next_billing_date);
create index idx_commissions_affiliate on affiliate_commissions(affiliate_model_id);
create index idx_commissions_referred on affiliate_commissions(referred_model_id);
create index idx_commissions_status on affiliate_commissions(status);
create index idx_commissions_period on affiliate_commissions(period);

-- 8. Trigger updated_at
create trigger trg_billing_updated
  before update on billing_records
  for each row execute function update_updated_at();

-- 9. RLS
alter table billing_records enable row level security;
alter table affiliate_commissions enable row level security;

create policy "billing_model_read" on billing_records
  for select using (
    model_id in (select id from models where supabase_user_id = auth.uid())
  );

create policy "commissions_affiliate_read" on affiliate_commissions
  for select using (
    affiliate_model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- 10. Funciones

-- Auto-crear registro de afiliado
create or replace function create_affiliate_record()
returns trigger as $$
begin
  insert into affiliates (model_id, referral_code)
  values (new.id, new.referral_code)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_models_create_affiliate on models;
create trigger trg_models_create_affiliate
  after insert on models
  for each row execute function create_affiliate_record();

-- Calcular precio de una modelo
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
    and created_at > now() - interval '12 months';
  v_ref_pct := case when v_ref_count >= 3 then 20 when v_ref_count = 2 then 15
    when v_ref_count = 1 then 10 else 0 end;
  v_ref_amt := round(v_base * v_ref_pct / 100, 2);
  return query select v_base, v_model.billing_cycle, v_ann_pct, round(v_ann_amt, 2),
    v_ref_pct, v_ref_amt, v_base - v_ref_amt, v_ref_count;
end;
$$ language plpgsql security definer;

-- Generar cobros mensuales
create or replace function generate_monthly_billing()
returns json as $$
declare
  v_model record; v_price record;
  v_period_start date; v_period_end date; v_period text;
  v_created int := 0;
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
      insert into billing_records (model_id, period, period_start, period_end, billing_cycle, plan,
        base_price, annual_discount_pct, annual_discount_amount,
        referral_discount_pct, referral_discount_amount, total_amount)
      values (v_model.id, v_period, v_period_start, v_period_end, v_model.billing_cycle, v_model.plan,
        v_price.base_price, v_price.annual_discount_pct, v_price.annual_discount_amount,
        v_price.referral_discount_pct, v_price.referral_discount_amount, v_price.final_price);
      v_created := v_created + 1;
    end if;
  end loop;
  return json_build_object('created', v_created);
end;
$$ language plpgsql security definer;

-- Marcar cobro como pagado + renovar + comisión
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
    if found and v_model.created_at > now() - interval '12 months' then
      select count(*) into v_months_elapsed from affiliate_commissions
      where referred_model_id=v_model.id and affiliate_model_id=v_affiliate.id;
      if v_months_elapsed < 12 then
        v_commission_amount := round(v_billing.total_amount * 0.20, 2);
        insert into affiliate_commissions (affiliate_model_id, referred_model_id, billing_record_id,
          period, commission_pct, base_amount, commission_amount, month_number, status)
        values (v_affiliate.id, v_model.id, p_billing_id, v_billing.period,
          20, v_billing.total_amount, v_commission_amount, v_months_elapsed+1, 'pending');
        update affiliates set total_earned=total_earned+v_commission_amount,
          months_remaining=greatest(0, 12-(v_months_elapsed+1)) where model_id=v_affiliate.id;
      end if;
    end if;
  end if;
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ✅ Patch completado
