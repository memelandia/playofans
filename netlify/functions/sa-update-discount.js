const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { discount_id, active, discount_pct, max_uses, valid_until } = body;

    if (!discount_id) return json(400, { error: 'discount_id es obligatorio' });

    const { data: existing, error: fetchError } = await supabase
      .from('discount_codes')
      .select('id')
      .eq('id', discount_id)
      .single();

    if (fetchError || !existing) return json(404, { error: 'Descuento no encontrado' });

    const updateData = {};
    if (typeof active === 'boolean') updateData.active = active;
    if (discount_pct !== undefined) {
      const pct = parseFloat(discount_pct);
      if (!pct || pct <= 0 || pct > 100) return json(400, { error: 'El porcentaje debe ser entre 1 y 100' });
      updateData.discount_pct = pct;
    }
    if (max_uses !== undefined) updateData.max_uses = max_uses ? parseInt(max_uses) : null;
    if (valid_until !== undefined) updateData.valid_until = valid_until || null;

    if (Object.keys(updateData).length === 0) return json(400, { error: 'No hay datos para actualizar' });

    const { data, error } = await supabase
      .from('discount_codes')
      .update(updateData)
      .eq('id', discount_id)
      .select()
      .single();

    if (error) return json(500, { error: 'Error al actualizar descuento' });

    return json(200, { discount: data });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
