const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return json(500, { error: 'Error al obtener descuentos' });

    return json(200, { discounts: data || [] });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
