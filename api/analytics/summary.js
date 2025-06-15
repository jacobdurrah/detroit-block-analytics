import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../_utils.js';

/**
 * GET /api/analytics/summary
 * Get block analytics summary with filtering options
 * 
 * Query params:
 * - street: Filter by street name
 * - minVacancy: Minimum vacancy rate
 * - maxVacancy: Maximum vacancy rate
 * - minSales: Minimum recent sales count
 * - sort: Sort field (vacancy_rate, recent_sales_count, avg_assessed_value)
 * - order: Sort order (asc, desc)
 * - limit: Number of results
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
      .from('block_summary')
      .select('*');
    
    // Apply filters
    if (params.street) {
      query = query.ilike('street_name', `%${params.street}%`);
    }
    
    if (params.minVacancy) {
      query = query.gte('vacancy_rate', parseFloat(params.minVacancy));
    }
    
    if (params.maxVacancy) {
      query = query.lte('vacancy_rate', parseFloat(params.maxVacancy));
    }
    
    if (params.minSales) {
      query = query.gte('recent_sales_count', parseInt(params.minSales));
    }
    
    // Apply sorting
    const sortField = params.sort || 'vacancy_rate';
    const sortOrder = params.order === 'asc' ? true : false;
    query = query.order(sortField, { ascending: sortOrder });
    
    // Apply pagination
    const limit = parseInt(params.limit) || 50;
    const offset = parseInt(params.offset) || 0;
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Calculate summary statistics
    const stats = data.reduce((acc, block) => {
      acc.totalBlocks += 1;
      acc.totalParcels += block.total_parcels || 0;
      acc.totalVacant += block.vacant_parcels || 0;
      acc.avgVacancyRate += (block.vacancy_rate || 0);
      acc.totalRecentSales += block.recent_sales_count || 0;
      return acc;
    }, {
      totalBlocks: 0,
      totalParcels: 0,
      totalVacant: 0,
      avgVacancyRate: 0,
      totalRecentSales: 0
    });
    
    if (stats.totalBlocks > 0) {
      stats.avgVacancyRate = stats.avgVacancyRate / stats.totalBlocks;
    }
    
    return apiResponse({
      summary: stats,
      blocks: data,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    return errorResponse(error.message);
  }
}