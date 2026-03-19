const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const auth = await authenticateSuperAdmin(event);
  if (auth.error) return auth.error;

  const { billing_id, payment_method, payment_reference } = JSON.parse(event.body || '{}');
  if (!billing_id) return json(400, { error: 'billing_id requerido' });

  const { data, error } = await supabase.rpc('mark_billing_paid', {
    p_billing_id: billing_id,
    p_payment_method: payment_method || null,
    p_payment_reference: payment_reference || null,
  });

  if (error) return json(500, { error: error.message || 'Error al procesar pago' });

  return json(200, data || { success: true });
};
