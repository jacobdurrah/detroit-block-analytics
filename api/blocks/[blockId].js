import { getSupabaseClient, apiResponse, errorResponse, handleOptions } from '../_utils.js';

/**
 * GET /api/blocks/[blockId]
 * Get a specific block by ID with its analytics
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
    
    // Extract blockId from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const blockId = decodeURIComponent(pathParts[pathParts.length - 1]);
    
    // Fetch block details
    const { data: block, error: blockError } = await supabase
      .from('blocks')
      .select('*')
      .eq('block_id', blockId)
      .single();
    
    if (blockError) {
      if (blockError.code === 'PGRST116') {
        return errorResponse('Block not found', 404);
      }
      throw blockError;
    }
    
    // Fetch latest analytics
    const { data: analytics, error: analyticsError } = await supabase
      .from('current_block_analytics')
      .select('*')
      .eq('block_id', block.id)
      .single();
    
    if (analyticsError && analyticsError.code !== 'PGRST116') {
      throw analyticsError;
    }
    
    // Fetch parcels count
    const { count: parcelCount } = await supabase
      .from('block_parcels')
      .select('*', { count: 'exact', head: true })
      .eq('block_id', block.id);
    
    return apiResponse({
      block: {
        ...block,
        analytics: analytics || null,
        parcel_count: parcelCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    return errorResponse(error.message);
  }
}