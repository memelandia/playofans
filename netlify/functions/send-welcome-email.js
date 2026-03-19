const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { email, display_name, slug, password, admin_url } = body;

    if (!email?.trim() || !display_name?.trim() || !slug?.trim() || !password || !admin_url) {
      return json(400, { error: 'Faltan datos obligatorios: email, display_name, slug, password, admin_url' });
    }

    if (!process.env.RESEND_API_KEY) {
      return json(500, { error: 'RESEND_API_KEY no configurada' });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PlayOFans <noreply@playofans.com>',
        to: email.trim(),
        subject: `¡Bienvenida a PlayOFans, ${display_name.trim()}! 🎰`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0612;color:#f0e6ff;padding:40px 30px;border-radius:16px;">
            <div style="text-align:center;margin-bottom:30px;">
              <h1 style="font-size:28px;margin:0;">🎰 PlayOFans</h1>
              <p style="color:#a89cc8;font-size:14px;margin-top:8px;">Tu plataforma de juegos interactivos</p>
            </div>
            <h2 style="color:#ff0066;font-size:22px;">¡Hola ${display_name.trim()}! 👋</h2>
            <p style="font-size:15px;line-height:1.7;color:#f0e6ff;">
              Tu cuenta de PlayOFans ya está <strong style="color:#10ac84;">activa</strong>. 
              Ya puedes acceder a tu panel de administración y configurar tu primera ruleta de premios.
            </p>
            <div style="background:#120e1f;border:1px solid rgba(179,0,255,0.2);border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 16px 0;font-size:16px;color:#b300ff;">Tus credenciales de acceso</h3>
              <p style="margin:6px 0;font-size:14px;"><strong>Panel admin:</strong> <a href="${admin_url}" style="color:#ff0066;">${admin_url}</a></p>
              <p style="margin:6px 0;font-size:14px;"><strong>Email:</strong> ${email.trim()}</p>
              <p style="margin:6px 0;font-size:14px;"><strong>Contraseña temporal:</strong> <code style="background:#1a1230;padding:3px 8px;border-radius:4px;color:#ff0066;font-size:15px;">${password}</code></p>
              <p style="margin:12px 0 0 0;font-size:12px;color:#a89cc8;">⚠️ Te recomendamos cambiar tu contraseña la primera vez que inicies sesión.</p>
            </div>
            <div style="background:#120e1f;border:1px solid rgba(179,0,255,0.2);border-radius:12px;padding:24px;margin:24px 0;">
              <h3 style="margin:0 0 14px 0;font-size:16px;color:#b300ff;">Primeros pasos</h3>
              <ol style="margin:0;padding-left:20px;font-size:14px;line-height:2;color:#a89cc8;">
                <li>Accede a tu panel: <a href="${admin_url}" style="color:#ff0066;">${admin_url}</a></li>
                <li>Configura tus premios en la sección "Configuración"</li>
                <li>Elige tu tema visual favorito</li>
                <li>Crea tu primer código para un fan</li>
                <li>¡Envía el enlace y empieza a sorprender!</li>
              </ol>
            </div>
            <p style="font-size:14px;color:#a89cc8;line-height:1.6;">
              Tu URL personalizada es: <strong style="color:#f0e6ff;">playofans.com/${slug.trim()}/ruleta</strong>
            </p>
            <p style="font-size:14px;color:#a89cc8;line-height:1.6;">
              Si necesitas ayuda, consulta nuestra <a href="https://playofans.com/guia" style="color:#ff0066;">guía de uso</a> 
              o escríbenos a <a href="mailto:hola@playofans.com" style="color:#ff0066;">hola@playofans.com</a>.
            </p>
            <div style="text-align:center;margin-top:30px;padding-top:20px;border-top:1px solid rgba(179,0,255,0.15);">
              <p style="font-size:12px;color:#6b5f80;">© 2025 PlayOFans · hola@playofans.com</p>
            </div>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return json(500, { error: 'Error al enviar email: ' + (errData.message || res.statusText) });
    }

    return json(200, { success: true, message: 'Email de bienvenida enviado' });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
