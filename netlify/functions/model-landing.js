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
      .select('id, slug, display_name, plan, theme, active, grace_period_until')
      .eq('slug', slug)
      .single();

    if (error || !model) return json(404, { error: 'Modelo no encontrado' });

    // Verificar cuenta activa o en grace
    const now = new Date();
    const inGrace = !model.active && model.grace_period_until && new Date(model.grace_period_until) > now;
    if (!model.active && !inGrace) {
      return json(403, { error: 'Esta página no está disponible 🎰' });
    }

    // Obtener juegos activos según plan
    const { data: games } = await supabase
      .from('game_catalog')
      .select('id, name, description, min_plan')
      .eq('enabled', true);

    const activeGames = (games || []).filter(g => planCanAccess(model.plan, g.min_plan));

    // Si solo hay 1 juego activo: redirect directo
    if (activeGames.length === 1) {
      return json(200, {
        redirect_to: `/${model.slug}/${activeGames[0].id}`,
        display_name: model.display_name,
        theme: model.theme,
      });
    }

    // Múltiples juegos: devolver lista
    return json(200, {
      redirect_to: null,
      display_name: model.display_name,
      theme: model.theme,
      games: activeGames,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
