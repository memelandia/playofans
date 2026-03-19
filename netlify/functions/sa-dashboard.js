const { supabase, json, handleOptions, authenticateSuperAdmin } = require('./_shared');

const PLAN_PRICES = { solo: 49, pro: 89, agency: 349 };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido' });

  try {
    const auth = await authenticateSuperAdmin(event);
    if (auth.error) return auth.error;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries
    const [modelsRes, spinsTodayRes, spinsMonthRes, expiringRes, graceRes, registrationsRes] = await Promise.all([
      supabase.from('models').select('id, plan, active, subscription_expires_at, grace_period_until'),
      supabase.from('spins').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).eq('verified', true),
      supabase.from('spins').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).eq('verified', true),
      supabase.from('models').select('id', { count: 'exact', head: true }).eq('active', true).lte('subscription_expires_at', sevenDaysFromNow).gte('subscription_expires_at', now.toISOString()),
      supabase.from('models').select('id', { count: 'exact', head: true }).not('grace_period_until', 'is', null).gte('grace_period_until', now.toISOString()),
      supabase.from('registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const models = modelsRes.data || [];
    const activeModels = models.filter(m => m.active);

    // Calculate MRR
    const mrr = activeModels.reduce((sum, m) => sum + (PLAN_PRICES[m.plan] || 0), 0);

    return json(200, {
      mrr,
      active_accounts: activeModels.length,
      total_accounts: models.length,
      spins_today: spinsTodayRes.count || 0,
      spins_month: spinsMonthRes.count || 0,
      expiring_soon: expiringRes.count || 0,
      in_grace_period: graceRes.count || 0,
      pending_registrations: registrationsRes.count || 0,
    });
  } catch (err) {
    return json(500, { error: 'Error interno del servidor' });
  }
};
