const { supabase, json, handleOptions, RESERVED_SLUGS } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      email, display_name, slug, country, plan,
      monthly_revenue, has_agency, active_fans,
      acquisition_channel, telegram_or_instagram,
      referral_code, discount_code, website,
    } = body;

    // Honeypot: if filled, it's a bot — reject silently
    if (website) return json(200, { success: true });

    // Validaciones obligatorias
    if (!email?.trim()) return json(400, { error: 'El email es obligatorio' });
    if (!display_name?.trim()) return json(400, { error: 'El nombre artístico es obligatorio' });
    if (!slug?.trim()) return json(400, { error: 'El slug es obligatorio' });
    if (!country?.trim()) return json(400, { error: 'El país es obligatorio' });

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return json(400, { error: 'El formato del email no es válido' });
    }

    // Validar y limpiar slug
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanSlug.length < 3 || cleanSlug.length > 30) {
      return json(400, { error: 'El slug debe tener entre 3 y 30 caracteres' });
    }

    if (RESERVED_SLUGS.includes(cleanSlug)) {
      return json(400, { error: 'Este slug está reservado' });
    }

    // Verificar slug no usado en models
    const { data: existingModel } = await supabase
      .from('models')
      .select('id')
      .eq('slug', cleanSlug)
      .maybeSingle();
    if (existingModel) return json(409, { error: 'Este slug ya está en uso' });

    // Verificar slug no usado en solicitudes pendientes
    const { data: existingReq } = await supabase
      .from('registration_requests')
      .select('id')
      .eq('slug', cleanSlug)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingReq) return json(409, { error: 'Ya hay una solicitud pendiente con este slug' });

    // Verificar email no duplicado en pendientes
    const { data: existingEmail } = await supabase
      .from('registration_requests')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();
    if (existingEmail) return json(409, { error: 'Ya tienes una solicitud pendiente' });

    const validPlan = ['solo', 'pro', 'agency'].includes(plan) ? plan : 'solo';

    // Insertar solicitud
    const { error: insertError } = await supabase
      .from('registration_requests')
      .insert({
        email: email.trim().toLowerCase(),
        display_name: display_name.trim(),
        slug: cleanSlug,
        country: country.trim(),
        plan: validPlan,
        monthly_revenue: monthly_revenue || null,
        has_agency: has_agency || null,
        active_fans: active_fans || null,
        acquisition_channel: acquisition_channel || null,
        telegram_or_instagram: telegram_or_instagram?.trim() || null,
        referral_code: referral_code?.trim()?.toUpperCase() || null,
        discount_code: discount_code?.trim()?.toUpperCase() || null,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return json(500, { error: 'Error al guardar la solicitud' });
    }

    // Enviar notificación por email a Franco via Resend (si está configurado)
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'PlayOFans <noreply@playofans.com>',
            to: 'hola@playofans.com',
            subject: `Nueva solicitud de registro: ${display_name.trim()} (${cleanSlug})`,
            html: `
              <h2>Nueva solicitud de registro</h2>
              <p><strong>Nombre:</strong> ${display_name.trim()}</p>
              <p><strong>Email:</strong> ${email.trim()}</p>
              <p><strong>Slug:</strong> ${cleanSlug}</p>
              <p><strong>País:</strong> ${country.trim()}</p>
              <p><strong>Plan:</strong> ${validPlan}</p>
              <p><strong>Ingresos:</strong> ${monthly_revenue || 'No indicado'}</p>
              <p><strong>Agencia:</strong> ${has_agency || 'No indicado'}</p>
              <p><strong>Fans activos:</strong> ${active_fans || 'No indicado'}</p>
              <p><strong>Canal:</strong> ${acquisition_channel || 'No indicado'}</p>
              <p><strong>Telegram/IG:</strong> ${telegram_or_instagram || 'No indicado'}</p>
              <p><strong>Referral:</strong> ${referral_code || 'Ninguno'}</p>
              <p><strong>Descuento:</strong> ${discount_code || 'Ninguno'}</p>
              <hr>
              <p><a href="https://playofans.com/superadmin">Revisar en superadmin</a></p>
            `,
          }),
        });
      } catch (emailErr) {
        console.error('Email notification error:', emailErr);
        // No fallar la solicitud si el email falla
      }
    }

    return json(200, { success: true, message: 'Solicitud enviada correctamente' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Error interno del servidor' });
  }
};
