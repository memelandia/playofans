-- ============================================
-- PlayOFans — Migración segura
-- Ejecutar en Supabase SQL Editor
-- Solo agrega lo que falta, no toca lo existente
-- ============================================

-- 0. Extensiones
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 1. TABLAS (IF NOT EXISTS)
create table if not exists models (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  email text unique not null,
  plan text not null default 'solo' check (plan in ('solo', 'pro', 'agency')),
  theme text not null default 'dark_luxury',
  welcome_message text default '¡Hola {nombre}! Gira la ruleta 🎰',
  post_prize_message text default '¡Felicidades {nombre}! 🎉',
  prizes jsonb not null default '["Premio 1","Premio 2"]'::jsonb,
  spins_per_code int not null default 3,
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

create table if not exists game_catalog (
  id text primary key,
  name text not null,
  description text,
  min_plan text not null default 'solo',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists codes (
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

create table if not exists spins (
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

create table if not exists affiliates (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references models(id) on delete cascade,
  referral_code text unique not null,
  commission_pct numeric not null default 20,
  total_earned numeric not null default 0,
  months_remaining int not null default 12,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists discount_codes (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  discount_pct numeric not null,
  max_uses int,
  times_used int not null default 0,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists agency_members (
  id uuid primary key default uuid_generate_v4(),
  agency_model_id uuid not null references models(id) on delete cascade,
  member_model_id uuid not null references models(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agency_model_id, member_model_id)
);

create table if not exists registration_requests (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  display_name text not null,
  artistic_name text,
  slug text not null,
  country text not null default 'ES',
  plan text not null default 'solo',
  monthly_revenue text,
  has_agency text,
  active_fans text,
  acquisition_channel text,
  telegram_or_instagram text,
  referral_code text,
  discount_code text,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- 2. ÍNDICES (IF NOT EXISTS)
create index if not exists idx_models_slug on models(slug);
create index if not exists idx_models_email on models(email);
create index if not exists idx_models_supabase_user on models(supabase_user_id);
create index if not exists idx_models_referral on models(referral_code);
create index if not exists idx_codes_model on codes(model_id);
create index if not exists idx_codes_code on codes(code);
create index if not exists idx_codes_model_code on codes(model_id, code) where deleted = false;
create index if not exists idx_codes_game_type on codes(game_type);
create index if not exists idx_spins_code on spins(code_id);
create index if not exists idx_spins_model on spins(model_id);
create index if not exists idx_spins_token on spins(token);
create index if not exists idx_spins_created on spins(created_at);
create index if not exists idx_affiliates_referral on affiliates(referral_code);
create index if not exists idx_affiliates_model on affiliates(model_id);
create index if not exists idx_agency_agency on agency_members(agency_model_id);
create index if not exists idx_agency_member on agency_members(member_model_id);
create index if not exists idx_registration_status on registration_requests(status);

-- 3. FUNCIONES (create or replace = seguro)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function reset_monthly_codes()
returns void as $$
begin
  update models
  set codes_created_this_month = 0,
      codes_month_reset = date_trunc('month', now())::date
  where codes_month_reset < date_trunc('month', now())::date;
end;
$$ language plpgsql security definer;

create or replace function generate_model_codes()
returns trigger as $$
begin
  if new.code_prefix is null then
    new.code_prefix := upper(substring(new.slug from greatest(1, (char_length(new.slug) - 3) / 2 + 1) for 4));
  end if;
  if new.referral_code is null then
    new.referral_code := 'REF-' || upper(new.slug);
  end if;
  return new;
end;
$$ language plpgsql;

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

-- 4. TRIGGERS (drop + create para evitar duplicados)
drop trigger if exists trg_models_updated on models;
create trigger trg_models_updated
  before update on models
  for each row execute function update_updated_at();

drop trigger if exists trg_codes_updated on codes;
create trigger trg_codes_updated
  before update on codes
  for each row execute function update_updated_at();

drop trigger if exists trg_models_generate_codes on models;
create trigger trg_models_generate_codes
  before insert on models
  for each row execute function generate_model_codes();

drop trigger if exists trg_models_validate_prizes on models;
create trigger trg_models_validate_prizes
  before insert or update of prizes on models
  for each row execute function validate_prizes();

drop trigger if exists trg_models_validate_theme on models;
create trigger trg_models_validate_theme
  before insert or update of theme, plan on models
  for each row execute function validate_theme_by_plan();

-- 5. RLS (habilitar es idempotente)
alter table models enable row level security;
alter table codes enable row level security;
alter table spins enable row level security;
alter table affiliates enable row level security;
alter table discount_codes enable row level security;
alter table agency_members enable row level security;
alter table registration_requests enable row level security;
alter table game_catalog enable row level security;

-- Policies: drop + create para evitar errores de "ya existe"
drop policy if exists "models_public_read" on models;
create policy "models_public_read" on models for select using (true);

drop policy if exists "models_owner_update" on models;
create policy "models_owner_update" on models for update using (auth.uid() = supabase_user_id);

drop policy if exists "codes_model_owner" on codes;
create policy "codes_model_owner" on codes for all using (
  model_id in (select id from models where supabase_user_id = auth.uid())
);

drop policy if exists "spins_model_owner" on spins;
create policy "spins_model_owner" on spins for all using (
  model_id in (select id from models where supabase_user_id = auth.uid())
);

drop policy if exists "affiliates_model_owner" on affiliates;
create policy "affiliates_model_owner" on affiliates for all using (
  model_id in (select id from models where supabase_user_id = auth.uid())
);

drop policy if exists "discount_codes_public_read" on discount_codes;
create policy "discount_codes_public_read" on discount_codes for select using (active = true);

drop policy if exists "agency_read" on agency_members;
create policy "agency_read" on agency_members for select using (
  agency_model_id in (select id from models where supabase_user_id = auth.uid())
);

drop policy if exists "registration_insert" on registration_requests;
create policy "registration_insert" on registration_requests for insert with check (true);

drop policy if exists "game_catalog_public_read" on game_catalog;
create policy "game_catalog_public_read" on game_catalog for select using (enabled = true);

-- 6. DATOS INICIALES (upsert = no duplica)
insert into game_catalog (id, name, description, min_plan) values
  ('ruleta', 'Ruleta de Premios', 'Ruleta giratoria con premios personalizables', 'solo'),
  ('rasca', 'Rasca y Gana', 'Rasca y descubre tu premio', 'pro')
on conflict (id) do nothing;

-- ============================================
-- 7. SPRINT 2-F — FACTURACIÓN Y COMISIONES
-- ============================================

-- Añadir billing_cycle a models si no existe
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'models' and column_name = 'billing_cycle'
  ) then
    alter table models add column billing_cycle text not null default 'monthly'
      check (billing_cycle in ('monthly', 'annual'));
  end if;
end $$;

-- billing_records
create table if not exists billing_records (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references models(id) on delete cascade,
  period text not null,
  plan text not null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  base_price numeric not null,
  referral_discount_pct numeric not null default 0,
  referral_discount_amount numeric not null default 0,
  total_amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  payment_method text,
  payment_reference text,
  billing_notes text,
  due_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (model_id, period)
);

-- affiliate_commissions
create table if not exists affiliate_commissions (
  id uuid primary key default uuid_generate_v4(),
  affiliate_model_id uuid not null references models(id) on delete cascade,
  referred_model_id uuid not null references models(id) on delete cascade,
  billing_record_id uuid references billing_records(id) on delete set null,
  period text not null,
  month_number int not null,
  origin_amount numeric not null,
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_billing_model on billing_records(model_id);
create index if not exists idx_billing_period on billing_records(period);
create index if not exists idx_billing_status on billing_records(status);
create index if not exists idx_billing_due on billing_records(due_date);
create index if not exists idx_commissions_affiliate on affiliate_commissions(affiliate_model_id);
create index if not exists idx_commissions_referred on affiliate_commissions(referred_model_id);
create index if not exists idx_commissions_status on affiliate_commissions(status);
create index if not exists idx_commissions_period on affiliate_commissions(period);

-- RLS
alter table billing_records enable row level security;
alter table affiliate_commissions enable row level security;

drop policy if exists "commissions_affiliate_read" on affiliate_commissions;
create policy "commissions_affiliate_read" on affiliate_commissions
  for select using (
    affiliate_model_id in (select id from models where supabase_user_id = auth.uid())
  );

-- Auto-crear registro de afiliado al crear modelo
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

-- Generar cobros mensuales
create or replace function generate_monthly_billing()
returns json as $$
declare
  rec record;
  v_base_price numeric;
  v_referral_count int;
  v_referral_pct numeric;
  v_referral_amount numeric;
  v_total numeric;
  v_period text;
  v_created int := 0;
begin
  v_period := to_char(now(), 'YYYY-MM');
  for rec in
    select m.* from models m
    where m.active = true
    and m.subscription_expires_at is not null
    and m.subscription_expires_at <= now() + interval '30 days'
    and not exists (
      select 1 from billing_records br
      where br.model_id = m.id and br.period = v_period
    )
  loop
    v_base_price := case
      when rec.plan='solo'   and rec.billing_cycle='monthly' then 49
      when rec.plan='solo'   and rec.billing_cycle='annual'  then 399
      when rec.plan='pro'    and rec.billing_cycle='monthly' then 89
      when rec.plan='pro'    and rec.billing_cycle='annual'  then 699
      when rec.plan='agency' and rec.billing_cycle='monthly' then 349
      when rec.plan='agency' and rec.billing_cycle='annual'  then 2800
      else 0
    end;
    select count(*) into v_referral_count from models
    where referred_by = rec.referral_code and active = true
    and created_at > now() - interval '12 months';
    v_referral_pct := case
      when v_referral_count >= 3 then 20
      when v_referral_count = 2  then 15
      when v_referral_count = 1  then 10 else 0
    end;
    v_referral_amount := round(v_base_price * v_referral_pct / 100, 2);
    v_total := v_base_price - v_referral_amount;
    insert into billing_records (model_id, period, plan, billing_cycle, base_price,
      referral_discount_pct, referral_discount_amount, total_amount, due_date)
    values (rec.id, v_period, rec.plan, rec.billing_cycle, v_base_price,
      v_referral_pct, v_referral_amount, v_total, rec.subscription_expires_at);
    v_created := v_created + 1;
  end loop;
  return json_build_object('created', v_created);
end;
$$ language plpgsql security definer;

-- Marcar cobro como pagado y generar comisión
create or replace function mark_billing_paid(
  p_billing_id uuid,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns json as $$
declare
  v_billing billing_records%rowtype;
  v_referred_model models%rowtype;
  v_affiliate_model models%rowtype;
  v_month_number int;
begin
  select * into v_billing from billing_records where id = p_billing_id;
  if not found then return json_build_object('error', 'Registro no encontrado'); end if;
  update billing_records set status='paid', payment_method=p_payment_method,
    payment_reference=p_payment_reference, paid_at=now() where id = p_billing_id;
  select * into v_referred_model from models where id = v_billing.model_id;
  if v_referred_model.referred_by is not null then
    select * into v_affiliate_model from models
    where referral_code = v_referred_model.referred_by and active = true;
    if found then
      if v_referred_model.created_at > now() - interval '12 months' then
        v_month_number := greatest(1,
          extract(year from age(now(), v_referred_model.created_at))::int * 12 +
          extract(month from age(now(), v_referred_model.created_at))::int + 1);
        insert into affiliate_commissions (affiliate_model_id, referred_model_id,
          billing_record_id, period, month_number, origin_amount, amount, status)
        values (v_affiliate_model.id, v_referred_model.id, p_billing_id,
          v_billing.period, v_month_number, v_billing.total_amount,
          round(v_billing.total_amount * 0.20, 2), 'pending');
        update affiliates set total_earned = total_earned + round(v_billing.total_amount * 0.20, 2)
        where model_id = v_affiliate_model.id;
      end if;
    end if;
  end if;
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- ✅ Migración completada
-- ============================================
