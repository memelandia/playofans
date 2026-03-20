const { supabase, json, handleOptions, authenticateAdmin, RESERVED_SLUGS } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const agencySlug = event.queryStringParameters?.slug;
    if (!agencySlug) return json(400, { error: 'Falta el slug de agencia' });

    // Verify agency ownership + plan
    const { data: agency, error: agencyErr } = await supabase
      .from('models')
      .select('id, plan')
      .eq('slug', agencySlug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (agencyErr || !agency) return json(403, { error: 'No tienes acceso a esta agencia' });
    if (agency.plan !== 'agency') return json(403, { error: 'Requiere plan Agency' });

    // Check member limit
    const { count } = await supabase
      .from('agency_members')
      .select('id', { count: 'exact', head: true })
      .eq('agency_model_id', agency.id);

    if (count >= 8) return json(400, { error: 'Máximo 8 modelos por agencia' });

    // Parse body
    const body = JSON.parse(event.body || '{}');
    const { email, display_name, slug } = body;

    if (!email?.trim() || !display_name?.trim() || !slug?.trim()) {
      return json(400, { error: 'Email, nombre y slug son obligatorios' });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanSlug.length < 3 || cleanSlug.length > 30) {
      return json(400, { error: 'Slug: 3-30 caracteres (letras, números, - y _)' });
    }

    if (RESERVED_SLUGS.includes(cleanSlug)) {
      return json(400, { error: 'Este slug está reservado' });
    }

    // Check slug availability
    const { data: existing } = await supabase
      .from('models')
      .select('id')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (existing) return json(409, { error: 'Este slug ya está en uso' });

    // Generate temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 12; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message?.includes('already')) {
        return json(409, { error: 'Ya existe un usuario con este email' });
      }
      return json(500, { error: 'Error al crear usuario: ' + authError.message });
    }

    // Calculate dates
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    const prefix = cleanSlug.replace(/[^a-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    // Create model (plan solo — agency covers the cost)
    const { data: model, error: modelError } = await supabase
      .from('models')
      .insert({
        slug: cleanSlug,
        display_name: display_name.trim(),
        email: email.trim(),
        plan: 'solo',
        code_prefix: prefix,
        referral_code: 'REF-' + cleanSlug.toUpperCase(),
        subscription_expires_at: expiresAt.toISOString(),
        next_billing_date: nextBillingDate.toISOString().slice(0, 10),
        supabase_user_id: authData.user.id,
        must_change_password: true,
        active: true,
      })
      .select()
      .single();

    if (modelError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return json(500, { error: 'Error al crear modelo: ' + modelError.message });
    }

    // Auto-link as agency member
    await supabase
      .from('agency_members')
      .insert({ agency_model_id: agency.id, member_model_id: model.id });

    // Send welcome email (non-blocking)
    try {
      const { sendWelcomeEmail } = require('./send-welcome-email');
      await sendWelcomeEmail({
        email: email.trim(),
        display_name: display_name.trim(),
        slug: cleanSlug,
        password: tempPassword,
        admin_url: `https://playofans.com/${cleanSlug}/admin`,
      });
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr);
    }

    return json(201, {
      model: { id: model.id, slug: cleanSlug, display_name: display_name.trim() },
      credentials: { email: email.trim(), password: tempPassword },
    });
  } catch {
    return json(500, { error: 'Error interno del servidor' });
  }
};
