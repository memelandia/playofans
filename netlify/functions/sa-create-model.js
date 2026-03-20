const { supabase, json, handleOptions, authenticateSuperAdmin, RESERVED_SLUGS } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { email, display_name, slug, plan, subscription_months } = body;

    if (!email?.trim() || !display_name?.trim() || !slug?.trim()) {
      return json(400, { error: 'Email, nombre y slug son obligatorios' });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanSlug.length < 3 || cleanSlug.length > 30) {
      return json(400, { error: 'El slug debe tener entre 3 y 30 caracteres (letras, números, - y _)' });
    }

    // Check slug is not reserved
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

    const validPlan = ['solo', 'pro', 'agency'].includes(plan) ? plan : 'solo';
    const months = Math.max(1, Math.min(12, parseInt(subscription_months) || 1));

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
      return json(500, { error: 'Error al crear usuario de autenticación: ' + authError.message });
    }

    // Calculate subscription dates
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Generate code_prefix (first 4 consonants/letters from slug, uppercase)
    const prefix = cleanSlug.replace(/[^a-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');

    // Calculate next billing date (1 month from now for monthly billing)
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    // Create model row
    const { data: model, error: modelError } = await supabase
      .from('models')
      .insert({
        slug: cleanSlug,
        display_name: display_name.trim(),
        email: email.trim(),
        plan: validPlan,
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
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return json(500, { error: 'Error al crear el modelo: ' + modelError.message });
    }

    // Enviar welcome email (no bloquea la respuesta si falla)
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
      model,
      credentials: {
        email: email.trim(),
        password: tempPassword,
        admin_url: `https://playofans.com/${cleanSlug}/admin`,
      },
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
