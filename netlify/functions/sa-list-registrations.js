const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const status = event.queryStringParameters?.status || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected'];
    const filterStatus = validStatuses.includes(status) ? status : 'pending';

    const { data, error } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('status', filterStatus)
      .order('created_at', { ascending: false });

    if (error) return json(500, { error: 'Error al obtener solicitudes' });

    return json(200, { registrations: data || [] });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
