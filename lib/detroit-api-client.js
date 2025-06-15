import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { setTimeout } from 'timers/promises';
import dotenv from 'dotenv';

dotenv.config();

// API endpoints from environment
const API_ENDPOINTS = {
  parcels: process.env.PARCELS_API,
  addresses: process.env.ADDRESSES_API,
  buildings: process.env.BUILDINGS_API,
  streets: process.env.STREETS_API,
  geocoder: process.env.GEOCODER_API
};

// Configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 500;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 1000;
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS) || 5;

// Create a rate limiter
const limit = pLimit(CONCURRENT_REQUESTS);

/**
 * Generic fetch with retry logic
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying request (${MAX_RETRIES - retries + 1}/${MAX_RETRIES}): ${url}`);
      await setTimeout(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * Build query URL with parameters
 */
function buildQueryUrl(baseUrl, params) {
  const url = new URL(baseUrl + '/query');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

/**
 * Detroit API Client
 */
export class DetroitAPIClient {
  /**
   * Fetch all parcels with pagination
   */
  async *fetchAllParcels(whereClause = '1=1') {
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const params = {
        where: whereClause,
        outFields: '*',
        returnGeometry: true,
        f: 'geojson',
        resultOffset: offset,
        resultRecordCount: BATCH_SIZE,
        orderByFields: 'parcel_id'
      };
      
      const url = buildQueryUrl(API_ENDPOINTS.parcels, params);
      const data = await fetchWithRetry(url);
      
      if (data.features && data.features.length > 0) {
        yield data.features;
        offset += data.features.length;
        hasMore = data.features.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  /**
   * Fetch parcels for a specific area (polygon)
   */
  async fetchParcelsInArea(geometry, additionalWhere = '1=1') {
    const params = {
      geometry: JSON.stringify(geometry),
      geometryType: 'esriGeometryPolygon',
      spatialRel: 'esriSpatialRelIntersects',
      where: additionalWhere,
      outFields: '*',
      returnGeometry: true,
      f: 'geojson'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.parcels, params);
    const data = await fetchWithRetry(url);
    
    return data.features || [];
  }

  /**
   * Fetch all streets with pagination
   */
  async *fetchAllStreets(whereClause = '1=1') {
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const params = {
        where: whereClause,
        outFields: '*',
        returnGeometry: true,
        f: 'geojson',
        resultOffset: offset,
        resultRecordCount: BATCH_SIZE,
        orderByFields: 'street_id'
      };
      
      const url = buildQueryUrl(API_ENDPOINTS.streets, params);
      const data = await fetchWithRetry(url);
      
      if (data.features && data.features.length > 0) {
        yield data.features;
        offset += data.features.length;
        hasMore = data.features.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  /**
   * Fetch streets by name
   */
  async fetchStreetsByName(streetName) {
    const params = {
      where: `UPPER(street_name) LIKE UPPER('%${streetName}%')`,
      outFields: '*',
      returnGeometry: true,
      f: 'geojson'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.streets, params);
    const data = await fetchWithRetry(url);
    
    return data.features || [];
  }

  /**
   * Fetch intersecting streets for block detection
   */
  async fetchIntersectingStreets(streetGeometry, excludeStreetId) {
    const params = {
      geometry: JSON.stringify(streetGeometry),
      geometryType: 'esriGeometryPolyline',
      spatialRel: 'esriSpatialRelIntersects',
      where: `street_id <> ${excludeStreetId}`,
      outFields: '*',
      returnGeometry: true,
      f: 'geojson'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.streets, params);
    const data = await fetchWithRetry(url);
    
    return data.features || [];
  }

  /**
   * Fetch buildings in area
   */
  async fetchBuildingsInArea(geometry) {
    const params = {
      geometry: JSON.stringify(geometry),
      geometryType: 'esriGeometryPolygon',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: true,
      f: 'geojson'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.buildings, params);
    const data = await fetchWithRetry(url);
    
    return data.features || [];
  }

  /**
   * Batch fetch parcels by IDs
   */
  async fetchParcelsByIds(parcelIds) {
    // Split into chunks to avoid URL length limits
    const chunks = [];
    const chunkSize = 50;
    
    for (let i = 0; i < parcelIds.length; i += chunkSize) {
      chunks.push(parcelIds.slice(i, i + chunkSize));
    }
    
    // Fetch all chunks in parallel with rate limiting
    const results = await Promise.all(
      chunks.map(chunk => 
        limit(async () => {
          const whereClause = chunk.map(id => `parcel_id = '${id}'`).join(' OR ');
          const params = {
            where: whereClause,
            outFields: '*',
            returnGeometry: true,
            f: 'geojson'
          };
          
          const url = buildQueryUrl(API_ENDPOINTS.parcels, params);
          const data = await fetchWithRetry(url);
          return data.features || [];
        })
      )
    );
    
    // Flatten results
    return results.flat();
  }

  /**
   * Get parcel count (for progress tracking)
   */
  async getParcelCount(whereClause = '1=1') {
    const params = {
      where: whereClause,
      returnCountOnly: true,
      f: 'json'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.parcels, params);
    const data = await fetchWithRetry(url);
    
    return data.count || 0;
  }

  /**
   * Get street count
   */
  async getStreetCount(whereClause = '1=1') {
    const params = {
      where: whereClause,
      returnCountOnly: true,
      f: 'json'
    };
    
    const url = buildQueryUrl(API_ENDPOINTS.streets, params);
    const data = await fetchWithRetry(url);
    
    return data.count || 0;
  }

  /**
   * Geocode an address
   */
  async geocodeAddress(address) {
    const url = new URL(API_ENDPOINTS.geocoder + '/findAddressCandidates');
    url.searchParams.append('singleLine', address);
    url.searchParams.append('outFields', '*');
    url.searchParams.append('f', 'json');
    
    const data = await fetchWithRetry(url.toString());
    
    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0];
    }
    return null;
  }

  /**
   * Test API connectivity
   */
  async testConnections() {
    const results = {};
    
    for (const [name, endpoint] of Object.entries(API_ENDPOINTS)) {
      try {
        const url = endpoint + '?f=json';
        const response = await fetch(url);
        results[name] = {
          success: response.ok,
          status: response.status,
          endpoint
        };
      } catch (error) {
        results[name] = {
          success: false,
          error: error.message,
          endpoint
        };
      }
    }
    
    return results;
  }
}

// Export singleton instance
export default new DetroitAPIClient();