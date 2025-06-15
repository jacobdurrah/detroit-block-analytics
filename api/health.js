import { getSupabaseClient, apiResponse, errorResponse, handleOptions } from './_utils.js';

/**
 * GET /api/health
 * Health check endpoint
 */
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const supabase = getSupabaseClient();
    
    // Test database connection
    const { count: blockCount, error: blockError } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true });
    
    const { data: lastRun, error: runError } = await supabase
      .from('analytics_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    
    const healthy = !blockError && !runError;
    
    return apiResponse({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: !blockError,
        blockCount: blockCount || 0
      },
      lastAnalyticsRun: lastRun ? {
        id: lastRun.id,
        type: lastRun.run_type,
        status: lastRun.status,
        startedAt: lastRun.started_at,
        completedAt: lastRun.completed_at
      } : null,
      environment: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY
      }
    }, healthy ? 200 : 503);
  } catch (error) {
    console.error('Health check error:', error);
    return errorResponse('Health check failed', 503);
  }
}