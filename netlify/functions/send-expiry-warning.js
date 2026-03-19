const { supabase, json, handleOptions } = require('./_shared');

// Función interna reutilizable (llamada por daily-cron o manualmente)
async function sendExpiryEmail(model, daysLeft) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'RESEND_API_KEY no configurada' };

  const urgencyColor = daysLeft <= 1 ? '#e74c3c' : '#f8b500';
  const urgencyText = daysLeft <= 1
    ? '⚠️ Tu suscripción vence HOY'
    : `⏰ Tu suscripción vence en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`;
  const subject = daysLeft <= 1
    ? `⚠️ Tu suscripción de PlayOFans vence hoy, ${model.display_name}`
    : `⏰ Tu suscripción de PlayOFans vence en ${daysLeft} días, ${model.display_name}`;

  const expiresDate = new Date(model.subscription_expires_at).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PlayOFans <noreply@playofans.com>',
      to: model.email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0612;color:#f0e6ff;padding:40px 30px;border-radius:16px;">
          <div style="text-align:center;margin-bottom:30px;">
            <h1 style="font-size:28px;margin:0;">🎰 PlayOFans</h1>
          </div>
          <div style="background:${urgencyColor}22;border:1px solid ${urgencyColor}44;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <p style="font-size:18px;font-weight:700;margin:0;color:${urgencyColor};">${urgencyText}</p>
            <p style="font-size:14px;color:#a89cc8;margin:8px 0 0 0;">Fecha de vencimiento: <strong style="color:#f0e6ff;">${expiresDate}</strong></p>
          </div>
          <h2 style="font-size:20px;margin-bottom:12px;">Hola ${model.display_name} 👋</h2>
          <p style="font-size:15px;line-height:1.7;color:#a89cc8;">
            Tu suscripción al plan <strong style="color:#f0e6ff;text-transform:uppercase;">${model.plan}</strong> de PlayOFans 
            ${daysLeft <= 1 ? 'vence <strong style="color:#e74c3c;">hoy</strong>' : `vence el <strong style="color:#f0e6ff;">${expiresDate}</strong>`}.
          </p>
          <p style="font-size:15px;line-height:1.7;color:#a89cc8;">
            Si tu suscripción expira, tu ruleta dejará de funcionar después de un período de gracia de 3 días. 
            Tus fans no podrán acceder a <strong style="color:#f0e6ff;">playofans.com/${model.slug}/ruleta</strong>.
          </p>
          <div style="background:#120e1f;border:1px solid rgba(179,0,255,0.2);border-radius:12px;padding:20px;margin:24px 0;">
            <h3 style="margin:0 0 12px;font-size:16px;color:#b300ff;">¿Qué pasa si no renuevas?</h3>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:2;color:#a89cc8;">
              <li>Tu ruleta se desactivará</li>
              <li>Los enlaces que enviaste dejarán de funcionar</li>
              <li>Tus datos se conservan por si decides volver</li>
            </ul>
          </div>
          <p style="font-size:15px;line-height:1.7;color:#a89cc8;">
            Para renovar, contacta con nosotros en 
            <a href="mailto:hola@playofans.com" style="color:#ff0066;">hola@playofans.com</a>.
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
    return { sent: false, reason: errData.message || res.statusText };
  }
  return { sent: true };
}

// Endpoint HTTP: enviar manualmente un aviso de vencimiento
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { model_id, days_left } = body;

    if (!model_id) return json(400, { error: 'model_id es obligatorio' });

    const { data: model, error } = await supabase
      .from('models')
      .select('slug, display_name, email, plan, subscription_expires_at')
      .eq('id', model_id)
      .single();

    if (error || !model) return json(404, { error: 'Modelo no encontrado' });

    const daysLeft = days_left || 7;
    const result = await sendExpiryEmail(model, daysLeft);

    if (!result.sent) {
      return json(500, { error: 'Error al enviar email: ' + result.reason });
    }

    return json(200, { success: true, message: `Aviso de vencimiento enviado a ${model.email}` });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};

// Exportar para uso interno desde daily-cron.js
module.exports.sendExpiryEmail = sendExpiryEmail;
module.exports.handler = exports.handler;
