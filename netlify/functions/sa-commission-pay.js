const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const auth = await authenticateSuperAdmin(event);
  if (auth.error) return auth.error;

  const { commission_id } = JSON.parse(event.body || '{}');
  if (!commission_id) return json(400, { error: 'commission_id requerido' });

  const { error } = await supabase
    .from('affiliate_commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', commission_id);

  if (error) return json(500, { error: 'Error al marcar comisión como pagada' });

  return json(200, { success: true });
};
