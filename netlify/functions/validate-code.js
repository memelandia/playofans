const { supabase, json, handleOptions } = require('./_shared');

// Rate limiting en memoria (por instancia de función)
const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    // Rate limiting por IP
    const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || event.headers['client-ip'] || 'unknown';
    if (isRateLimited(ip)) {
      return json(429, { error: 'Demasiados intentos. Espera un momento antes de volver a intentar.' });
    }

    const body = JSON.parse(event.body || '{}');
    const { slug, codigoId, fanName } = body;

    if (!slug || !codigoId) {
      return json(400, { error: 'Faltan datos obligatorios' });
    }

    // --- DEMO MODE ---
    if (slug === 'demo' && codigoId.toUpperCase() === 'DEMO2025') {
      const demoPrizes = [
        'Sexting 10min', 'Pack Fotos', 'Videollamada 5min',
        'Audio Exclusivo', 'Descuento 30%', 'Premio Sorpresa'
      ];
      return json(200, {
        fan_name: fanName || 'Fan',
        prizes: demoPrizes,
        remaining_spins: 999,
        total_spins: 999,
        expires_at: null,
        welcome_message: '¡Bienvenid@ a la demo de PlayOFans! Gira todas las veces que quieras 🎰',
        spin_history: [],
        demo: true,
      });
    }

    // Buscar modelo por slug
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, active, grace_period_until, welcome_message, prizes')
      .eq('slug', slug)
      .single();

    if (modelError || !model) return json(404, { error: 'Modelo no encontrado' });

    // Verificar cuenta activa o en grace
    const now = new Date();
    const inGrace = !model.active && model.grace_period_until && new Date(model.grace_period_until) > now;
    if (!model.active && !inGrace) {
      return json(403, { error: 'Esta ruleta no está disponible 🎰' });
    }

    // Buscar código
    const codeUpperCase = codigoId.toUpperCase();

    const { data: code, error: codeError } = await supabase
      .from('codes')
      .select('*')
      .eq('model_id', model.id)
      .eq('code', codeUpperCase)
      .eq('deleted', false)
      .single();

    if (codeError || !code) {
      return json(404, { error: 'Código no encontrado o eliminado' });
    }

    // Verificar expiración
    if (code.expires_at && new Date(code.expires_at) < now) {
      return json(410, { error: 'Este código ha expirado' });
    }

    // Verificar tiradas restantes
    if (code.remaining_spins <= 0) {
      return json(410, { error: 'Ya no te quedan tiradas con este código' });
    }

    // Preparar mensaje de bienvenida con nombre reemplazado
    const name = fanName || code.fan_name;
    const welcomeMessage = (model.welcome_message || '').replace(/\{nombre\}/gi, name);

    // Premios: los del código si existen, si no los globales del modelo
    const prizes = code.prizes || model.prizes;

    // Obtener historial de spins verificados para este código
    const { data: spinsData } = await supabase
      .from('spins')
      .select('prize, created_at')
      .eq('code_id', code.id)
      .eq('verified', true)
      .order('created_at', { ascending: false });

    const spin_history = (spinsData || []).map(s => ({
      nombre: s.prize,
      fecha: new Date(s.created_at).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
      timestamp: new Date(s.created_at).getTime()
    }));

    return json(200, {
      fan_name: code.fan_name,
      prizes,
      remaining_spins: code.remaining_spins,
      total_spins: code.total_spins,
      expires_at: code.expires_at,
      welcome_message: welcomeMessage,
      spin_history,
    });
  } catch (err) {
    console.error('Error en validate-code:', err.message, err.stack);
    return json(500, { error: 'Error interno del servidor' });
  }
};
