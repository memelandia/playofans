const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

  const params = event.queryStringParameters || {};
  const month = params.month || new Date().toISOString().slice(0, 7);
  const status = params.status;

  let query = supabase
    .from('billing_records')
    .select('*, model:model_id(slug, display_name, email)')
    .eq('period', month)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return json(500, { error: 'Error al obtener registros' });

  const all = data || [];
  const totals = {
    total: all.reduce((s, r) => s + Number(r.total_amount), 0),
    paid: all.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.total_amount), 0),
    pending: all.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.total_amount), 0),
  };

  return json(200, { records: all, totals });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
