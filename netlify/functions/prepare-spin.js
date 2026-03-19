const { randomUUID } = require('crypto');
const { supabase, json, handleOptions } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const { codigoId, slug } = JSON.parse(event.body || '{}');
    if (!codigoId || !slug) {
      return json(400, { error: 'Faltan datos obligatorios' });
    }

    // Buscar modelo
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, active, grace_period_until, prizes')
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
    const { data: code, error: codeError } = await supabase
      .from('codes')
      .select('*')
      .eq('model_id', model.id)
      .eq('code', codigoId.toUpperCase())
      .eq('deleted', false)
      .single();

    if (codeError || !code) {
      return json(404, { error: 'Código no encontrado' });
    }

    if (code.remaining_spins <= 0) {
      return json(410, { error: 'Ya no te quedan tiradas con este código' });
    }

    // Verificar expiración
    if (code.expires_at && new Date(code.expires_at) < now) {
      return json(410, { error: 'Este código ha expirado' });
    }

    // Recovery: si hay un spin pendiente sin verificar, devolverlo
    const { data: pendingSpin } = await supabase
      .from('spins')
      .select('prize, wheel_index, token')
      .eq('code_id', code.id)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pendingSpin) {
      return json(200, {
        prize: pendingSpin.prize,
        wheelIndex: pendingSpin.wheel_index,
        token: pendingSpin.token,
        recovered: true,
      });
    }

    // Elegir premio ALEATORIAMENTE en el servidor (sin repetir)
    const prizes = code.prizes || model.prizes;

    // Obtener premios ya otorgados para este código (verificados + pendientes)
    const { data: previousSpins } = await supabase
      .from('spins')
      .select('prize')
      .eq('code_id', code.id);

    const wonPrizes = (previousSpins || []).map(s => s.prize);

    // Filtrar premios disponibles (no repetidos)
    let available = prizes
      .map((p, i) => ({ prize: p, index: i }))
      .filter(p => !wonPrizes.includes(p.prize));

    // Si todos los premios ya se ganaron, permitir cualquiera (fallback)
    if (available.length === 0) {
      available = prizes.map((p, i) => ({ prize: p, index: i }));
    }

    const chosen = available[Math.floor(Math.random() * available.length)];
    const prize = chosen.prize;
    const wheelIndex = chosen.index;
    const token = randomUUID();

    // Insertar spin con verified: false
    const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
    const { error: spinError } = await supabase.from('spins').insert({
      code_id: code.id,
      model_id: model.id,
      prize,
      wheel_index: wheelIndex,
      token,
      verified: false,
      ip_address: ip,
    });

    if (spinError) {
      return json(500, { error: 'Error al preparar la tirada' });
    }

    return json(200, {
      prize,
      wheelIndex,
      token,
      recovered: false,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
