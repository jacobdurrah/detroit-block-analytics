import { getSupabaseClient, apiResponse, errorResponse, handleOptions, parseQueryParams } from '../_utils.js';

/**
 * GET /api/analytics/distressed
 * Get distressed blocks (high vacancy or tax delinquency)
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
      .from('distressed_blocks')
      .select('*');
    
    // Apply additional filters if needed
    if (params.street) {
      query = query.ilike('street_name', `%${params.street}%`);
    }
    
    // Apply pagination
    const limit = parseInt(params.limit) || 50;
    const offset = parseInt(params.offset) || 0;
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    // Categorize distressed blocks
    const categorized = {
      highVacancy: data.filter(b => b.vacancy_rate > 30),
      highDelinquency: data.filter(b => b.tax_delinquent_percentage > 25),
      both: data.filter(b => b.vacancy_rate > 30 && b.tax_delinquent_percentage > 25)
    };
    
    return apiResponse({
      total: count,
      distressedBlocks: data,
      breakdown: {
        highVacancy: categorized.highVacancy.length,
        highDelinquency: categorized.highDelinquency.length,
        both: categorized.both.length
      },
      blocks: data,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching distressed blocks:', error);
    return errorResponse(error.message);
  }
}