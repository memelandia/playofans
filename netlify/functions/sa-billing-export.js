const { supabase, json, handleOptions, authenticateSuperAdmin, CORS_HEADERS } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  const auth = await authenticateSuperAdmin(event);
  if (auth.error) return auth.error;

  const params = event.queryStringParameters || {};
  const month = params.month;

  let bQuery = supabase
    .from('billing_records')
    .select('*, model:model_id(slug, display_name)')
    .order('created_at', { ascending: false });
  if (month) bQuery = bQuery.eq('period', month);
  const { data: billingData } = await bQuery;

  let cQuery = supabase
    .from('affiliate_commissions')
    .select('*, affiliate:affiliate_model_id(slug, display_name), referred:referred_model_id(slug, display_name)')
    .order('created_at', { ascending: false });
  if (month) cQuery = cQuery.eq('period', month);
  const { data: commData } = await cQuery;

  const escCsv = (v) => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  let csv = 'Tipo,Período,Modelo,Plan,Ciclo,Precio Base,Desc. Referidos %,Desc. Referidos €,Crédito Aplicado,Total,Estado,Método Pago,Referencia,Fecha Pago\n';
  (billingData || []).forEach(r => {
    csv += [
      'Cobro', r.period, r.model?.display_name, r.plan, r.billing_cycle,
      r.base_price, r.referral_discount_pct + '%', r.referral_discount_amount,
      r.credit_applied || 0,
      r.total_amount, r.status, r.payment_method, r.payment_reference, r.paid_at
    ].map(escCsv).join(',') + '\n';
  });

  csv += '\nTipo,Período,Afiliado,Modelo Referida,Mes Nº,Monto Base,Comisión,Estado,Fecha Pago\n';
  (commData || []).forEach(c => {
    csv += [
      'Comisión', c.period, c.affiliate?.display_name, c.referred?.display_name,
      c.month_number, c.base_amount, c.commission_amount, c.status, c.paid_at
    ].map(escCsv).join(',') + '\n';
  });

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="playofans-facturacion${month ? '-' + month : ''}.csv"`,
    },
    body: csv,
  };
};
