import * as turf from '@turf/turf';
import { createLogger } from './logger.js';

const logger = createLogger('block-detector');

/**
 * Block Detection Algorithm
 * 
 * This module implements the logic to detect street blocks (segments between cross streets)
 * using spatial analysis of street geometries and parcel locations.
 */

/**
 * Normalize street name for consistent block IDs
 */
export function normalizeStreetName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Generate block ID from street names
 */
export function generateBlockId(streetName, fromCross, toCross) {
  const normalized = [streetName, fromCross, toCross]
    .map(normalizeStreetName)
    .filter(n => n.length > 0);
  
  return normalized.join('_');
}

/**
 * Find intersection points between street geometries
 */
export function findIntersections(mainStreet, crossStreets) {
  const intersections = [];
  
  for (const crossStreet of crossStreets) {
    try {
      // Find intersection point(s)
      const intersection = turf.lineIntersect(mainStreet, crossStreet);
      
      if (intersection.features.length > 0) {
        // Use the first intersection point
        const point = intersection.features[0];
        
        intersections.push({
          point: point.geometry,
          crossStreet: crossStreet.properties.street_name,
          crossStreetId: crossStreet.properties.street_id,
          coordinates: point.geometry.coordinates
        });
      }
    } catch (error) {
      logger.warn('Error finding intersection', {
        mainStreet: mainStreet.properties.street_name,
        crossStreet: crossStreet.properties?.street_name,
        error: error.message
      });
    }
  }
  
  return intersections;
}

/**
 * Sort intersections along the street line
 */
export function sortIntersectionsAlongStreet(street, intersections) {
  if (intersections.length === 0) return [];
  
  // Get the street line
  const line = street.geometry;
  
  // Calculate distance along line for each intersection
  const intersectionsWithDistance = intersections.map(intersection => {
    const pointOnLine = turf.nearestPointOnLine(line, intersection.point);
    return {
      ...intersection,
      distance: pointOnLine.properties.dist || 0,
      location: pointOnLine.properties.location || 0
    };
  });
  
  // Sort by distance along line
  return intersectionsWithDistance.sort((a, b) => a.location - b.location);
}

/**
 * Create block segments from sorted intersections
 */
export function createBlockSegments(street, sortedIntersections) {
  const segments = [];
  const streetName = street.properties.street_name;
  
  if (sortedIntersections.length === 0) {
    // No intersections - entire street is one block
    const blockId = generateBlockId(streetName, 'start', 'end');
    segments.push({
      blockId,
      streetName,
      fromCrossStreet: 'start',
      toCrossStreet: 'end',
      geometry: street.geometry,
      bounds: turf.bbox(street)
    });
    return segments;
  }
  
  // Create segments between intersections
  for (let i = 0; i < sortedIntersections.length - 1; i++) {
    const fromIntersection = sortedIntersections[i];
    const toIntersection = sortedIntersections[i + 1];
    
    try {
      // Create line segment between intersections
      const segment = turf.lineSlice(
        fromIntersection.point,
        toIntersection.point,
        street
      );
      
      const blockId = generateBlockId(
        streetName,
        fromIntersection.crossStreet,
        toIntersection.crossStreet
      );
      
      segments.push({
        blockId,
        streetName,
        fromCrossStreet: fromIntersection.crossStreet,
        toCrossStreet: toIntersection.crossStreet,
        geometry: segment.geometry,
        bounds: turf.bbox(segment),
        center: turf.center(segment).geometry
      });
    } catch (error) {
      logger.warn('Error creating block segment', {
        street: streetName,
        from: fromIntersection.crossStreet,
        to: toIntersection.crossStreet,
        error: error.message
      });
    }
  }
  
  // Handle segments before first and after last intersection
  if (sortedIntersections.length > 0) {
    // Segment from street start to first intersection
    const firstIntersection = sortedIntersections[0];
    const startPoint = turf.point(street.geometry.coordinates[0]);
    
    if (turf.distance(startPoint, firstIntersection.point) > 0.01) { // > 10 meters
      try {
        const startSegment = turf.lineSlice(startPoint, firstIntersection.point, street);
        const blockId = generateBlockId(streetName, 'start', firstIntersection.crossStreet);
        
        segments.unshift({
          blockId,
          streetName,
          fromCrossStreet: 'start',
          toCrossStreet: firstIntersection.crossStreet,
          geometry: startSegment.geometry,
          bounds: turf.bbox(startSegment),
          center: turf.center(startSegment).geometry
        });
      } catch (error) {
        logger.warn('Error creating start segment', { error: error.message });
      }
    }
    
    // Segment from last intersection to street end
    const lastIntersection = sortedIntersections[sortedIntersections.length - 1];
    const endPoint = turf.point(street.geometry.coordinates[street.geometry.coordinates.length - 1]);
    
    if (turf.distance(lastIntersection.point, endPoint) > 0.01) { // > 10 meters
      try {
        const endSegment = turf.lineSlice(lastIntersection.point, endPoint, street);
        const blockId = generateBlockId(streetName, lastIntersection.crossStreet, 'end');
        
        segments.push({
          blockId,
          streetName,
          fromCrossStreet: lastIntersection.crossStreet,
          toCrossStreet: 'end',
          geometry: endSegment.geometry,
          bounds: turf.bbox(endSegment),
          center: turf.center(endSegment).geometry
        });
      } catch (error) {
        logger.warn('Error creating end segment', { error: error.message });
      }
    }
  }
  
  return segments;
}

/**
 * Create block polygon from street segment
 */
export function createBlockPolygon(segment, bufferDistance = 50) {
  try {
    // Buffer the line segment to create a polygon
    const buffered = turf.buffer(segment, bufferDistance, { units: 'meters' });
    
    return buffered.geometry;
  } catch (error) {
    logger.warn('Error creating block polygon', {
      blockId: segment.blockId,
      error: error.message
    });
    return null;
  }
}

/**
 * Assign parcels to blocks based on spatial containment
 */
export function assignParcelsToBlocks(parcels, blocks) {
  const blockParcels = new Map();
  
  // Initialize empty arrays for each block
  blocks.forEach(block => {
    blockParcels.set(block.blockId, []);
  });
  
  // Create spatial index of blocks for faster lookup
  const blockPolygons = blocks.map(block => {
    const polygon = createBlockPolygon(block);
    return {
      ...block,
      polygon: polygon ? turf.feature(polygon) : null
    };
  }).filter(b => b.polygon !== null);
  
  // Assign each parcel to a block
  for (const parcel of parcels) {
    try {
      // Get parcel centroid
      const parcelPoint = turf.centroid(parcel);
      
      // Find which block contains this parcel
      for (const block of blockPolygons) {
        if (turf.booleanPointInPolygon(parcelPoint, block.polygon)) {
          blockParcels.get(block.blockId).push(parcel);
          break; // Parcel can only be in one block
        }
      }
    } catch (error) {
      logger.warn('Error assigning parcel to block', {
        parcelId: parcel.properties?.parcel_id,
        error: error.message
      });
    }
  }
  
  return blockParcels;
}

/**
 * Main block detection function
 */
export async function detectBlocks(streets, crossStreets, parcels = []) {
  const allBlocks = [];
  const blockParcelsMap = new Map();
  
  logger.info(`Starting block detection for ${streets.length} streets`);
  
  for (const street of streets) {
    try {
      // Find intersections with cross streets
      const intersections = findIntersections(street, crossStreets);
      
      // Sort intersections along the street
      const sortedIntersections = sortIntersectionsAlongStreet(street, intersections);
      
      // Create block segments
      const segments = createBlockSegments(street, sortedIntersections);
      
      // Add to results
      allBlocks.push(...segments);
      
      logger.debug(`Created ${segments.length} blocks for ${street.properties.street_name}`, {
        intersections: intersections.length
      });
    } catch (error) {
      logger.error('Error processing street', {
        street: street.properties?.street_name,
        error: error.message
      });
    }
  }
  
  // If parcels provided, assign them to blocks
  if (parcels.length > 0) {
    logger.info(`Assigning ${parcels.length} parcels to blocks`);
    const assignments = assignParcelsToBlocks(parcels, allBlocks);
    
    // Merge with results
    allBlocks.forEach(block => {
      const blockParcels = assignments.get(block.blockId) || [];
      blockParcelsMap.set(block.blockId, blockParcels);
    });
  }
  
  logger.info(`Block detection complete: ${allBlocks.length} blocks detected`);
  
  return {
    blocks: allBlocks,
    blockParcels: blockParcelsMap
  };
}

export default {
  normalizeStreetName,
  generateBlockId,
  findIntersections,
  sortIntersectionsAlongStreet,
  createBlockSegments,
  createBlockPolygon,
  assignParcelsToBlocks,
  detectBlocks
};