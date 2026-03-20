const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    // GET — list members of an agency
    if (event.httpMethod === 'GET') {
      const agencyId = event.queryStringParameters?.agency_id;
      if (!agencyId) return json(400, { error: 'agency_id requerido' });

      const { data, error } = await supabase
        .from('agency_members')
        .select('id, member_model_id, created_at, models!agency_members_member_model_id_fkey(slug, display_name)')
        .eq('agency_model_id', agencyId)
        .order('created_at', { ascending: true });

      if (error) return json(500, { error: 'Error al obtener miembros' });

      const members = (data || []).map(r => ({
        id: r.member_model_id,
        membership_id: r.id,
        slug: r.models?.slug || '—',
        display_name: r.models?.display_name || '—',
        added_at: r.created_at,
      }));

      return json(200, { members });
    }

    // POST — add a member
    if (event.httpMethod === 'POST') {
      const { agency_id, member_slug } = JSON.parse(event.body || '{}');
      if (!agency_id || !member_slug) return json(400, { error: 'agency_id y member_slug requeridos' });

      // Verify agency exists and is agency plan
      const { data: agency } = await supabase.from('models').select('id, plan').eq('id', agency_id).single();
      if (!agency || agency.plan !== 'agency') return json(400, { error: 'El modelo no tiene plan Agency' });

      // Find member by slug
      const { data: member } = await supabase.from('models').select('id').eq('slug', member_slug).single();
      if (!member) return json(404, { error: 'Modelo con slug "' + member_slug + '" no encontrado' });
      if (member.id === agency_id) return json(400, { error: 'No puedes añadirte a ti mismo' });

      // Check limit (max 8)
      const { count } = await supabase.from('agency_members').select('id', { count: 'exact', head: true }).eq('agency_model_id', agency_id);
      if (count >= 8) return json(400, { error: 'Máximo 8 miembros por agencia' });

      const { error } = await supabase.from('agency_members').insert({ agency_model_id: agency_id, member_model_id: member.id });
      if (error) {
        if (error.code === '23505') return json(400, { error: 'Este modelo ya es miembro de la agencia' });
        return json(500, { error: 'Error al añadir miembro' });
      }

      return json(200, { success: true });
    }

    // DELETE — remove a member
    if (event.httpMethod === 'DELETE') {
      const { agency_id, member_id } = JSON.parse(event.body || '{}');
      if (!agency_id || !member_id) return json(400, { error: 'agency_id y member_id requeridos' });

      const { error } = await supabase.from('agency_members').delete().eq('agency_model_id', agency_id).eq('member_model_id', member_id);
      if (error) return json(500, { error: 'Error al eliminar miembro' });

      return json(200, { success: true });
    }

    return json(405, { error: 'Método no permitido' });
  } catch {
    return json(500, { error: 'Error interno del servidor' });
  }
};
