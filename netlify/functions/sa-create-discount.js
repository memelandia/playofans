const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { code, discount_pct, max_uses, valid_until } = body;

    if (!code?.trim()) return json(400, { error: 'El código es obligatorio' });

    const pct = parseFloat(discount_pct);
    if (!pct || pct <= 0 || pct > 100) return json(400, { error: 'El porcentaje debe ser entre 1 y 100' });

    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode.length < 3 || cleanCode.length > 20) {
      return json(400, { error: 'El código debe tener entre 3 y 20 caracteres' });
    }

    // Check uniqueness
    const { data: existing } = await supabase
      .from('discount_codes')
      .select('id')
      .eq('code', cleanCode)
      .maybeSingle();

    if (existing) return json(409, { error: 'Ya existe un descuento con este código' });

    const insertData = {
      code: cleanCode,
      discount_pct: pct,
      active: true,
    };
    if (max_uses && parseInt(max_uses) > 0) insertData.max_uses = parseInt(max_uses);
    if (valid_until) insertData.valid_until = valid_until;

    const { data, error } = await supabase
      .from('discount_codes')
      .insert(insertData)
      .select()
      .single();

    if (error) return json(500, { error: 'Error al crear descuento' });

    return json(201, { discount: data });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
