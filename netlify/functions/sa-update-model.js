const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { model_id, action } = body;

    if (!model_id || !action) return json(400, { error: 'model_id y action son obligatorios' });

    // Verify model exists
    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('*')
      .eq('id', model_id)
      .single();

    if (fetchError || !model) return json(404, { error: 'Modelo no encontrado' });

    const now = new Date();
    let updateData = {};

    switch (action) {
      case 'renew': {
        const months = Math.max(1, Math.min(12, parseInt(body.months) || 1));
        const baseDate = model.subscription_expires_at && new Date(model.subscription_expires_at) > now
          ? new Date(model.subscription_expires_at)
          : now;
        baseDate.setMonth(baseDate.getMonth() + months);
        updateData = {
          subscription_expires_at: baseDate.toISOString(),
          grace_period_until: null,
          active: true,
        };
        break;
      }

      case 'change_plan': {
        const newPlan = body.plan;
        if (!['solo', 'pro', 'agency'].includes(newPlan)) {
          return json(400, { error: 'Plan inválido' });
        }
        updateData = { plan: newPlan };
        // If downgrading to solo and theme is Pro-only, reset to default
        if (newPlan === 'solo') {
          const proThemes = ['halloween', 'navidad', 'san_valentin', 'summer', 'galaxy'];
          if (proThemes.includes(model.theme)) {
            updateData.theme = 'dark_luxury';
          }
        }
        break;
      }

      case 'activate':
        updateData = { active: true };
        break;

      case 'deactivate':
        updateData = { active: false };
        break;

      case 'update_notes':
        updateData = { admin_notes: body.notes ?? null };
        break;

      default:
        return json(400, { error: 'Acción no reconocida. Acciones válidas: renew, change_plan, activate, deactivate, update_notes' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('models')
      .update(updateData)
      .eq('id', model_id)
      .select()
      .single();

    if (updateError) return json(500, { error: 'Error al actualizar el modelo' });

    return json(200, { model: updated });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
