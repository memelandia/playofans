const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { slug, fan_name, total_spins, prizes, expires_at } = body;

    if (!slug || !fan_name?.trim()) return json(400, { error: 'Faltan datos obligatorios (slug y nombre del fan)' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, plan, code_prefix, prizes, codes_created_this_month, codes_month_reset, spins_per_code')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    // Resetear contador mensual si cambió el mes
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const resetMonth = model.codes_month_reset ? model.codes_month_reset.slice(0, 7) : '';
    let monthCount = model.codes_created_this_month;

    if (currentMonth !== resetMonth) {
      monthCount = 0;
      await supabase.from('models').update({
        codes_created_this_month: 0,
        codes_month_reset: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      }).eq('id', model.id);
    }

    // Verificar límite plan Solo
    if (model.plan === 'solo' && monthCount >= 100) {
      return json(429, { error: 'Has alcanzado el límite de 100 códigos este mes. Actualiza a Pro para códigos ilimitados.' });
    }

    // Validar premios custom
    const codePrizes = prizes && Array.isArray(prizes) && prizes.length >= 2 && prizes.length <= 10
      ? prizes : null;

    // Validar tiradas (1-10)
    const spins = Math.min(10, Math.max(1, parseInt(total_spins) || model.spins_per_code));

    // Generar código único: PREFIX + 4 dígitos
    let code;
    let attempts = 0;
    do {
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      code = model.code_prefix.toUpperCase() + digits;
      const { data: existing } = await supabase
        .from('codes')
        .select('id')
        .eq('model_id', model.id)
        .eq('code', code)
        .maybeSingle();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) return json(500, { error: 'No se pudo generar un código único. Intenta de nuevo.' });

    // Insertar código
    const insertData = {
      model_id: model.id,
      code,
      fan_name: fan_name.trim(),
      game_type: 'ruleta',
      prizes: codePrizes,
      total_spins: spins,
      remaining_spins: spins,
    };
    if (expires_at) insertData.expires_at = expires_at;

    const { data: newCode, error: insertError } = await supabase
      .from('codes')
      .insert(insertData)
      .select()
      .single();

    if (insertError) return json(500, { error: 'Error al crear el código' });

    // Incrementar contador mensual
    await supabase.from('models').update({
      codes_created_this_month: monthCount + 1
    }).eq('id', model.id);

    return json(201, {
      code: newCode,
      link: `https://playofans.com/${slug}/ruleta?c=${code}`,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
