const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { discount_id } = body;

    if (!discount_id) return json(400, { error: 'discount_id es obligatorio' });

    const { error } = await supabase
      .from('discount_codes')
      .delete()
      .eq('id', discount_id);

    if (error) return json(500, { error: 'Error al eliminar descuento' });

    return json(200, { message: 'Descuento eliminado' });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
