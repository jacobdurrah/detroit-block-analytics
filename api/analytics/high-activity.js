import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../_utils.js';

/**
 * GET /api/analytics/high-activity
 * Get blocks with high sales activity
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
    const params = parseQueryParams(request.url);
    
    let query = supabase
      .from('high_activity_blocks')
      .select('*');
    
    // Apply additional filters if needed
    if (params.street) {
      query = query.ilike('street_name', `%${params.street}%`);
    }
    
    if (params.minSales) {
      query = query.gte('recent_sales_count', parseInt(params.minSales));
    }
    
    // Apply pagination
    const limit = parseInt(params.limit) || 50;
    const offset = parseInt(params.offset) || 0;
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Calculate market insights
    const insights = data.reduce((acc, block) => {
      acc.totalSales += block.recent_sales_count || 0;
      acc.avgSalesPerBlock = acc.totalSales / data.length;
      acc.maxSales = Math.max(acc.maxSales, block.recent_sales_count || 0);
      return acc;
    }, {
      totalSales: 0,
      avgSalesPerBlock: 0,
      maxSales: 0
    });
    
    return apiResponse({
      total: count,
      marketInsights: insights,
      blocks: data,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching high activity blocks:', error);
    return errorResponse(error.message);
  }
}