const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { request_id, action, notes } = body;

    if (!request_id || !['approve', 'reject'].includes(action)) {
      return json(400, { error: 'request_id y action (approve/reject) son obligatorios' });
    }

    // Get request
    const { data: req, error: fetchError } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('id', request_id)
      .single();

    if (fetchError || !req) return json(404, { error: 'Solicitud no encontrada' });
    if (req.status !== 'pending') return json(400, { error: 'Esta solicitud ya fue procesada' });

    if (action === 'reject') {
      await supabase
        .from('registration_requests')
        .update({ status: 'rejected', notes: notes || null, reviewed_at: new Date().toISOString() })
        .eq('id', request_id);

      return json(200, { message: 'Solicitud rechazada' });
    }

    // Approve: create auth user + model
    const cleanSlug = req.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Check slug availability
    const { data: existing } = await supabase
      .from('models')
      .select('id')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (existing) return json(409, { error: 'El slug solicitado ya está en uso. Rechaza y pide otro slug.' });

    const validPlan = ['solo', 'pro', 'agency'].includes(req.plan) ? req.plan : 'solo';

    // Generate temp password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 12; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: req.email.trim(),
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return json(500, { error: 'Error al crear usuario: ' + authError.message });
    }

    // Subscription: 1 month
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const prefix = cleanSlug.replace(/[^a-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');

    // Next billing date: 1 month from now
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    const { data: model, error: modelError } = await supabase
      .from('models')
      .insert({
        slug: cleanSlug,
        display_name: req.display_name || req.artistic_name || cleanSlug,
        email: req.email.trim(),
        plan: validPlan,
        code_prefix: prefix,
        referral_code: 'REF-' + cleanSlug.toUpperCase(),
        subscription_expires_at: expiresAt.toISOString(),
        next_billing_date: nextBillingDate.toISOString().slice(0, 10),
        supabase_user_id: authData.user.id,
        referred_by: req.referral_code?.toUpperCase() || null,
        must_change_password: true,
        active: true,
      })
      .select()
      .single();

    if (modelError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return json(500, { error: 'Error al crear modelo: ' + modelError.message });
    }

    // Mark request as approved
    await supabase
      .from('registration_requests')
      .update({ status: 'approved', notes: notes || null, reviewed_at: new Date().toISOString() })
      .eq('id', request_id);

    // Enviar welcome email (no bloquea la respuesta si falla)
    try {
      const { sendWelcomeEmail } = require('./send-welcome-email');
      await sendWelcomeEmail({
        email: req.email.trim(),
        display_name: req.display_name || req.artistic_name || cleanSlug,
        slug: cleanSlug,
        password: tempPassword,
        admin_url: `https://playofans.com/${cleanSlug}/admin`,
      });
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr);
    }

    return json(200, {
      message: 'Solicitud aprobada y cuenta creada',
      model,
      credentials: {
        email: req.email.trim(),
        password: tempPassword,
        admin_url: `https://playofans.com/${cleanSlug}/admin`,
      },
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
