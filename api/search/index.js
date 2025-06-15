import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../_utils.js';

/**
 * GET /api/search
 * Search blocks by various criteria
 * 
 * Query params:
 * - q: Search query (searches street names and cross streets)
 * - type: Filter by specific criteria (vacant, active, distressed)
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
    
    if (!params.q) {
      return errorResponse('Search query (q) is required', 400);
    }
    
    const searchTerm = params.q.toLowerCase();
    
    // Search blocks
    let query = supabase
      .from('block_summary')
      .select('*')
      .or(`street_name.ilike.%${searchTerm}%,from_cross_street.ilike.%${searchTerm}%,to_cross_street.ilike.%${searchTerm}%`);
    
    // Apply type filters
    if (params.type === 'vacant') {
      query = query.gt('vacancy_rate', 30);
    } else if (params.type === 'active') {
      query = query.gt('recent_sales_count', 5);
    } else if (params.type === 'distressed') {
      query = query.or('vacancy_rate.gt.30,tax_delinquent_percentage.gt.25');
    }
    
    // Limit results
    query = query.limit(20);
    
    const { data: blocks, error: blocksError } = await query;
    
    if (blocksError) throw blocksError;
    
    // Also search for specific parcels if the query looks like an address
    let parcels = [];
    if (searchTerm.match(/\d+/)) { // Contains numbers, might be an address
      const { data: parcelData, error: parcelError } = await supabase
        .from('block_parcels')
        .select('*')
        .ilike('address', `%${searchTerm}%`)
        .limit(10);
      
      if (!parcelError && parcelData) {
        parcels = parcelData;
      }
    }
    
    return apiResponse({
      query: params.q,
      results: {
        blocks: blocks || [],
        parcels: parcels.map(p => ({
          parcel_id: p.parcel_id,
          address: p.address,
          block_id: p.block_id,
          ...p.property_data
        }))
      },
      counts: {
        blocks: blocks?.length || 0,
        parcels: parcels.length
      }
    });
  } catch (error) {
    console.error('Error searching:', error);
    return errorResponse(error.message);
  }
}