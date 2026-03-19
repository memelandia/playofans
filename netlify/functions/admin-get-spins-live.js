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

    // Últimos 10 giros verificados
    const { data: spins, error: spinsError } = await supabase
      .from('spins')
      .select('id, prize, wheel_index, created_at, code_id')
      .eq('model_id', model.id)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .limit(10);

    if (spinsError) return json(500, { error: 'Error al obtener los giros' });

    // Obtener nombres de fans para cada spin
    const codeIds = [...new Set((spins || []).map(s => s.code_id))];
    let codeMap = {};
    if (codeIds.length > 0) {
      const { data: codes } = await supabase
        .from('codes')
        .select('id, code, fan_name')
        .in('id', codeIds);
      (codes || []).forEach(c => { codeMap[c.id] = c; });
    }

    const result = (spins || []).map(s => ({
      id: s.id,
      prize: s.prize,
      fan_name: codeMap[s.code_id]?.fan_name || 'Desconocido',
      code: codeMap[s.code_id]?.code || '',
      created_at: s.created_at,
    }));

    return json(200, { spins: result });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
