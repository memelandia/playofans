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
      .select('id')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    const { data: codes, error: codesError } = await supabase
      .from('codes')
      .select('id, code, fan_name, game_type, prizes, expires_at, total_spins, remaining_spins, used, deleted, deleted_at, created_at')
      .eq('model_id', model.id)
      .order('created_at', { ascending: false });

    if (codesError) return json(500, { error: 'Error al obtener los códigos' });

    return json(200, { codes: codes || [] });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
