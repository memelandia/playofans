const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const auth = await authenticateSuperAdmin(event);
  if (auth.error) return auth.error;

  const { data, error } = await supabase.rpc('generate_monthly_billing');

  if (error) return json(500, { error: error.message || 'Error al generar cobros' });

  return json(200, data || { created: 0 });
};
