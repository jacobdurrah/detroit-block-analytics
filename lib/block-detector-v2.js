import { createLogger } from './logger.js';

const logger = createLogger('block-detector-v2');

/**
 * Parse a Detroit address into components
 * Handles various formats like:
 * - "1234 Woodward Ave"
 * - "15000 7 Mile Rd"
 * - "500 E Jefferson Ave"
 * - "1234-1236 Main St" (multi-unit)
 */
export function parseAddress(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  // Clean and normalize address
  const cleaned = address.trim().toUpperCase();
  
  // Regular expression to parse address components
  // Captures: number, directional prefix, street name, street type
  const addressRegex = /^(\d+)(?:-\d+)?\s+(?:(N|S|E|W|NORTH|SOUTH|EAST|WEST)\s+)?(.+?)\s+(ST|STREET|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|CT|COURT|PL|PLACE|WAY|PKWY|PARKWAY|HWY|HIGHWAY|CIR|CIRCLE|TER|TERRACE)\.?$/i;
  
  const match = cleaned.match(addressRegex);
  
  if (!match) {
    // Try simpler pattern for numbered streets like "7 Mile Rd"
    const numberedStreetRegex = /^(\d+)\s+(.+)$/;
    const simpleMatch = cleaned.match(numberedStreetRegex);
    
    if (simpleMatch) {
      return {
        houseNumber: parseInt(simpleMatch[1]),
        streetName: normalizeStreetName(simpleMatch[2]),
        fullStreet: simpleMatch[2],
        directional: null,
        streetType: null
      };
    }
    
    logger.debug(`Could not parse address: ${address}`);
    return null;
  }

  const [, houseNumber, directional, streetName, streetType] = match;
  
  return {
    houseNumber: parseInt(houseNumber),
    directional: directional ? directional.substring(0, 1) : null,
    streetName: normalizeStreetName((directional || '') + ' ' + streetName),
    streetType: streetType,
    fullStreet: (directional ? directional + ' ' : '') + streetName + ' ' + streetType
  };
}

/**
 * Normalize street name for consistent block IDs
 * - Remove extra spaces
 * - Convert to lowercase
 * - Replace spaces with underscores
 * - Remove special characters
 */
export function normalizeStreetName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, ''); // Remove special characters
}

/**
 * Generate block ID from parsed address
 * Uses 100-number blocks for residential areas
 * 
 * Examples:
 * - 1234 Woodward -> woodward_1200_1299
 * - 15050 7 Mile -> 7_mile_15000_15099
 * - 525 E Jefferson -> e_jefferson_500_599
 */
export function generateBlockIdFromAddress(parsedAddress, blockSize = 100) {
  if (!parsedAddress || !parsedAddress.houseNumber) {
    return null;
  }

  const { houseNumber, streetName } = parsedAddress;
  
  // Calculate block range
  const blockStart = Math.floor(houseNumber / blockSize) * blockSize;
  const blockEnd = blockStart + blockSize - 1;
  
  return `${streetName}_${blockStart}_${blockEnd}`;
}

/**
 * Detect natural block boundaries from a list of addresses
 * Looks for gaps in house numbering to identify cross streets
 */
export function detectBlockBoundaries(addresses, gapThreshold = 50) {
  if (!addresses || addresses.length === 0) {
    return [];
  }

  // Sort by house number
  const sorted = addresses
    .map(addr => ({
      ...addr,
      parsed: parseAddress(addr.address)
    }))
    .filter(addr => addr.parsed && addr.parsed.houseNumber)
    .sort((a, b) => a.parsed.houseNumber - b.parsed.houseNumber);

  if (sorted.length === 0) {
    return [];
  }

  const boundaries = [];
  let currentBlock = {
    start: sorted[0].parsed.houseNumber,
    end: sorted[0].parsed.houseNumber,
    addresses: [sorted[0]]
  };

  for (let i = 1; i < sorted.length; i++) {
    const prevNumber = sorted[i - 1].parsed.houseNumber;
    const currNumber = sorted[i].parsed.houseNumber;
    const gap = currNumber - prevNumber;

    if (gap > gapThreshold) {
      // Found a gap - end current block and start new one
      currentBlock.end = prevNumber;
      boundaries.push(currentBlock);
      
      currentBlock = {
        start: currNumber,
        end: currNumber,
        addresses: [sorted[i]]
      };
    } else {
      // Continue current block
      currentBlock.end = currNumber;
      currentBlock.addresses.push(sorted[i]);
    }
  }

  // Add the last block
  boundaries.push(currentBlock);

  return boundaries;
}

/**
 * Process a list of parcels and assign block IDs
 * Groups parcels by street and assigns consistent block IDs
 */
export function assignBlockIds(parcels, options = {}) {
  const {
    blockSize = 100,
    useNaturalBoundaries = false,
    gapThreshold = 50
  } = options;

  const results = [];
  const blockStats = new Map();
  
  // Group parcels by street
  const streetGroups = new Map();
  
  for (const parcel of parcels) {
    const parsed = parseAddress(parcel.address);
    
    if (!parsed) {
      results.push({
        ...parcel,
        block_id: null,
        parse_error: true
      });
      continue;
    }

    const streetKey = parsed.streetName;
    
    if (!streetGroups.has(streetKey)) {
      streetGroups.set(streetKey, []);
    }
    
    streetGroups.get(streetKey).push({
      ...parcel,
      parsed
    });
  }

  // Process each street
  for (const [streetName, streetParcels] of streetGroups) {
    if (useNaturalBoundaries) {
      // Detect natural boundaries based on gaps
      const boundaries = detectBlockBoundaries(streetParcels, gapThreshold);
      
      for (const boundary of boundaries) {
        // Create block ID for this boundary
        const blockStart = Math.floor(boundary.start / blockSize) * blockSize;
        const blockEnd = blockStart + blockSize - 1;
        const blockId = `${streetName}_${blockStart}_${blockEnd}`;
        
        // Assign to all addresses in this boundary
        for (const addr of boundary.addresses) {
          results.push({
            ...addr,
            block_id: blockId,
            block_method: 'natural_boundary'
          });
          
          // Update stats
          if (!blockStats.has(blockId)) {
            blockStats.set(blockId, {
              count: 0,
              minNumber: Infinity,
              maxNumber: -Infinity,
              streetName: addr.parsed.fullStreet
            });
          }
          
          const stats = blockStats.get(blockId);
          stats.count++;
          stats.minNumber = Math.min(stats.minNumber, addr.parsed.houseNumber);
          stats.maxNumber = Math.max(stats.maxNumber, addr.parsed.houseNumber);
        }
      }
    } else {
      // Use fixed block sizes
      for (const parcel of streetParcels) {
        const blockId = generateBlockIdFromAddress(parcel.parsed, blockSize);
        
        results.push({
          ...parcel,
          block_id: blockId,
          block_method: 'fixed_size'
        });
        
        // Update stats
        if (!blockStats.has(blockId)) {
          blockStats.set(blockId, {
            count: 0,
            minNumber: Infinity,
            maxNumber: -Infinity,
            streetName: parcel.parsed.fullStreet
          });
        }
        
        const stats = blockStats.get(blockId);
        stats.count++;
        stats.minNumber = Math.min(stats.minNumber, parcel.parsed.houseNumber);
        stats.maxNumber = Math.max(stats.maxNumber, parcel.parsed.houseNumber);
      }
    }
  }

  return {
    parcels: results,
    blockStats: Object.fromEntries(blockStats),
    summary: {
      totalParcels: parcels.length,
      successfullyAssigned: results.filter(r => r.block_id).length,
      parseErrors: results.filter(r => r.parse_error).length,
      uniqueBlocks: blockStats.size,
      uniqueStreets: streetGroups.size
    }
  };
}

/**
 * Validate block assignments
 * Checks for common issues like split blocks, gaps, etc.
 */
export function validateBlockAssignments(assignments) {
  const issues = [];
  const { blockStats } = assignments;
  
  for (const [blockId, stats] of Object.entries(blockStats)) {
    // Check for large gaps within blocks
    const numberRange = stats.maxNumber - stats.minNumber;
    const expectedCount = Math.floor(numberRange / 2) + 1; // Assuming every other number
    
    if (stats.count < expectedCount * 0.3) {
      issues.push({
        type: 'sparse_block',
        blockId,
        message: `Block ${blockId} has only ${stats.count} parcels but spans ${numberRange} numbers`,
        severity: 'warning'
      });
    }
    
    // Check for very small blocks
    if (stats.count < 3) {
      issues.push({
        type: 'small_block',
        blockId,
        message: `Block ${blockId} has only ${stats.count} parcels`,
        severity: 'info'
      });
    }
  }
  
  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}

export default {
  parseAddress,
  normalizeStreetName,
  generateBlockIdFromAddress,
  detectBlockBoundaries,
  assignBlockIds,
  validateBlockAssignments
};