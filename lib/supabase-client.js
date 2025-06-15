import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});

// Block operations
export const blockOperations = {
  /**
   * Create or update a block
   */
  async upsertBlock(blockData) {
    const { data, error } = await supabase
      .from('blocks')
      .upsert(blockData, { 
        onConflict: 'block_id',
        returning: true 
      })
      .select();
    
    if (error) throw error;
    return data[0];
  },

  /**
   * Get block by ID
   */
  async getBlock(blockId) {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('block_id', blockId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get all blocks for a street
   */
  async getBlocksByStreet(streetName) {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .ilike('street_name', `%${streetName}%`)
      .order('from_cross_street');
    
    if (error) throw error;
    return data;
  }
};

// Parcel operations
export const parcelOperations = {
  /**
   * Batch insert parcels for a block
   */
  async insertParcels(parcels) {
    // Insert in batches of 100
    const batchSize = 100;
    const results = [];
    
    for (let i = 0; i < parcels.length; i += batchSize) {
      const batch = parcels.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('block_parcels')
        .upsert(batch, {
          onConflict: 'block_id,parcel_id',
          returning: 'minimal'
        });
      
      if (error) throw error;
      results.push(data);
    }
    
    return results;
  },

  /**
   * Get parcels for a block
   */
  async getParcelsByBlock(blockId) {
    const { data, error } = await supabase
      .from('block_parcels')
      .select('*')
      .eq('block_id', blockId);
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete parcels no longer in block
   */
  async deleteParcelsNotIn(blockId, currentParcelIds) {
    const { error } = await supabase
      .from('block_parcels')
      .delete()
      .eq('block_id', blockId)
      .not('parcel_id', 'in', `(${currentParcelIds.join(',')})`);
    
    if (error) throw error;
  }
};

// Analytics operations
export const analyticsOperations = {
  /**
   * Create or update analytics for a block
   */
  async upsertAnalytics(analyticsData) {
    const { data, error } = await supabase
      .from('block_analytics')
      .upsert(analyticsData, {
        onConflict: 'block_id,analytics_date',
        returning: true
      })
      .select();
    
    if (error) throw error;
    return data[0];
  },

  /**
   * Get latest analytics for a block
   */
  async getLatestAnalytics(blockId) {
    const { data, error } = await supabase
      .from('block_analytics')
      .select('*')
      .eq('block_id', blockId)
      .order('analytics_date', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get analytics history for a block
   */
  async getAnalyticsHistory(blockId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('block_analytics')
      .select('*')
      .eq('block_id', blockId)
      .gte('analytics_date', startDate.toISOString())
      .order('analytics_date');
    
    if (error) throw error;
    return data;
  }
};

// Run tracking operations
export const runOperations = {
  /**
   * Start a new analytics run
   */
  async startRun(runType = 'incremental') {
    const { data, error } = await supabase
      .from('analytics_runs')
      .insert({
        run_type: runType,
        status: 'running'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update run progress
   */
  async updateRun(runId, updates) {
    const { data, error } = await supabase
      .from('analytics_runs')
      .update(updates)
      .eq('id', runId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Complete a run
   */
  async completeRun(runId, summary) {
    const { data, error } = await supabase
      .from('analytics_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...summary
      })
      .eq('id', runId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Fail a run
   */
  async failRun(runId, errorDetails) {
    const { data, error } = await supabase
      .from('analytics_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: errorDetails
      })
      .eq('id', runId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

// Query operations
export const queryOperations = {
  /**
   * Get block summary
   */
  async getBlockSummary(filters = {}) {
    let query = supabase
      .from('block_summary')
      .select('*');
    
    // Apply filters
    if (filters.streetName) {
      query = query.ilike('street_name', `%${filters.streetName}%`);
    }
    if (filters.minVacancyRate) {
      query = query.gte('vacancy_rate', filters.minVacancyRate);
    }
    if (filters.maxVacancyRate) {
      query = query.lte('vacancy_rate', filters.maxVacancyRate);
    }
    
    const { data, error } = await query.order('street_name');
    
    if (error) throw error;
    return data;
  },

  /**
   * Get high activity blocks
   */
  async getHighActivityBlocks(limit = 20) {
    const { data, error } = await supabase
      .from('high_activity_blocks')
      .select('*')
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get distressed blocks
   */
  async getDistressedBlocks(limit = 20) {
    const { data, error } = await supabase
      .from('distressed_blocks')
      .select('*')
      .limit(limit);
    
    if (error) throw error;
    return data;
  }
};

// Transaction helper
export async function withTransaction(callback) {
  // Note: Supabase doesn't support transactions via client library
  // This is a placeholder for potential future implementation
  // For now, we'll just execute the callback
  return await callback(supabase);
}

export default {
  supabase,
  blocks: blockOperations,
  parcels: parcelOperations,
  analytics: analyticsOperations,
  runs: runOperations,
  query: queryOperations,
  withTransaction
};