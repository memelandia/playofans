const { supabase, json } = require('./_shared');
const { sendExpiryEmail } = require('./send-expiry-warning');

// Netlify Scheduled Function: runs daily at 9:00 AM UTC
// Configure in netlify.toml: [functions."daily-cron"] schedule = "0 9 * * *"
exports.handler = async (event) => {
  const results = {
    warnings_7d: [],
    warnings_today: [],
    suspended: [],
    codes_reset: 0,
    errors: [],
  };

  const now = new Date();

  try {
    // =========================================================================
    // 1. ENVIAR AVISO: cuentas que vencen en exactamente 7 días
    // =========================================================================
    const in7days = new Date(now);
    in7days.setDate(in7days.getDate() + 7);
    const dayStart7 = new Date(in7days.getFullYear(), in7days.getMonth(), in7days.getDate());
    const dayEnd7 = new Date(dayStart7);
    dayEnd7.setDate(dayEnd7.getDate() + 1);

    const { data: expiring7d } = await supabase
      .from('models')
      .select('id, slug, display_name, email, plan, subscription_expires_at')
      .eq('active', true)
      .gte('subscription_expires_at', dayStart7.toISOString())
      .lt('subscription_expires_at', dayEnd7.toISOString());

    for (const model of (expiring7d || [])) {
      try {
        const result = await sendExpiryEmail(model, 7);
        if (result.sent) {
          results.warnings_7d.push(model.slug);
        } else {
          results.errors.push(`7d warning ${model.slug}: ${result.reason}`);
        }
      } catch (err) {
        results.errors.push(`7d warning ${model.slug}: ${err.message}`);
      }
    }

    // =========================================================================
    // 2. ENVIAR AVISO: cuentas que vencen HOY
    // =========================================================================
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const { data: expiringToday } = await supabase
      .from('models')
      .select('id, slug, display_name, email, plan, subscription_expires_at')
      .eq('active', true)
      .gte('subscription_expires_at', todayStart.toISOString())
      .lt('subscription_expires_at', todayEnd.toISOString());

    for (const model of (expiringToday || [])) {
      try {
        // Set grace period: 3 days from expiration
        const graceUntil = new Date(model.subscription_expires_at);
        graceUntil.setDate(graceUntil.getDate() + 3);

        await supabase
          .from('models')
          .update({ grace_period_until: graceUntil.toISOString() })
          .eq('id', model.id);

        const result = await sendExpiryEmail(model, 0);
        if (result.sent) {
          results.warnings_today.push(model.slug);
        } else {
          results.errors.push(`today warning ${model.slug}: ${result.reason}`);
        }
      } catch (err) {
        results.errors.push(`today warning ${model.slug}: ${err.message}`);
      }
    }

    // =========================================================================
    // 3. SUSPENDER: cuentas con grace_period_until vencido
    // =========================================================================
    const { data: toSuspend } = await supabase
      .from('models')
      .select('id, slug')
      .eq('active', true)
      .not('grace_period_until', 'is', null)
      .lte('grace_period_until', now.toISOString());

    for (const model of (toSuspend || [])) {
      try {
        await supabase
          .from('models')
          .update({ active: false })
          .eq('id', model.id);
        results.suspended.push(model.slug);
      } catch (err) {
        results.errors.push(`suspend ${model.slug}: ${err.message}`);
      }
    }

    // =========================================================================
    // 4. RESET CÓDIGOS MENSUALES (plan Solo: 100/mes)
    // =========================================================================
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthStr = currentMonthStart.toISOString().slice(0, 10);

    const { data: toReset } = await supabase
      .from('models')
      .select('id')
      .lt('codes_month_reset', currentMonthStr);

    if (toReset && toReset.length > 0) {
      const ids = toReset.map(m => m.id);
      const { error: resetErr } = await supabase
        .from('models')
        .update({
          codes_created_this_month: 0,
          codes_month_reset: currentMonthStr,
        })
        .in('id', ids);

      if (!resetErr) {
        results.codes_reset = ids.length;
      } else {
        results.errors.push(`codes reset: ${resetErr.message}`);
      }
    }

    // =========================================================================
    // 5. NOTIFICACIÓN RESUMEN A SUPERADMIN
    // =========================================================================
    const totalActions = results.warnings_7d.length + results.warnings_today.length +
                         results.suspended.length + results.codes_reset;

    if (totalActions > 0 && process.env.RESEND_API_KEY) {
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
            subject: `[PlayOFans Cron] ${totalActions} acciones ejecutadas`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2>🕐 Resumen diario — ${now.toLocaleDateString('es-ES')}</h2>
                <ul>
                  <li>⏰ Avisos 7 días: ${results.warnings_7d.length > 0 ? results.warnings_7d.join(', ') : 'ninguno'}</li>
                  <li>⚠️ Avisos vencimiento hoy: ${results.warnings_today.length > 0 ? results.warnings_today.join(', ') : 'ninguno'}</li>
                  <li>🔴 Suspendidas: ${results.suspended.length > 0 ? results.suspended.join(', ') : 'ninguna'}</li>
                  <li>🔄 Códigos reseteados: ${results.codes_reset} cuentas</li>
                </ul>
                ${results.errors.length > 0 ? '<h3>Errores:</h3><ul>' + results.errors.map(e => `<li>${e}</li>`).join('') + '</ul>' : ''}
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        // Non-blocking
      }
    }

    return json(200, { success: true, results });
  } catch (err) {
    return json(500, { error: 'Error en daily-cron: ' + err.message, partial_results: results });
  }
};
