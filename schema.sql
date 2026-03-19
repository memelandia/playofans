-- ============================================
-- PlayOFans.com — Schema completo Supabase
-- Sprint 1-A · Ejecutar en Supabase SQL Editor
-- ============================================

-- 0. Extensiones necesarias
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. TABLAS
-- ============================================

-- Modelos (tenants)
create table models (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  email text unique not null,
  plan text not null default 'solo' check (plan in ('solo', 'pro', 'agency')),
  theme text not null default 'dark_luxury' check (theme in (
    'dark_luxury', 'rose_gold', 'neon_cyber', 'gold_vip', 'red_hot',
    'halloween', 'navidad', 'san_valentin', 'summer', 'galaxy'
  )),
  welcome_message text default '¡Hola {nombre}! Gira la ruleta 🎰' check (char_length(welcome_message) <= 80),
  post_prize_message text default '¡Felicidades {nombre}! 🎉' check (char_length(post_prize_message) <= 100),
  prizes jsonb not null default '["Premio 1","Premio 2"]'::jsonb,
  spins_per_code int not null default 3 check (spins_per_code >= 1),
  code_prefix text not null,
  referral_code text unique,
  sound_enabled_default boolean not null default true,
  force_dark_mode boolean not null default false,
  admin_notes text,
  active boolean not null default true,
  subscription_expires_at timestamptz,
  grace_period_until timestamptz,
  codes_created_this_month int not null default 0,
  codes_month_reset date not null default date_trunc('month', now())::date,
  referred_by text,
  supabase_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catálogo de juegos disponibles
create table game_catalog (
  id text primary key,
  name text not null,
  description text,
  min_plan text not null default 'solo' check (min_plan in ('solo', 'pro', 'agency')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Códigos de fans
create table codes (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references models(id) on delete cascade,
  code text not null,
  fan_name text not null,
  game_type text not null default 'ruleta' references game_catalog(id),
  prizes jsonb,
  expires_at timestamptz,
  total_spins int not null default 3,
  remaining_spins int not null default 3,
  used boolean not null default false,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, code)
);

-- Historial de tiradas
create table spins (
  id uuid primary key default uuid_generate_v4(),
  code_id uuid not null references codes(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  prize text not null,
  wheel_index int not null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  verified boolean not null default false,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- Afiliados
create table affiliates (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references models(id) on delete cascade,
  referral_code text unique not null,
  commission_pct numeric not null default 10 check (commission_pct >= 0 and commission_pct <= 100),
  total_earned numeric not null default 0,
  credit_balance numeric not null default 0,
  months_remaining int not null default 6,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Códigos de descuento (cupones)
create table discount_codes (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  discount_pct numeric not null check (discount_pct > 0 and discount_pct <= 100),
  max_uses int,
  times_used int not null default 0,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Miembros de agencia (plan Agency)
create table agency_members (
  id uuid primary key default uuid_generate_v4(),
  agency_model_id uuid not null references models(id) on delete cascade,
  member_model_id uuid not null references models(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agency_model_id, member_model_id)
);

-- Solicitudes de registro (modelos nuevas)
create table registration_requests (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  display_name text not null,
  artistic_name text,
  slug text not null,
  country text not null default 'ES',
  plan text not null default 'solo' check (plan in ('solo', 'pro', 'agency')),
  monthly_revenue text,
  has_agency text,
  active_fans text,
  acquisition_channel text,
  telegram_or_instagram text,
  referral_code text,
  discount_code text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ============================================
-- 2. ÍNDICES
-- ============================================

create index idx_models_slug on models(slug);
create index idx_models_email on models(email);
create index idx_models_supabase_user on models(supabase_user_id);
create index idx_models_referral on models(referral_code);

create index idx_codes_model on codes(model_id);
create index idx_codes_code on codes(code);
create index idx_codes_model_code on codes(model_id, code) where deleted = false;
create index idx_codes_game_type on codes(game_type);

create index idx_spins_code on spins(code_id);
create index idx_spins_model on spins(model_id);
create index idx_spins_token on spins(token);
create index idx_spins_created on spins(created_at);

create index idx_affiliates_referral on affiliates(referral_code);
create index idx_affiliates_model on affiliates(model_id);

create index idx_agency_agency on agency_members(agency_model_id);
create index idx_agency_member on agency_members(member_model_id);

create index idx_registration_status on registration_requests(status);

-- ============================================
-- 3. UPDATED_AT AUTOMÁTICO
-- ============================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_models_updated
  before update on models
  for each row execute function update_updated_at();

create trigger trg_codes_updated
  before update on codes
  for each row execute function update_updated_at();

-- ============================================
-- 4. RESET MENSUAL DE CÓDIGOS (plan Solo)
-- ============================================

create or replace function reset_monthly_codes()
returns void as $$
begin
  update models
  set codes_created_this_month = 0,
      codes_month_reset = date_trunc('month', now())::date
  where codes_month_reset < date_trunc('month', now())::date;
end;
$$ language plpgsql security definer;

-- ============================================
-- 5. GENERAR code_prefix Y referral_code AUTOMÁTICAMENTE
-- ============================================

create or replace function generate_model_codes()
returns trigger as $$
begin
  -- code_prefix: 4 letras centrales del slug en mayúsculas
  if new.code_prefix is null then
    new.code_prefix := upper(substring(new.slug from greatest(1, (char_length(new.slug) - 3) / 2 + 1) for 4));
  end if;
  -- referral_code: REF-SLUG en mayúsculas
  if new.referral_code is null then
    new.referral_code := 'REF-' || upper(new.slug);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_models_generate_codes
  before insert on models
  for each row execute function generate_model_codes();

-- ============================================
-- 6. VALIDACIÓN DE PREMIOS (2-10)
-- ============================================

create or replace function validate_prizes()
returns trigger as $$
declare
  prize_count int;
begin
  prize_count := jsonb_array_length(new.prizes);
  if prize_count < 2 or prize_count > 10 then
    raise exception 'prizes must have between 2 and 10 items, got %', prize_count;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_models_validate_prizes
  before insert or update of prizes on models
  for each row execute function validate_prizes();

-- ============================================
-- 7. VALIDACIÓN DE TEMA POR PLAN
-- ============================================

create or replace function validate_theme_by_plan()
returns trigger as $$
declare
  pro_themes text[] := array['halloween', 'navidad', 'san_valentin', 'summer', 'galaxy'];
begin
  if new.plan = 'solo' and new.theme = any(pro_themes) then
    raise exception 'theme "%" requires plan Pro or superior', new.theme;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_models_validate_theme
  before insert or update of theme, plan on models
  for each row execute function validate_theme_by_plan();

-- ============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================

alter table models enable row level security;
alter table codes enable row level security;
alter table spins enable row level security;
alter table affiliates enable row level security;
alter table discount_codes enable row level security;
alter table agency_members enable row level security;
alter table registration_requests enable row level security;
alter table game_catalog enable row level security;

-- models: lectura pública (incluye inactivos para mostrar mensaje de cuenta suspendida)
create policy "models_public_read" on models
  for select using (true);

create policy "models_owner_update" on models
  for update using (auth.uid() = supabase_user_id);

-- codes: solo el modelo dueño
create policy "codes_model_owner" on codes
  for all using (
    model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- spins: solo el modelo dueño
create policy "spins_model_owner" on spins
  for all using (
    model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- affiliates: solo el modelo dueño
create policy "affiliates_model_owner" on affiliates
  for all using (
    model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- discount_codes: lectura pública (validar), escritura solo service_role
create policy "discount_codes_public_read" on discount_codes
  for select using (active = true);

-- agency_members: lectura para la agencia
create policy "agency_read" on agency_members
  for select using (
    agency_model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- registration_requests: insertar cualquiera, leer solo service_role
create policy "registration_insert" on registration_requests
  for insert with check (true);

-- game_catalog: lectura pública
create policy "game_catalog_public_read" on game_catalog
  for select using (enabled = true);

-- ============================================
-- 9. DATOS INICIALES
-- ============================================

insert into game_catalog (id, name, description, min_plan) values
  ('ruleta', 'Ruleta de Premios', 'Ruleta giratoria con premios personalizables', 'solo'),
  ('rasca', 'Rasca y Gana', 'Rasca y descubre tu premio', 'pro');

-- ============================================
-- 10. SPRINT 2-F — FACTURACIÓN Y COMISIONES
-- ============================================

-- Añadir campos de facturación a modelos
alter table models add column if not exists billing_cycle text not null default 'monthly'
  check (billing_cycle in ('monthly', 'annual'));
alter table models add column if not exists next_billing_date date;
alter table models add column if not exists billing_notes text;

-- Registros de facturación
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
  credit_applied numeric not null default 0,
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

-- Comisiones de afiliados
create table affiliate_commissions (
  id uuid primary key default uuid_generate_v4(),
  affiliate_model_id uuid not null references models(id) on delete cascade,
  referred_model_id uuid not null references models(id) on delete cascade,
  billing_record_id uuid references billing_records(id) on delete set null,
  period text not null,
  commission_pct numeric not null default 10,
  base_amount numeric not null,
  commission_amount numeric not null,
  month_number int not null,
  status text not null default 'credited'
    check (status in ('credited', 'pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Índices de facturación
create index idx_billing_model on billing_records(model_id);
create index idx_billing_period on billing_records(period);
create index idx_billing_status on billing_records(status);
create index idx_billing_period_start on billing_records(period_start);
create index idx_billing_next on models(next_billing_date);
create index idx_commissions_affiliate on affiliate_commissions(affiliate_model_id);
create index idx_commissions_referred on affiliate_commissions(referred_model_id);
create index idx_commissions_status on affiliate_commissions(status);
create index idx_commissions_period on affiliate_commissions(period);

-- Trigger updated_at en billing_records
create trigger trg_billing_updated
  before update on billing_records
  for each row execute function update_updated_at();

-- RLS para billing_records y affiliate_commissions
alter table billing_records enable row level security;
alter table affiliate_commissions enable row level security;

-- Las modelos pueden ver sus propios cobros
create policy "billing_model_read" on billing_records
  for select using (
    model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- Los afiliados pueden ver sus comisiones
create policy "commissions_affiliate_read" on affiliate_commissions
  for select using (
    affiliate_model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- ============================================
-- 11. AUTO-CREAR REGISTRO DE AFILIADO
-- ============================================

create or replace function create_affiliate_record()
returns trigger as $$
begin
  insert into affiliates (model_id, referral_code)
  values (new.id, new.referral_code)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_models_create_affiliate
  after insert on models
  for each row execute function create_affiliate_record();

-- ============================================
-- 12. CALCULAR PRECIO DE UNA MODELO
-- ============================================

create or replace function calculate_model_price(p_model_id uuid)
returns table (
  base_price numeric,
  billing_cycle text,
  annual_discount_pct numeric,
  annual_discount_amount numeric,
  referral_discount_pct numeric,
  referral_discount_amount numeric,
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
begin
  select * into v_model from models where id = p_model_id;

  -- Precios mensuales
  v_monthly := case v_model.plan
    when 'solo' then 49 when 'pro' then 89 when 'agency' then 349 else 49
  end;
  -- Precios anuales
  v_annual := case v_model.plan
    when 'solo' then 399 when 'pro' then 699 when 'agency' then 2800 else 399
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

  return query select
    v_base, v_model.billing_cycle,
    v_ann_pct, round(v_ann_amt, 2),
    v_ref_pct, v_ref_amt,
    v_base - v_ref_amt, v_ref_count;
end;
$$ language plpgsql security definer;

-- ============================================
-- 13. GENERAR COBROS MENSUALES
-- ============================================

create or replace function generate_monthly_billing()
returns json as $$
declare
  v_model record;
  v_price record;
  v_period_start date;
  v_period_end date;
  v_period text;
  v_created int := 0;
  v_credit numeric;
  v_credit_used numeric;
  v_final numeric;
begin
  for v_model in
    select * from models
    where active = true
      and next_billing_date is not null
      and next_billing_date <= current_date + 7
  loop
    v_period_start := v_model.next_billing_date;
    v_period_end := case v_model.billing_cycle
      when 'annual' then (v_period_start + interval '1 year')::date
      else (v_period_start + interval '1 month')::date
    end;
    v_period := to_char(v_period_start, 'YYYY-MM');

    if not exists (
      select 1 from billing_records
      where model_id = v_model.id and period_start = v_period_start
    ) then
      select * into v_price from calculate_model_price(v_model.id);

      -- Aplicar saldo a favor (credit_balance) del afiliado
      v_final := v_price.final_price;
      v_credit_used := 0;
      select coalesce(credit_balance, 0) into v_credit
      from affiliates where model_id = v_model.id;
      if v_credit > 0 then
        v_credit_used := least(v_credit, v_final);
        v_final := v_final - v_credit_used;
        update affiliates set credit_balance = credit_balance - v_credit_used
        where model_id = v_model.id;
      end if;

      insert into billing_records (
        model_id, period, period_start, period_end, billing_cycle, plan,
        base_price, annual_discount_pct, annual_discount_amount,
        referral_discount_pct, referral_discount_amount,
        credit_applied, total_amount
      ) values (
        v_model.id, v_period, v_period_start, v_period_end,
        v_model.billing_cycle, v_model.plan, v_price.base_price,
        v_price.annual_discount_pct, v_price.annual_discount_amount,
        v_price.referral_discount_pct, v_price.referral_discount_amount,
        v_credit_used, v_final
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return json_build_object('created', v_created);
end;
$$ language plpgsql security definer;

-- ============================================
-- 14. MARCAR COBRO COMO PAGADO + RENOVAR + COMISIÓN
-- ============================================

create or replace function mark_billing_paid(
  p_billing_id uuid,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns json as $$
declare
  v_billing billing_records%rowtype;
  v_model models%rowtype;
  v_affiliate models%rowtype;
  v_commission_amount numeric;
  v_months_elapsed int;
begin
  select * into v_billing from billing_records where id = p_billing_id;
  if not found then
    return json_build_object('error', 'Registro no encontrado');
  end if;

  -- Marcar como pagado
  update billing_records set
    status = 'paid',
    paid_at = now(),
    payment_method = p_payment_method,
    payment_reference = p_payment_reference
  where id = p_billing_id;

  -- Renovar suscripción automáticamente
  select * into v_model from models where id = v_billing.model_id;
  update models set
    subscription_expires_at = v_billing.period_end,
    next_billing_date = v_billing.period_end,
    active = true,
    grace_period_until = null
  where id = v_billing.model_id;

  -- Generar comisión para el afiliado si aplica
  if v_model.referred_by is not null then
    select * into v_affiliate from models
    where referral_code = v_model.referred_by and active = true;

    if found and v_model.created_at > now() - interval '6 months' then
      select count(*) into v_months_elapsed
      from affiliate_commissions
      where referred_model_id = v_model.id
        and affiliate_model_id = v_affiliate.id;

      if v_months_elapsed < 6 then
        -- Comisión sobre el importe después de descuento anual, antes de descuento por referidos
        v_commission_amount := round((v_billing.base_price - v_billing.annual_discount_amount) * 0.10, 2);

        insert into affiliate_commissions (
          affiliate_model_id, referred_model_id, billing_record_id,
          period, commission_pct, base_amount, commission_amount,
          month_number, status
        ) values (
          v_affiliate.id, v_model.id, p_billing_id,
          v_billing.period, 10, v_billing.base_price - v_billing.annual_discount_amount,
          v_commission_amount, v_months_elapsed + 1, 'credited'
        );

        -- Acumular como saldo a favor del afiliado
        update affiliates set
          total_earned = total_earned + v_commission_amount,
          credit_balance = credit_balance + v_commission_amount,
          months_remaining = greatest(0, 6 - (v_months_elapsed + 1))
        where model_id = v_affiliate.id;
      end if;
    end if;
  end if;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;
