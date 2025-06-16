#!/usr/bin/env node

import { processCSVInChunks, getCSVStats } from '../lib/csv-loader.js';
import { assignBlockIds, validateBlockAssignments } from '../lib/block-detector-v2.js';
import db from '../lib/supabase-client.js';
import { createLogger, ProgressLogger } from '../lib/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('process-sales');

// Configuration
const SALES_CSV_PATH = path.join(__dirname, '../data/Property_Sales_Detroit_-4801866508954663892.csv');
const CHUNK_SIZE = 5000;

/**
 * Process sales data and assign blocks
 */
async function processSalesData() {
  logger.info('Starting sales data processing...');
  
  try {
    // Get file stats
    const stats = await getCSVStats(SALES_CSV_PATH);
    logger.info('CSV file stats:', stats);
    
    const progress = new ProgressLogger(stats.estimatedTotalLines, 'sales-processing');
    
    // Track unique parcels and blocks
    const uniqueParcels = new Map();
    const blockStats = new Map();
    const salesByBlock = new Map();
    
    // Start analytics run
    const run = await db.runs.startRun('sales_import');
    
    // Process CSV in chunks
    await processCSVInChunks(
      SALES_CSV_PATH,
      async (chunk, offset) => {
        // Process this chunk
        const parcelsInChunk = [];
        
        for (const row of chunk) {
          // Skip invalid rows
          if (!row['Street Address'] || !row['Parcel Number']) continue;
          
          const parcel = {
            parcel_id: row['Parcel Number'].replace(/\.$/, ''), // Remove trailing period
            address: row['Street Address'],
            street_number: row['Street Number'],
            street_name: row['Street Name'],
            sale_date: row['Sale Date'],
            sale_price: parseFloat(row['Sale Price']) || 0,
            property_class: row['Property Class Code'],
            lat: parseFloat(row['y']) || null,
            lng: parseFloat(row['x']) || null,
            original_data: row
          };
          
          // Only process if we have coordinates
          if (parcel.lat && parcel.lng) {
            parcelsInChunk.push(parcel);
            
            // Track unique parcels
            if (!uniqueParcels.has(parcel.parcel_id)) {
              uniqueParcels.set(parcel.parcel_id, parcel);
            }
          }
        }
        
        // Assign block IDs to this chunk
        const { parcels: assignedParcels, blockStats: chunkBlockStats } = assignBlockIds(parcelsInChunk);
        
        // Update global block stats
        for (const [blockId, stats] of Object.entries(chunkBlockStats)) {
          if (!blockStats.has(blockId)) {
            blockStats.set(blockId, {
              count: 0,
              minNumber: Infinity,
              maxNumber: -Infinity,
              streetName: stats.streetName,
              sales: []
            });
          }
          
          const blockStat = blockStats.get(blockId);
          blockStat.count += stats.count;
          blockStat.minNumber = Math.min(blockStat.minNumber, stats.minNumber);
          blockStat.maxNumber = Math.max(blockStat.maxNumber, stats.maxNumber);
        }
        
        // Track sales by block
        for (const parcel of assignedParcels) {
          if (parcel.block_id) {
            if (!salesByBlock.has(parcel.block_id)) {
              salesByBlock.set(parcel.block_id, []);
            }
            salesByBlock.get(parcel.block_id).push({
              parcel_id: parcel.parcel_id,
              sale_date: parcel.sale_date,
              sale_price: parcel.sale_price,
              address: parcel.address
            });
          }
        }
        
        // Update progress
        progress.update(offset + chunk.length);
        
        // Update run stats
        await db.runs.updateRun(run.id, {
          parcels_processed: offset + chunk.length
        });
      },
      CHUNK_SIZE
    );
    
    progress.complete('CSV processing complete');
    
    // Now save unique blocks to database
    logger.info(`Found ${blockStats.size} unique blocks`);
    logger.info(`Found ${uniqueParcels.size} unique parcels with sales`);
    
    const blockProgress = new ProgressLogger(blockStats.size, 'block-creation');
    let blockCount = 0;
    
    for (const [blockId, stats] of blockStats) {
      try {
        // Extract block components from ID
        const parts = blockId.split('_');
        const streetName = parts.slice(0, -2).join(' ');
        const fromNumber = parseInt(parts[parts.length - 2]);
        const toNumber = parseInt(parts[parts.length - 1]);
        
        // Create block record
        const block = await db.blocks.upsertBlock({
          block_id: blockId,
          street_name: streetName,
          from_cross_street: `${fromNumber}`,
          to_cross_street: `${toNumber}`
        });
        
        // Get parcels for this block
        const blockParcels = Array.from(uniqueParcels.values())
          .filter(p => {
            const assigned = assignBlockIds([p]);
            return assigned.parcels[0]?.block_id === blockId;
          });
        
        // Save parcels to database
        if (blockParcels.length > 0) {
          const parcelData = blockParcels.map(p => ({
            block_id: block.id,
            parcel_id: p.parcel_id,
            address: p.address,
            property_data: {
              street_number: p.street_number,
              street_name: p.street_name,
              property_class: p.property_class,
              coordinates: { lat: p.lat, lng: p.lng }
            },
            geometry: p.lat && p.lng ? {
              type: 'Point',
              coordinates: [p.lng, p.lat]
            } : null
          }));
          
          await db.parcels.insertParcels(parcelData);
        }
        
        // Calculate block analytics based on sales
        const blockSales = salesByBlock.get(blockId) || [];
        const recentSales = blockSales.filter(s => {
          const saleDate = new Date(s.sale_date);
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          return saleDate > twoYearsAgo;
        });
        
        const validSales = blockSales.filter(s => s.sale_price > 0);
        const salesPrices = validSales.map(s => s.sale_price);
        
        const analytics = {
          block_id: block.id,
          total_parcels: blockParcels.length,
          recent_sales_count: recentSales.length,
          recent_sales_avg_price: recentSales.length > 0 
            ? recentSales.reduce((sum, s) => sum + s.sale_price, 0) / recentSales.length 
            : null,
          last_sale_date: blockSales.length > 0
            ? blockSales.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))[0].sale_date
            : null
        };
        
        await db.analytics.upsertAnalytics(analytics);
        
        blockCount++;
        blockProgress.update(blockCount);
        
      } catch (error) {
        logger.error(`Error processing block ${blockId}:`, error);
      }
    }
    
    blockProgress.complete('Block creation complete');
    
    // Complete the run
    await db.runs.completeRun(run.id, {
      parcels_processed: uniqueParcels.size,
      blocks_processed: blockCount,
      metadata: {
        totalSalesRecords: stats.estimatedTotalLines,
        uniqueParcels: uniqueParcels.size,
        uniqueBlocks: blockStats.size
      }
    });
    
    logger.info('Sales data processing completed successfully!');
    
    // Log summary statistics
    logger.info('\n=== Summary Statistics ===');
    logger.info(`Total sales records: ${stats.estimatedTotalLines}`);
    logger.info(`Unique parcels: ${uniqueParcels.size}`);
    logger.info(`Unique blocks: ${blockStats.size}`);
    
    // Top 10 blocks by sales activity
    const topBlocks = Array.from(salesByBlock.entries())
      .map(([blockId, sales]) => ({ blockId, salesCount: sales.length }))
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 10);
    
    logger.info('\nTop 10 blocks by sales activity:');
    topBlocks.forEach((block, i) => {
      logger.info(`  ${i + 1}. ${block.blockId}: ${block.salesCount} sales`);
    });
    
  } catch (error) {
    logger.error('Fatal error processing sales data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  processSalesData().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}