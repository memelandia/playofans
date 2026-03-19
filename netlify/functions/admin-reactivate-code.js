const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { slug, codeId, total_spins } = body;

    if (!slug || !codeId) return json(400, { error: 'Faltan datos obligatorios (slug y codeId)' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, spins_per_code')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    // Verificar que el código pertenece al modelo
    const { data: existingCode, error: codeError } = await supabase
      .from('codes')
      .select('id')
      .eq('id', codeId)
      .eq('model_id', model.id)
      .single();

    if (codeError || !existingCode) return json(404, { error: 'Código no encontrado' });

    const spins = Math.min(10, Math.max(1, parseInt(total_spins) || model.spins_per_code));

    const { data: code, error: updateError } = await supabase
      .from('codes')
      .update({
        remaining_spins: spins,
        total_spins: spins,
        used: false,
        deleted: false,
        deleted_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', codeId)
      .eq('model_id', model.id)
      .select()
      .single();

    if (updateError) return json(500, { error: 'Error al reactivar el código' });

    return json(200, { success: true, code });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
