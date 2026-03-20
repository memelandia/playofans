-- ============================================
-- PATCH: Auditoría #2 — Fase 5 (SQL & Schema)
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- DB1: Índice para queries que filtran por active (billing, cron, grace)
create index if not exists idx_models_active on models(active);

-- DB2: Índice para checks de expiración y grace period
create index if not exists idx_models_sub_expires on models(subscription_expires_at);

-- DB3: Índice para queries que filtran codes por deleted
create index if not exists idx_codes_deleted on codes(deleted);

-- DB4: Trigger que impide cambiar el slug de un modelo (inmutabilidad)
create or replace function prevent_slug_change()
returns trigger
language plpgsql as $$
begin
  if OLD.slug is distinct from NEW.slug then
    raise exception 'El slug no puede ser modificado una vez creado';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_models_slug_immutable on models;
create trigger trg_models_slug_immutable
  before update on models
  for each row
  execute function prevent_slug_change();

-- DB5: Trigger que limita a 8 miembros por agencia
create or replace function enforce_agency_member_limit()
returns trigger
language plpgsql as $$
declare
  member_count int;
begin
  select count(*) into member_count
  from agency_members
  where agency_model_id = NEW.agency_model_id;

  if member_count >= 8 then
    raise exception 'Una agencia no puede tener más de 8 miembros';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_agency_member_limit on agency_members;
create trigger trg_agency_member_limit
  before insert on agency_members
  for each row
  execute function enforce_agency_member_limit();

-- DB6: Tabla de auditoría para cambios de modelo
create table if not exists model_audit_log (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  action text not null,
  changed_by text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_model on model_audit_log(model_id);
create index if not exists idx_audit_created on model_audit_log(created_at);
