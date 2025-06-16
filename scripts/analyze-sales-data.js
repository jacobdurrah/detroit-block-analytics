#!/usr/bin/env node

import { loadCSV, getCSVStats } from '../lib/csv-loader.js';
import { parseAddress, assignBlockIds } from '../lib/block-detector-v2.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SALES_CSV_PATH = path.join(__dirname, '../data/Property_Sales_Detroit_-4801866508954663892.csv');

async function analyzeSalesData() {
  console.log('Analyzing Detroit Sales Data...\n');
  
  // Get file stats
  const stats = await getCSVStats(SALES_CSV_PATH);
  console.log('File Statistics:');
  console.log(`  File: ${path.basename(stats.filePath)}`);
  console.log(`  Size: ${stats.fileSizeMB} MB`);
  console.log(`  Estimated rows: ${stats.estimatedTotalLines.toLocaleString()}`);
  console.log(`  Headers: ${stats.headers.join(', ')}`);
  console.log();
  
  // Load a sample of data
  console.log('Loading sample data (first 1000 records)...');
  const sampleData = await loadCSV(SALES_CSV_PATH, { 
    to_line: 1000,
    relax_record_length: true,
    skip_records_with_error: true
  });
  
  // Analyze address formats
  console.log('\nAddress Format Analysis:');
  const addressFormats = new Map();
  const parseErrors = [];
  
  for (const row of sampleData) {
    const address = row['Street Address'];
    if (!address) continue;
    
    const parsed = parseAddress(address);
    if (parsed) {
      const format = `${parsed.directional ? 'DIR ' : ''}NUMBER STREET TYPE`;
      addressFormats.set(format, (addressFormats.get(format) || 0) + 1);
    } else {
      parseErrors.push(address);
    }
  }
  
  console.log('  Address formats found:');
  for (const [format, count] of addressFormats) {
    console.log(`    ${format}: ${count}`);
  }
  console.log(`  Parse errors: ${parseErrors.length}`);
  if (parseErrors.length > 0) {
    console.log('  Sample parse errors:');
    parseErrors.slice(0, 5).forEach(addr => {
      console.log(`    - "${addr}"`);
    });
  }
  
  // Analyze price ranges
  console.log('\nSale Price Analysis:');
  const prices = sampleData
    .map(row => parseFloat(row['Sale Price']) || 0)
    .filter(price => price > 0);
  
  const priceRanges = {
    '$0': 0,
    '$1-$1,000': 0,
    '$1,001-$10,000': 0,
    '$10,001-$50,000': 0,
    '$50,001-$100,000': 0,
    '$100,001-$250,000': 0,
    '$250,000+': 0
  };
  
  prices.forEach(price => {
    if (price === 0) priceRanges['$0']++;
    else if (price <= 1000) priceRanges['$1-$1,000']++;
    else if (price <= 10000) priceRanges['$1,001-$10,000']++;
    else if (price <= 50000) priceRanges['$10,001-$50,000']++;
    else if (price <= 100000) priceRanges['$50,001-$100,000']++;
    else if (price <= 250000) priceRanges['$100,001-$250,000']++;
    else priceRanges['$250,000+']++;
  });
  
  console.log('  Price distribution:');
  for (const [range, count] of Object.entries(priceRanges)) {
    const percentage = ((count / sampleData.length) * 100).toFixed(1);
    console.log(`    ${range}: ${count} (${percentage}%)`);
  }
  
  // Analyze date ranges
  console.log('\nSale Date Analysis:');
  const dates = sampleData
    .map(row => row['Sale Date'])
    .filter(date => date)
    .map(date => new Date(date))
    .filter(date => !isNaN(date));
  
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    console.log(`  Date range: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`);
    
    // Count by year
    const yearCounts = {};
    dates.forEach(date => {
      const year = date.getFullYear();
      yearCounts[year] = (yearCounts[year] || 0) + 1;
    });
    
    console.log('  Sales by year (sample):');
    Object.entries(yearCounts)
      .sort(([a], [b]) => b - a)
      .slice(0, 5)
      .forEach(([year, count]) => {
        console.log(`    ${year}: ${count}`);
      });
  }
  
  // Test block assignment
  console.log('\nBlock Assignment Test:');
  const testParcels = sampleData
    .filter(row => row['Street Address'] && row['x'] && row['y'])
    .slice(0, 100)
    .map(row => ({
      parcel_id: row['Parcel Number'],
      address: row['Street Address'],
      lat: parseFloat(row['y']),
      lng: parseFloat(row['x'])
    }));
  
  const { parcels, summary } = assignBlockIds(testParcels);
  console.log(`  Test sample: ${testParcels.length} parcels`);
  console.log(`  Successfully assigned: ${summary.successfullyAssigned}`);
  console.log(`  Parse errors: ${summary.parseErrors}`);
  console.log(`  Unique blocks: ${summary.uniqueBlocks}`);
  console.log(`  Unique streets: ${summary.uniqueStreets}`);
  
  // Show sample blocks
  const sampleBlocks = Object.entries(summary)
    .filter(([key]) => key.startsWith('block_'))
    .slice(0, 5);
  
  if (parcels.length > 0) {
    console.log('\n  Sample block assignments:');
    parcels.slice(0, 5).forEach(p => {
      console.log(`    ${p.address} -> ${p.block_id || 'NO BLOCK'}`);
    });
  }
  
  // Coordinate coverage
  console.log('\nCoordinate Coverage:');
  const hasCoords = sampleData.filter(row => row['x'] && row['y']).length;
  const coordPercentage = ((hasCoords / sampleData.length) * 100).toFixed(1);
  console.log(`  Records with coordinates: ${hasCoords} (${coordPercentage}%)`);
  
  if (hasCoords > 0) {
    const coords = sampleData
      .filter(row => row['x'] && row['y'])
      .map(row => ({
        lat: parseFloat(row['y']),
        lng: parseFloat(row['x'])
      }));
    
    const bounds = {
      minLat: Math.min(...coords.map(c => c.lat)),
      maxLat: Math.max(...coords.map(c => c.lat)),
      minLng: Math.min(...coords.map(c => c.lng)),
      maxLng: Math.max(...coords.map(c => c.lng))
    };
    
    console.log(`  Bounding box:`);
    console.log(`    Latitude: ${bounds.minLat.toFixed(6)} to ${bounds.maxLat.toFixed(6)}`);
    console.log(`    Longitude: ${bounds.minLng.toFixed(6)} to ${bounds.maxLng.toFixed(6)}`);
  }
  
  console.log('\n✅ Analysis complete!');
  console.log('\nTo process the full dataset, run:');
  console.log('  npm run process:sales');
}

// Run analysis
analyzeSalesData().catch(console.error);