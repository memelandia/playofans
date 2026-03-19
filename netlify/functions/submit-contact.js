const { supabase, json, handleOptions } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, message } = body;

    if (!name?.trim()) return json(400, { error: 'El nombre es obligatorio' });
    if (!email?.trim()) return json(400, { error: 'El email es obligatorio' });
    if (!message?.trim()) return json(400, { error: 'El mensaje es obligatorio' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return json(400, { error: 'El formato del email no es válido' });
    }

    if (message.trim().length > 2000) {
      return json(400, { error: 'El mensaje es demasiado largo (máximo 2000 caracteres)' });
    }

    // Enviar email a Franco via Resend
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
            subject: `Contacto: ${name.trim()}`,
            reply_to: email.trim(),
            html: `
              <h2>Nuevo mensaje de contacto</h2>
              <p><strong>Nombre:</strong> ${name.trim()}</p>
              <p><strong>Email:</strong> ${email.trim()}</p>
              <hr>
              <p>${message.trim().replace(/\n/g, '<br>')}</p>
            `,
          }),
        });
      } catch (emailErr) {
        console.error('Email error:', emailErr);
      }
    }

    return json(200, { success: true, message: 'Mensaje enviado correctamente' });
  } catch (err) {
    console.error('Unhandled error:', err);
    return json(500, { error: 'Error interno del servidor' });
  }
};
