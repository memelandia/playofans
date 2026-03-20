const { supabase, json, handleOptions, planCanAccess } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const slug = event.queryStringParameters?.slug;
    if (!slug) return json(400, { error: 'Falta el parámetro slug' });

    // Buscar modelo por slug
    const { data: model, error } = await supabase
      .from('models')
      .select('id, slug, display_name, plan, active, theme, welcome_message, post_prize_message, sound_enabled_default, force_dark_mode, prizes, spins_per_code, subscription_expires_at, grace_period_until')
      .eq('slug', slug)
      .single();

    if (error || !model) return json(404, { error: 'Modelo no encontrado' });

    // Verificar si está activa o en grace period
    const now = new Date();
    const inGrace = !model.active && model.grace_period_until && new Date(model.grace_period_until) > now;

    if (!model.active && !inGrace) {
      return json(403, { error: 'Esta ruleta no está disponible 🎰' });
    }

    // Obtener juegos activos según plan del modelo
    const { data: games } = await supabase
      .from('game_catalog')
      .select('id, name, description, min_plan')
      .eq('enabled', true);

    const activeGames = (games || []).filter(g => planCanAccess(model.plan, g.min_plan));

    // Calcular límite de códigos según plan
    const codesLimit = model.plan === 'solo' ? 100 : null;

    return json(200, {
      slug: model.slug,
      display_name: model.display_name,
      plan: model.plan,
      theme: model.theme,
      welcome_message: model.welcome_message,
      post_prize_message: model.post_prize_message,
      sound_enabled_default: model.sound_enabled_default,
      force_dark_mode: model.force_dark_mode,
      prizes: model.prizes,
      spins_per_code: model.spins_per_code,
      active_games: activeGames,
      inGrace: inGrace || false,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
