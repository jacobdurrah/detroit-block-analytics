import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../../_utils.js';

/**
 * GET /api/blocks/[blockId]/parcels
 * Get all parcels in a specific block
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
    
    // Extract blockId from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const blockId = decodeURIComponent(pathParts[pathParts.length - 2]);
    
    // First get the block
    const { data: block, error: blockError } = await supabase
      .from('blocks')
      .select('id')
      .eq('block_id', blockId)
      .single();
    
    if (blockError) {
      if (blockError.code === 'PGRST116') {
        return errorResponse('Block not found', 404);
      }
      throw blockError;
    }
    
    // Fetch parcels
    let query = supabase
      .from('block_parcels')
      .select('*')
      .eq('block_id', block.id);
    
    // Apply pagination
    const limit = parseInt(params.limit) || 100;
    const offset = parseInt(params.offset) || 0;
    query = query.range(offset, offset + limit - 1);
    
    const { data: parcels, error, count } = await query;
    
    if (error) throw error;
    
    return apiResponse({
      block_id: blockId,
      parcels: parcels.map(p => ({
        parcel_id: p.parcel_id,
        address: p.address,
        ...p.property_data,
        geometry: p.geometry
      })),
      total: count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching parcels:', error);
    return errorResponse(error.message);
  }
}