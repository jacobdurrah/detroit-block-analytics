#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { assignBlockIds } from '../lib/block-detector-v2.js';
import db from '../lib/supabase-client.js';
import { createLogger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('test-process');
const SALES_CSV_PATH = path.join(__dirname, '../data/Property_Sales_Detroit_-4801866508954663892.csv');
const TEST_LIMIT = 1000; // Process first 1000 records

async function testProcessSales() {
  logger.info(`Testing sales processing with first ${TEST_LIMIT} records...`);
  
  const fileStream = fs.createReadStream(SALES_CSV_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let headers = null;
  const parcels = [];
  const blockMap = new Map();
  
  // Start test run
  const run = await db.runs.startRun('test_sales_import');

  for await (const line of rl) {
    lineCount++;
    
    if (lineCount === 1) {
      headers = line.split(',').map(h => h.replace(/[^a-zA-Z0-9\s]/g, '').trim());
      continue;
    }
    
    if (lineCount > TEST_LIMIT) break;
    
    try {
      const values = line.split(',');
      const record = {};
      
      headers.forEach((header, i) => {
        record[header] = values[i] || '';
      });
      
      // Only process records with coordinates
      if (!record.x || !record.y || !record['Street Address']) continue;
      
      const parcel = {
        parcel_id: record['Parcel Number'].replace(/\.$/, ''),
        address: record['Street Address'],
        lat: parseFloat(record.y),
        lng: parseFloat(record.x),
        sale_date: record['Sale Date'],
        sale_price: parseFloat(record['Sale Price']) || 0,
        property_class: record['Property Class Code']
      };
      
      parcels.push(parcel);
    } catch (error) {
      logger.warn(`Error parsing line ${lineCount}: ${error.message}`);
    }
  }

  logger.info(`Loaded ${parcels.length} parcels with coordinates`);
  
  // Assign blocks
  const { parcels: assignedParcels, blockStats, summary } = assignBlockIds(parcels);
  
  logger.info('Block assignment summary:', summary);
  
  // Create unique blocks in database
  let createdBlocks = 0;
  for (const [blockId, stats] of Object.entries(blockStats)) {
    try {
      const parts = blockId.split('_');
      const streetName = parts.slice(0, -2).join(' ');
      const fromNumber = parseInt(parts[parts.length - 2]);
      const toNumber = parseInt(parts[parts.length - 1]);
      
      const block = await db.blocks.upsertBlock({
        block_id: blockId,
        street_name: streetName,
        from_cross_street: `${fromNumber}`,
        to_cross_street: `${toNumber}`
      });
      
      blockMap.set(blockId, block.id);
      createdBlocks++;
      
      logger.debug(`Created block: ${blockId}`);
    } catch (error) {
      logger.error(`Error creating block ${blockId}: ${error.message}`);
    }
  }
  
  logger.info(`Created ${createdBlocks} blocks in database`);
  
  // Save a sample of parcels
  let savedParcels = 0;
  const uniqueParcels = new Map();
  
  // Get unique parcels
  for (const parcel of assignedParcels) {
    if (parcel.block_id && !uniqueParcels.has(parcel.parcel_id)) {
      uniqueParcels.set(parcel.parcel_id, parcel);
    }
  }
  
  logger.info(`Found ${uniqueParcels.size} unique parcels`);
  
  // Save up to 100 parcels as a test
  const parcelsToSave = Array.from(uniqueParcels.values()).slice(0, 100);
  
  for (const parcel of parcelsToSave) {
    try {
      const blockUuid = blockMap.get(parcel.block_id);
      if (!blockUuid) continue;
      
      await db.parcels.insertParcels([{
        block_id: blockUuid,
        parcel_id: parcel.parcel_id,
        address: parcel.address,
        property_data: {
          sale_date: parcel.sale_date,
          sale_price: parcel.sale_price,
          property_class: parcel.property_class
        },
        geometry: {
          type: 'Point',
          coordinates: [parcel.lng, parcel.lat]
        }
      }]);
      
      savedParcels++;
    } catch (error) {
      logger.warn(`Error saving parcel ${parcel.parcel_id}: ${error.message}`);
    }
  }
  
  logger.info(`Saved ${savedParcels} parcels to database`);
  
  // Complete run
  await db.runs.completeRun(run.id, {
    parcels_processed: parcels.length,
    blocks_processed: createdBlocks,
    metadata: {
      test: true,
      limit: TEST_LIMIT,
      uniqueParcels: uniqueParcels.size,
      savedParcels
    }
  });
  
  logger.info('Test processing complete!');
  
  // Show sample results
  console.log('\nSample Block Analytics:');
  const topBlocks = Object.entries(blockStats)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5);
  
  topBlocks.forEach(([blockId, stats]) => {
    console.log(`  ${blockId}: ${stats.count} parcels`);
  });
  
  console.log('\nTest complete! Check the API to see the data:');
  console.log('  curl https://detroit-block-analytics.vercel.app/api/blocks?limit=10');
}

// Run test
testProcessSales().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});