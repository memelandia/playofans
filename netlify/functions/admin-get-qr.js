const QRCode = require('qrcode');
const { supabase, json, handleOptions, authenticateAdmin } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateAdmin(event);
    if (auth.error) return auth.error;

    const { slug, code } = event.queryStringParameters || {};
    if (!slug || !code) return json(400, { error: 'Faltan slug o código' });

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id')
      .eq('slug', slug)
      .eq('supabase_user_id', auth.user.id)
      .single();

    if (modelError || !model) return json(403, { error: 'No tienes acceso a este modelo' });

    // Verificar que el código pertenece al modelo
    const { data: codeData, error: codeError } = await supabase
      .from('codes')
      .select('id')
      .eq('model_id', model.id)
      .eq('code', code.toUpperCase())
      .single();

    if (codeError || !codeData) return json(404, { error: 'Código no encontrado' });

    const url = `https://playofans.com/${slug}/ruleta?c=${code.toUpperCase()}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return json(200, { qr: qrDataUrl, url });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
