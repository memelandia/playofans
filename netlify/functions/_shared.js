const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://playofans.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Superadmin-Secret',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function handleOptions() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

// Jerarquía de planes: solo < pro < agency
const PLAN_RANK = { solo: 0, pro: 1, agency: 2 };

// Precios mensuales por plan (fuente única de verdad para funciones JS)
const PLAN_PRICES = { solo: 49, pro: 89, agency: 349 };

function planCanAccess(userPlan, requiredPlan) {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

// Autenticar admin: verifica JWT y devuelve { user } o { error }
async function authenticateAdmin(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { error: json(401, { error: 'No autenticado' }) };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: json(401, { error: 'Sesión inválida o expirada' }) };
  }

  return { user };
}

// Autenticar superadmin: JWT + SUPERADMIN_SECRET
async function authenticateSuperAdmin(event) {
  const auth = await authenticateAdmin(event);
  if (auth.error) return auth;

  const secret = event.headers['x-superadmin-secret'] || '';
  const expected = process.env.SUPERADMIN_SECRET || '';
  if (!secret || secret.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return { error: json(403, { error: 'Acceso denegado' }) };
  }

  return { user: auth.user };
}

// Slugs reservados (rutas del sistema). Actualizar también en registro.html si se cambian.
const RESERVED_SLUGS = ['admin', 'superadmin', 'api', 'demo', 'precios', 'guia', 'registro', 'contacto', 'afiliados', 'sounds', 'netlify', 'blog', '404'];

module.exports = { supabase, CORS_HEADERS, json, handleOptions, planCanAccess, PLAN_RANK, PLAN_PRICES, authenticateAdmin, authenticateSuperAdmin, RESERVED_SLUGS };
