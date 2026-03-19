const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { slug, codeId } = body;

    if (!slug || !codeId) return json(400, { error: 'Faltan datos obligatorios (slug y codeId)' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    // Verificar que el código pertenece al modelo
    const { data: code, error: codeError } = await supabase
      .from('codes')
      .select('id')
      .eq('id', codeId)
      .eq('model_id', model.id)
      .single();

    if (codeError || !code) return json(404, { error: 'Código no encontrado' });

    const { error: updateError } = await supabase
      .from('codes')
      .update({ deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', codeId)
      .eq('model_id', model.id);

    if (updateError) return json(500, { error: 'Error al eliminar el código' });

    return json(200, { success: true });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
