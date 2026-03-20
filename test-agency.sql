-- ============================================
-- TEST: Datos de prueba para Panel de Agencia
-- ============================================
-- ANTES de ejecutar este script:
-- 1. Ve a Supabase Dashboard → Authentication → Users → Add User
-- 2. Email: agencia-test@playofans.com / Password: AgenciaTest2026!
-- 3. Marca "Auto Confirm"
-- 4. Copia el UUID del usuario creado
-- 5. Reemplaza 'PEGAR_UUID_AQUI' abajo con ese UUID
-- ============================================

-- Variable: pon aquí el UUID del auth user que creaste
-- Ejemplo: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

-- 1. Crear la modelo agencia
INSERT INTO models (slug, display_name, email, plan, theme, prizes, spins_per_code, code_prefix, active, subscription_expires_at, supabase_user_id)
VALUES (
  'agencia-test',
  'Agencia Test Premium',
  'agencia-test@playofans.com',
  'agency',
  'gold_vip',
  '["Video exclusivo","Chat privado","Foto firmada","Pack premium","Saludo especial","Contenido VIP","Descuento 50%","Sorpresa"]'::jsonb,
  3,
  'AGEN',
  true,
  now() + interval '30 days',
  'PEGAR_UUID_AQUI'  -- ← REEMPLAZAR con el UUID real del auth user
);

-- 2. Crear 6 modelos miembros (no necesitan auth user para el test)
INSERT INTO models (slug, display_name, email, plan, theme, prizes, spins_per_code, code_prefix, active, subscription_expires_at) VALUES
  ('modelo-luna', 'Luna Martinez', 'luna@test.com', 'solo', 'rose_gold',
   '["Foto exclusiva","Video corto","Saludo","Chat 5min","Sorpresa","Descuento","Pack fotos","Video largo"]'::jsonb,
   3, 'LUNA', true, now() + interval '30 days'),

  ('modelo-sofia', 'Sofía Valentina', 'sofia@test.com', 'pro', 'neon_cyber',
   '["Video privado","Foto firmada","Chat 10min","Pack premium","Contenido especial","Descuento VIP","Sorpresa","Saludo"]'::jsonb,
   3, 'SOFI', true, now() + interval '15 days'),

  ('modelo-vale', 'Valentina Rose', 'vale@test.com', 'solo', 'dark_luxury',
   '["Foto HD","Video dedicado","Pack básico","Saludo","Chat rápido","Descuento","Sorpresa","Contenido extra"]'::jsonb,
   3, 'VALE', true, now() + interval '25 days'),

  ('modelo-mia', 'Mía Torres', 'mia@test.com', 'pro', 'red_hot',
   '["Video exclusivo","Foto artística","Chat privado","Pack deluxe","Saludo personalizado","Contenido VIP","Descuento 30%","Regalo"]'::jsonb,
   3, 'MIAT', true, now() + interval '20 days'),

  ('modelo-camila', 'Camila Ríos', 'camila@test.com', 'solo', 'gold_vip',
   '["Foto especial","Video saludo","Chat 5min","Pack fotos","Sorpresa","Descuento","Contenido","Saludo"]'::jsonb,
   3, 'CAMI', true, now() + interval '10 days'),

  ('modelo-ana', 'Ana Belén', 'ana@test.com', 'solo', 'rose_gold',
   '["Video personalizado","Foto exclusiva","Chat privado","Pack básico","Saludo","Descuento","Sorpresa","Contenido VIP"]'::jsonb,
   3, 'ANAB', false, now() - interval '5 days');  -- ← INACTIVA para testear estado

-- 3. Vincular los 6 modelos como miembros de la agencia
INSERT INTO agency_members (agency_model_id, member_model_id)
SELECT
  (SELECT id FROM models WHERE slug = 'agencia-test'),
  id
FROM models
WHERE slug IN ('modelo-luna', 'modelo-sofia', 'modelo-vale', 'modelo-mia', 'modelo-camila', 'modelo-ana');

-- 4. Crear algunos códigos para que haya stats
INSERT INTO codes (model_id, code, fan_name, total_spins, remaining_spins, used, deleted)
SELECT m.id, m.code_prefix || lpad(floor(random()*10000)::text, 4, '0'), fan, 3, remaining, used, false
FROM models m
CROSS JOIN (VALUES
  ('Fan1', 3, false),
  ('Fan2', 0, true),
  ('Fan3', 1, false)
) AS fans(fan, remaining, used)
WHERE m.slug IN ('modelo-luna', 'modelo-sofia', 'modelo-vale', 'modelo-mia');

-- 5. Crear algunos spins verificados para stats
INSERT INTO spins (model_id, code_id, prize, wheel_index, verified)
SELECT c.model_id, c.id, 'Premio de prueba', 0, true
FROM codes c
JOIN models m ON c.model_id = m.id
WHERE m.slug IN ('modelo-luna', 'modelo-sofia', 'modelo-vale', 'modelo-mia')
  AND c.used = true;

-- Verificar que todo se creó correctamente
SELECT '=== AGENCIA ===' as info;
SELECT slug, display_name, plan, active FROM models WHERE slug = 'agencia-test';

SELECT '=== MIEMBROS ===' as info;
SELECT m.slug, m.display_name, m.plan, m.active
FROM agency_members am
JOIN models m ON am.member_model_id = m.id
JOIN models a ON am.agency_model_id = a.id
WHERE a.slug = 'agencia-test'
ORDER BY am.created_at;

SELECT '=== STATS ===' as info;
SELECT m.slug, 
  (SELECT count(*) FROM spins s WHERE s.model_id = m.id AND s.verified) as spins,
  (SELECT count(*) FROM codes c WHERE c.model_id = m.id AND NOT c.deleted AND NOT c.used AND c.remaining_spins > 0) as codes_active
FROM agency_members am
JOIN models m ON am.member_model_id = m.id
JOIN models a ON am.agency_model_id = a.id
WHERE a.slug = 'agencia-test';
