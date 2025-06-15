import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../_utils.js';

/**
 * GET /api/blocks
 * Get all blocks with optional filtering
 * 
 * Query params:
 * - street: Filter by street name (partial match)
 * - limit: Number of results (default 100)
 * - offset: Pagination offset
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
      .from('blocks')
      .select('*');
    
    // Apply filters
    if (params.street) {
      query = query.ilike('street_name', `%${params.street}%`);
    }
    
    // Apply pagination
    const limit = parseInt(params.limit) || 100;
    const offset = parseInt(params.offset) || 0;
    query = query.range(offset, offset + limit - 1);
    
    // Order by street name and cross streets
    query = query.order('street_name').order('from_cross_street');
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return apiResponse({
      blocks: data,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return errorResponse(error.message);
  }
}