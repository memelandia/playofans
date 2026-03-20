const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const { data: models, error } = await supabase
      .from('models')
      .select('id, slug, display_name, email, plan, active, theme, subscription_expires_at, grace_period_until, codes_created_this_month, admin_notes, created_at')
      .order('created_at', { ascending: false });

    if (error) return json(500, { error: 'Error al obtener modelos' });

    const now = new Date();

    // Single grouped query for all spin counts (avoids N+1)
    const modelIds = (models || []).map(m => m.id);
    const { data: spinCounts } = modelIds.length
      ? await supabase.rpc('count_spins_by_models', { model_ids: modelIds })
      : { data: [] };
    const spinMap = Object.fromEntries((spinCounts || []).map(r => [r.model_id, r.cnt]));

    const enriched = (models || []).map(m => {
      let status = 'suspended';
      if (m.active) {
        if (!m.subscription_expires_at || new Date(m.subscription_expires_at) > now) {
          status = 'active';
        } else if (m.grace_period_until && new Date(m.grace_period_until) > now) {
          status = 'grace';
        } else {
          status = 'expired';
        }
      }
      return { ...m, status, total_spins: spinMap[m.id] || 0 };
    });

    return json(200, { models: enriched });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
