-- ============================================
-- PATCH FASE 2: Seguridad Alta
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ----------------------------------------
-- S4: Tabla rate_limits (rate limiting persistente)
-- ----------------------------------------
create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  action text not null default 'validate-code',
  created_at timestamptz default now()
);

create index if not exists idx_rate_limits_lookup
  on rate_limits(ip_address, action, created_at);

alter table rate_limits enable row level security;

-- Función para limpiar registros antiguos (llamar periódicamente o desde cron)
create or replace function cleanup_rate_limits()
returns void as $$
begin
  delete from rate_limits where created_at < now() - interval '5 minutes';
end;
$$ language plpgsql security definer;

-- ----------------------------------------
-- F3: Confirm spin atómico (elimina race condition)
-- ----------------------------------------
create or replace function confirm_spin_atomic(p_spin_id uuid, p_code_id uuid)
returns json as $$
declare
  v_new_remaining int;
begin
  -- Marcar spin como verificado
  update spins set verified = true where id = p_spin_id and verified = false;

  if not found then
    return json_build_object('error', 'Spin ya verificado o no encontrado');
  end if;

  -- Decrementar atómicamente y obtener nuevo valor
  update codes
    set remaining_spins = greatest(0, remaining_spins - 1),
        used = case when remaining_spins <= 1 then true else used end
    where id = p_code_id
    returning remaining_spins into v_new_remaining;

  return json_build_object('remaining_spins', v_new_remaining);
end;
$$ language plpgsql security definer;
