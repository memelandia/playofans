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

    // Confirmar spin y decrementar tiradas atómicamente via RPC
    const { data: result, error: rpcError } = await supabase
      .rpc('confirm_spin_atomic', { p_spin_id: spin.id, p_code_id: spin.code_id });

    if (rpcError) {
      return json(500, { error: 'Error al confirmar la tirada' });
    }

    return json(200, {
      success: true,
      remaining_spins: result.remaining_spins,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
