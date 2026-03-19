const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const slug = event.queryStringParameters?.slug;
    if (!slug) return json(400, { error: 'Falta el slug' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, plan, codes_created_this_month')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    // Calcular rangos de fechas
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Contar giros por período (en paralelo)
    const [spinsToday, spinsWeek, spinsMonth, spinsTotal] = await Promise.all([
      supabase.from('spins').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('verified', true).gte('created_at', todayStart),
      supabase.from('spins').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('verified', true).gte('created_at', weekStart),
      supabase.from('spins').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('verified', true).gte('created_at', monthStart),
      supabase.from('spins').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('verified', true),
    ]);

    // Contar códigos por estado (en paralelo)
    const [codesActive, codesUsed, codesDeleted, codesExpired] = await Promise.all([
      supabase.from('codes').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('deleted', false).eq('used', false).gt('remaining_spins', 0),
      supabase.from('codes').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('deleted', false).eq('used', true),
      supabase.from('codes').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('deleted', true),
      supabase.from('codes').select('id', { count: 'exact', head: true })
        .eq('model_id', model.id).eq('deleted', false).lt('expires_at', now.toISOString()).not('expires_at', 'is', null),
    ]);

    // Top 5 premios más ganados
    const { data: allPrizes } = await supabase
      .from('spins')
      .select('prize')
      .eq('model_id', model.id)
      .eq('verified', true);

    const prizeCount = {};
    (allPrizes || []).forEach(s => {
      prizeCount[s.prize] = (prizeCount[s.prize] || 0) + 1;
    });
    const topPrizes = Object.entries(prizeCount)
      .map(([prize, count]) => ({ prize, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return json(200, {
      spins: {
        today: spinsToday.count || 0,
        week: spinsWeek.count || 0,
        month: spinsMonth.count || 0,
        total: spinsTotal.count || 0,
      },
      codes: {
        active: codesActive.count || 0,
        used: codesUsed.count || 0,
        expired: codesExpired.count || 0,
        deleted: codesDeleted.count || 0,
        created_this_month: model.codes_created_this_month,
        limit: model.plan === 'solo' ? 100 : null,
      },
      top_prizes: topPrizes,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
