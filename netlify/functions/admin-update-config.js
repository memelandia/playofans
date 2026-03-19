const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

const SOLO_THEMES = ['dark_luxury', 'rose_gold', 'neon_cyber', 'gold_vip', 'red_hot'];
const PRO_THEMES = [...SOLO_THEMES, 'halloween', 'navidad', 'san_valentin', 'summer', 'galaxy'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const body = JSON.parse(event.body || '{}');
    const { slug } = body;
    if (!slug) return json(400, { error: 'Falta el slug' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, plan')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    const updateData = {};

    // Validar premios
    if (body.prizes !== undefined) {
      if (!Array.isArray(body.prizes) || body.prizes.length < 2 || body.prizes.length > 10) {
        return json(400, { error: 'Los premios deben ser entre 2 y 10 elementos' });
      }
      updateData.prizes = body.prizes;
    }

    // Validar mensaje de bienvenida
    if (body.welcome_message !== undefined) {
      if (typeof body.welcome_message !== 'string' || body.welcome_message.length > 80) {
        return json(400, { error: 'El mensaje de bienvenida no puede superar los 80 caracteres' });
      }
      updateData.welcome_message = body.welcome_message;
    }

    // Validar mensaje post-premio
    if (body.post_prize_message !== undefined) {
      if (typeof body.post_prize_message !== 'string' || body.post_prize_message.length > 100) {
        return json(400, { error: 'El mensaje post-premio no puede superar los 100 caracteres' });
      }
      updateData.post_prize_message = body.post_prize_message;
    }

    // Validar tema (restringido por plan)
    if (body.theme !== undefined) {
      const validThemes = model.plan === 'solo' ? SOLO_THEMES : PRO_THEMES;
      if (!validThemes.includes(body.theme)) {
        const msg = model.plan === 'solo' && PRO_THEMES.includes(body.theme)
          ? 'Este tema requiere plan Pro o superior'
          : 'Tema no válido';
        return json(400, { error: msg });
      }
      updateData.theme = body.theme;
    }

    // Toggles booleanos
    if (body.sound_enabled_default !== undefined) {
      updateData.sound_enabled_default = Boolean(body.sound_enabled_default);
    }

    if (body.force_dark_mode !== undefined) {
      updateData.force_dark_mode = Boolean(body.force_dark_mode);
    }

    // Validar spins_per_code
    if (body.spins_per_code !== undefined) {
      const spc = parseInt(body.spins_per_code);
      if (isNaN(spc) || spc < 1 || spc > 10) {
        return json(400, { error: 'Las tiradas por código deben ser entre 1 y 10' });
      }
      updateData.spins_per_code = spc;
    }

    if (Object.keys(updateData).length === 0) {
      return json(400, { error: 'No hay cambios para aplicar' });
    }

    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('models')
      .update(updateData)
      .eq('id', model.id);

    if (updateError) return json(500, { error: 'Error al actualizar la configuración' });

    return json(200, { success: true, updated: Object.keys(updateData).filter(k => k !== 'updated_at') });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
