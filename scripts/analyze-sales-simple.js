#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAddress, assignBlockIds } from '../lib/block-detector-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SALES_CSV_PATH = path.join(__dirname, '../data/Property_Sales_Detroit_-4801866508954663892.csv');

async function analyzeSalesData() {
  console.log('Analyzing Detroit Sales Data (Simple Parser)...\n');
  
  const fileStream = fs.createReadStream(SALES_CSV_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let headers = null;
  const sampleData = [];
  let recordsWithCoords = 0;
  let recordsWithoutCoords = 0;
  let parseErrors = 0;
  
  // Price ranges
  const priceRanges = {
    '$0': 0,
    '$1-$1,000': 0,
    '$1,001-$10,000': 0,
    '$10,001-$50,000': 0,
    '$50,001-$100,000': 0,
    '$100,001-$250,000': 0,
    '$250,000+': 0
  };
  
  // Year counts
  const yearCounts = {};
  
  // Street counts
  const streetCounts = new Map();

  for await (const line of rl) {
    lineCount++;
    
    if (lineCount === 1) {
      // Parse headers
      headers = line.split(',').map(h => h.replace(/[^a-zA-Z0-9\s]/g, '').trim());
      continue;
    }
    
    if (lineCount > 10000) break; // Analyze first 10k records
    
    try {
      const values = line.split(',');
      const record = {};
      
      headers.forEach((header, i) => {
        record[header] = values[i] || '';
      });
      
      // Check for coordinates
      const hasCoords = record.x && record.y && record.x !== '' && record.y !== '';
      if (hasCoords) {
        recordsWithCoords++;
      } else {
        recordsWithoutCoords++;
      }
      
      // Parse address
      const address = record['Street Address'];
      if (address) {
        const parsed = parseAddress(address);
        if (parsed) {
          const streetName = parsed.streetName;
          streetCounts.set(streetName, (streetCounts.get(streetName) || 0) + 1);
        } else {
          parseErrors++;
        }
      }
      
      // Analyze price
      const price = parseFloat(record['Sale Price']) || 0;
      if (price === 0) priceRanges['$0']++;
      else if (price <= 1000) priceRanges['$1-$1,000']++;
      else if (price <= 10000) priceRanges['$1,001-$10,000']++;
      else if (price <= 50000) priceRanges['$10,001-$50,000']++;
      else if (price <= 100000) priceRanges['$50,001-$100,000']++;
      else if (price <= 250000) priceRanges['$100,001-$250,000']++;
      else priceRanges['$250,000+']++;
      
      // Analyze date
      const saleDate = record['Sale Date'];
      if (saleDate) {
        const date = new Date(saleDate);
        if (!isNaN(date)) {
          const year = date.getFullYear();
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
      }
      
      // Save sample for block testing
      if (sampleData.length < 100 && hasCoords && address) {
        sampleData.push({
          parcel_id: record['Parcel Number'],
          address: address,
          lat: parseFloat(record.y),
          lng: parseFloat(record.x),
          sale_price: price,
          sale_date: saleDate
        });
      }
      
    } catch (error) {
      // Skip problematic lines
      parseErrors++;
    }
  }

  // Display results
  console.log(`Analyzed ${lineCount - 1} records\n`);
  
  console.log('Coordinate Coverage:');
  console.log(`  With coordinates: ${recordsWithCoords} (${((recordsWithCoords / (lineCount - 1)) * 100).toFixed(1)}%)`);
  console.log(`  Without coordinates: ${recordsWithoutCoords} (${((recordsWithoutCoords / (lineCount - 1)) * 100).toFixed(1)}%)`);
  
  console.log('\nPrice Distribution:');
  const total = lineCount - 1;
  for (const [range, count] of Object.entries(priceRanges)) {
    const percentage = ((count / total) * 100).toFixed(1);
    console.log(`  ${range}: ${count} (${percentage}%)`);
  }
  
  console.log('\nSales by Year:');
  const sortedYears = Object.entries(yearCounts).sort(([a], [b]) => b - a).slice(0, 10);
  sortedYears.forEach(([year, count]) => {
    console.log(`  ${year}: ${count}`);
  });
  
  console.log('\nTop 10 Streets by Sales:');
  const topStreets = Array.from(streetCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  topStreets.forEach(([street, count]) => {
    console.log(`  ${street}: ${count} sales`);
  });
  
  console.log('\nAddress Parsing:');
  console.log(`  Parse errors: ${parseErrors}`);
  
  // Test block assignment
  if (sampleData.length > 0) {
    console.log('\nBlock Assignment Test:');
    const { summary } = assignBlockIds(sampleData);
    console.log(`  Sample size: ${sampleData.length} parcels`);
    console.log(`  Successfully assigned: ${summary.successfullyAssigned}`);
    console.log(`  Unique blocks: ${summary.uniqueBlocks}`);
    console.log(`  Unique streets: ${summary.uniqueStreets}`);
    
    console.log('\n  Sample assignments:');
    const assigned = assignBlockIds(sampleData.slice(0, 5));
    assigned.parcels.forEach(p => {
      console.log(`    ${p.address} -> ${p.block_id || 'NO BLOCK'}`);
    });
  }
  
  console.log('\n✅ Analysis complete!');
  console.log('\nFile appears to have some records without coordinates.');
  console.log('The processing script will handle these appropriately.');
}

analyzeSalesData().catch(console.error);