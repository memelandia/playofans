const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  const auth = await authenticateSuperAdmin(event);
  if (auth.error) return auth.error;

  const params = event.queryStringParameters || {};
  const status = params.status;

  let query = supabase
    .from('affiliate_commissions')
    .select('*, affiliate:affiliate_model_id(slug, display_name), referred:referred_model_id(slug, display_name)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return json(500, { error: 'Error al obtener comisiones' });

  const all = data || [];
  const now = new Date().toISOString().slice(0, 7);
  const totals = {
    pending: all.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_amount), 0),
    credited: all.filter(c => c.status === 'credited').reduce((s, c) => s + Number(c.commission_amount), 0),
    paid_this_month: all.filter(c => c.status === 'paid' && c.paid_at && c.paid_at.slice(0, 7) === now).reduce((s, c) => s + Number(c.commission_amount), 0),
  };

  return json(200, { commissions: all, totals });
};
