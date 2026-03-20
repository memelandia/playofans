const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const slug = event.queryStringParameters?.slug;
    if (!slug) return json(400, { error: 'Falta el slug' });

    // Verify model ownership + agency plan
    const { data: agency, error: agencyErr } = await supabase
      .from('models')
      .select('id, plan')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (agencyErr || !agency) return json(403, { error: 'No tienes acceso a este modelo' });
    if (agency.plan !== 'agency') return json(403, { error: 'Esta función requiere plan Agency' });

    // GET — list members + combined analytics
    if (event.httpMethod === 'GET') {
      const { data: rows, error: memErr } = await supabase
        .from('agency_members')
        .select('id, member_model_id, created_at, models!agency_members_member_model_id_fkey(slug, display_name, active, plan)')
        .eq('agency_model_id', agency.id)
        .order('created_at', { ascending: true });

      if (memErr) return json(500, { error: 'Error al obtener miembros' });

      const members = (rows || []).map(r => ({
        id: r.member_model_id,
        membership_id: r.id,
        slug: r.models?.slug || '—',
        display_name: r.models?.display_name || '—',
        active: r.models?.active ?? false,
        plan: r.models?.plan || '—',
        added_at: r.created_at,
      }));

      const memberIds = members.map(m => m.id);

      // Combined analytics in parallel
      let combinedSpins = 0;
      let combinedCodesActive = 0;
      const memberStats = {};

      if (memberIds.length > 0) {
        const [spinsRes, codesRes] = await Promise.all([
          supabase
            .from('spins')
            .select('model_id', { count: 'exact' })
            .in('model_id', memberIds)
            .eq('verified', true),
          supabase
            .from('codes')
            .select('model_id')
            .in('model_id', memberIds)
            .eq('deleted', false)
            .eq('used', false)
            .gt('remaining_spins', 0),
        ]);

        combinedSpins = spinsRes.count || 0;
        combinedCodesActive = (codesRes.data || []).length;

        // Per-member stats
        const spinsPerMember = {};
        const codesPerMember = {};
        // We need per-member breakdown — use RPC or manual count
        // Count spins per member
        if (memberIds.length > 0) {
          const { data: spinsData } = await supabase.rpc('count_spins_by_models', { model_ids: memberIds });
          (spinsData || []).forEach(r => { spinsPerMember[r.model_id] = Number(r.cnt); });
        }
        // Count codes per member
        (codesRes.data || []).forEach(r => {
          codesPerMember[r.model_id] = (codesPerMember[r.model_id] || 0) + 1;
        });

        members.forEach(m => {
          m.spins = spinsPerMember[m.id] || 0;
          m.codes_active = codesPerMember[m.id] || 0;
        });
      }

      return json(200, {
        members,
        totals: {
          members: members.length,
          spins: combinedSpins,
          codes_active: combinedCodesActive,
        },
      });
    }

    // POST — add a member
    if (event.httpMethod === 'POST') {
      const { member_slug } = JSON.parse(event.body || '{}');
      if (!member_slug) return json(400, { error: 'member_slug requerido' });

      const { data: member } = await supabase
        .from('models')
        .select('id')
        .eq('slug', member_slug)
        .single();

      if (!member) return json(404, { error: 'Modelo "' + member_slug + '" no encontrado' });
      if (member.id === agency.id) return json(400, { error: 'No puedes añadirte a ti mismo' });

      // Check limit
      const { count } = await supabase
        .from('agency_members')
        .select('id', { count: 'exact', head: true })
        .eq('agency_model_id', agency.id);

      if (count >= 8) return json(400, { error: 'Máximo 8 miembros por agencia' });

      const { error } = await supabase
        .from('agency_members')
        .insert({ agency_model_id: agency.id, member_model_id: member.id });

      if (error) {
        if (error.code === '23505') return json(400, { error: 'Este modelo ya es miembro' });
        return json(500, { error: 'Error al añadir miembro' });
      }

      return json(200, { success: true });
    }

    // DELETE — remove a member
    if (event.httpMethod === 'DELETE') {
      const { member_id } = JSON.parse(event.body || '{}');
      if (!member_id) return json(400, { error: 'member_id requerido' });

      const { error } = await supabase
        .from('agency_members')
        .delete()
        .eq('agency_model_id', agency.id)
        .eq('member_model_id', member_id);

      if (error) return json(500, { error: 'Error al eliminar miembro' });

      return json(200, { success: true });
    }

    return json(405, { error: 'Método no permitido' });
  } catch {
    return json(500, { error: 'Error interno del servidor' });
  }
};
