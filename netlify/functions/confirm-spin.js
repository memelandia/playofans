const { supabase, json, handleOptions } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const { token } = JSON.parse(event.body || '{}');
    if (!token) return json(400, { error: 'Falta el token' });

    // --- DEMO MODE ---
    if (typeof token === 'string' && token.startsWith('demo-')) {
      return json(200, { success: true, remaining_spins: 999, demo: true });
    }

    // Buscar spin por token
    const { data: spin, error: spinError } = await supabase
      .from('spins')
      .select('id, code_id, verified')
      .eq('token', token)
      .single();

    if (spinError || !spin) {
      return json(404, { error: 'Token no encontrado' });
    }

    if (spin.verified) {
      // Ya fue confirmado — devolver estado actual sin error
      const { data: code } = await supabase
        .from('codes')
        .select('remaining_spins')
        .eq('id', spin.code_id)
        .single();

      return json(200, {
        success: true,
        remaining_spins: code?.remaining_spins ?? 0,
        already_verified: true,
      });
    }

    // Marcar spin como verificado
    const { error: updateSpinError } = await supabase
      .from('spins')
      .update({ verified: true })
      .eq('id', spin.id);

    if (updateSpinError) {
      return json(500, { error: 'Error al confirmar la tirada' });
    }

    // Decrementar remaining_spins y marcar used si llega a 0
    const { data: code, error: codeError } = await supabase
      .from('codes')
      .select('remaining_spins')
      .eq('id', spin.code_id)
      .single();

    if (codeError || !code) {
      return json(500, { error: 'Error al actualizar el código' });
    }

    const newRemaining = Math.max(0, code.remaining_spins - 1);
    const updateData = { remaining_spins: newRemaining };
    if (newRemaining === 0) updateData.used = true;

    const { error: updateCodeError } = await supabase
      .from('codes')
      .update(updateData)
      .eq('id', spin.code_id);

    if (updateCodeError) {
      return json(500, { error: 'Error al actualizar tiradas restantes' });
    }

    return json(200, {
      success: true,
      remaining_spins: newRemaining,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
