#!/usr/bin/env node

import { DetroitAPIClient } from '../lib/detroit-api-client.js';
import { detectBlocks } from '../lib/block-detector.js';
import db from '../lib/supabase-client.js';
import { createLogger, ProgressLogger } from '../lib/logger.js';
import * as turf from '@turf/turf';

const logger = createLogger('process-analytics');

/**
 * Calculate analytics for a block
 */
function calculateBlockAnalytics(blockParcels) {
  const analytics = {
    total_parcels: blockParcels.length,
    residential_parcels: 0,
    commercial_parcels: 0,
    vacant_parcels: 0,
    total_buildings: 0,
    occupied_buildings: 0,
    vacant_buildings: 0,
    condemned_buildings: 0,
    recent_sales_count: 0,
    tax_delinquent_count: 0,
    owner_occupied_count: 0,
    investor_owned_count: 0,
    city_owned_count: 0,
    land_bank_owned_count: 0
  };

  // Arrays for calculating medians
  const assessedValues = [];
  const taxableValues = [];
  const lotSizes = [];
  const buildingSizes = [];
  const recentSalePrices = [];
  let lastSaleDate = null;

  // Calculate cutoff for "recent" sales (2 years)
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  for (const parcel of blockParcels) {
    const props = parcel.properties;

    // Property classification
    if (props.property_class?.startsWith('1')) {
      analytics.residential_parcels++;
    } else if (props.property_class?.startsWith('2')) {
      analytics.commercial_parcels++;
    }

    // Vacancy detection
    if (props.property_class === '336' || 
        props.use_code === 'VACANT' || 
        props.building_status === 'Vacant') {
      analytics.vacant_parcels++;
    }

    // Building status
    if (props.building_status) {
      analytics.total_buildings++;
      if (props.building_status === 'Occupied') {
        analytics.occupied_buildings++;
      } else if (props.building_status === 'Vacant') {
        analytics.vacant_buildings++;
      } else if (props.building_status === 'Condemned') {
        analytics.condemned_buildings++;
      }
    }

    // Sales activity
    if (props.sale_date) {
      const saleDate = new Date(props.sale_date);
      if (saleDate > twoYearsAgo) {
        analytics.recent_sales_count++;
        if (props.amt_sale_price > 0) {
          recentSalePrices.push(props.amt_sale_price);
        }
      }
      if (!lastSaleDate || saleDate > lastSaleDate) {
        lastSaleDate = saleDate;
      }
    }

    // Tax status
    if (props.tax_status === 'Delinquent' || props.tax_status_description === 'Delinquent') {
      analytics.tax_delinquent_count++;
    }

    // Ownership type
    const taxpayer = (props.taxpayer_1 || '').toLowerCase();
    if (props.pct_pre_claimed > 0) {
      analytics.owner_occupied_count++;
    } else if (taxpayer.includes('city of detroit')) {
      analytics.city_owned_count++;
    } else if (taxpayer.includes('land bank')) {
      analytics.land_bank_owned_count++;
    } else {
      analytics.investor_owned_count++;
    }

    // Values for medians
    if (props.amt_assessed_value > 0) {
      assessedValues.push(props.amt_assessed_value);
    }
    if (props.amt_taxable_value > 0) {
      taxableValues.push(props.amt_taxable_value);
    }
    if (props.total_square_footage > 0) {
      lotSizes.push(props.total_square_footage);
    }
    if (props.building_square_footage > 0) {
      buildingSizes.push(props.building_square_footage);
    }
  }

  // Calculate medians and averages
  if (assessedValues.length > 0) {
    analytics.avg_assessed_value = assessedValues.reduce((a, b) => a + b, 0) / assessedValues.length;
    analytics.median_assessed_value = median(assessedValues);
    analytics.total_assessed_value = assessedValues.reduce((a, b) => a + b, 0);
  }

  if (taxableValues.length > 0) {
    analytics.avg_taxable_value = taxableValues.reduce((a, b) => a + b, 0) / taxableValues.length;
    analytics.median_taxable_value = median(taxableValues);
  }

  if (lotSizes.length > 0) {
    analytics.avg_lot_size_sqft = lotSizes.reduce((a, b) => a + b, 0) / lotSizes.length;
  }

  if (buildingSizes.length > 0) {
    analytics.avg_building_size_sqft = buildingSizes.reduce((a, b) => a + b, 0) / buildingSizes.length;
  }

  if (recentSalePrices.length > 0) {
    analytics.recent_sales_avg_price = recentSalePrices.reduce((a, b) => a + b, 0) / recentSalePrices.length;
  }

  if (lastSaleDate) {
    analytics.last_sale_date = lastSaleDate.toISOString().split('T')[0];
  }

  // Calculate percentages
  if (analytics.total_parcels > 0) {
    analytics.tax_delinquent_percentage = (analytics.tax_delinquent_count / analytics.total_parcels) * 100;
  }

  return analytics;
}

/**
 * Calculate median value
 */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Process a single street
 */
async function processStreet(street, detroitAPI, run) {
  const streetName = street.properties.street_name;
  logger.info(`Processing street: ${streetName}`);

  try {
    // Fetch cross streets
    const crossStreets = await detroitAPI.fetchIntersectingStreets(
      street.geometry,
      street.properties.street_id
    );

    // Detect blocks
    const { blocks } = await detectBlocks([street], crossStreets);
    logger.info(`Detected ${blocks.length} blocks on ${streetName}`);

    // Process each block
    for (const block of blocks) {
      try {
        // Create block polygon
        const blockPolygon = turf.buffer(
          turf.feature(block.geometry),
          50,
          { units: 'meters' }
        );

        // Save block to database
        const savedBlock = await db.blocks.upsertBlock({
          block_id: block.blockId,
          street_name: block.streetName,
          from_cross_street: block.fromCrossStreet,
          to_cross_street: block.toCrossStreet,
          block_bounds: blockPolygon.geometry,
          center_point: block.center
        });

        // Fetch parcels in block
        const parcels = await detroitAPI.fetchParcelsInArea(blockPolygon.geometry);
        logger.debug(`Found ${parcels.length} parcels in block ${block.blockId}`);

        if (parcels.length > 0) {
          // Save parcels to database
          const parcelData = parcels.map(parcel => ({
            block_id: savedBlock.id,
            parcel_id: parcel.properties.parcel_id,
            address: parcel.properties.address,
            property_data: parcel.properties,
            geometry: parcel.geometry
          }));

          await db.parcels.insertParcels(parcelData);

          // Calculate analytics
          const analytics = calculateBlockAnalytics(parcels);
          
          // Save analytics
          await db.analytics.upsertAnalytics({
            block_id: savedBlock.id,
            ...analytics
          });
        }

        // Update run progress
        await db.runs.updateRun(run.id, {
          blocks_processed: run.blocks_processed + 1
        });
        run.blocks_processed++;

      } catch (error) {
        logger.error(`Error processing block ${block.blockId}`, {
          error: error.message,
          street: streetName
        });
        run.errors_count = (run.errors_count || 0) + 1;
      }
    }

  } catch (error) {
    logger.error(`Error processing street ${streetName}`, {
      error: error.message
    });
    throw error;
  }
}

/**
 * Main processing function
 */
async function main() {
  const isFullRun = process.argv.includes('--full');
  const runType = isFullRun ? 'full' : 'incremental';
  
  logger.info(`Starting ${runType} analytics run`);

  // Test API connections
  const detroitAPI = new DetroitAPIClient();
  const connectionTest = await detroitAPI.testConnections();
  logger.info('API connection test results:', connectionTest);

  // Start run tracking
  const run = await db.runs.startRun(runType);
  logger.info(`Created run ${run.id}`);

  try {
    // Get total street count for progress tracking
    const streetCount = await detroitAPI.getStreetCount();
    const progress = new ProgressLogger(streetCount, 'streets');

    let processedCount = 0;

    // Process streets in batches
    for await (const streetBatch of detroitAPI.fetchAllStreets()) {
      for (const street of streetBatch) {
        await processStreet(street, detroitAPI, run);
        processedCount++;
        progress.update(processedCount, street.properties.street_name);
      }

      // Update run progress
      await db.runs.updateRun(run.id, {
        parcels_processed: processedCount
      });
    }

    progress.complete('All streets processed');

    // Complete the run
    await db.runs.completeRun(run.id, {
      parcels_processed: processedCount,
      blocks_processed: run.blocks_processed,
      errors_count: run.errors_count || 0
    });

    logger.info('Analytics run completed successfully', {
      runId: run.id,
      streetsProcessed: processedCount,
      blocksProcessed: run.blocks_processed
    });

  } catch (error) {
    logger.error('Analytics run failed', {
      error: error.message,
      stack: error.stack
    });

    // Mark run as failed
    await db.runs.failRun(run.id, {
      error: error.message,
      stack: error.stack
    });

    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Unhandled error', error);
    process.exit(1);
  });
}