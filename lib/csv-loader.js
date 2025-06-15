import fs from 'fs';
import { parse } from 'csv-parse';
import { createLogger } from './logger.js';

const logger = createLogger('csv-loader');

/**
 * Stream parse a CSV file with progress tracking
 * @param {string} filePath - Path to CSV file
 * @param {Object} options - Parser options
 * @returns {Promise<Array>} Parsed records
 */
export async function loadCSV(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const records = [];
    let recordCount = 0;
    
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: true,
      cast_date: true,
      ...options
    });
    
    const stream = fs.createReadStream(filePath);
    
    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
        recordCount++;
        
        if (recordCount % 10000 === 0) {
          logger.info(`Processed ${recordCount} records from ${filePath}`);
        }
      }
    });
    
    parser.on('error', function(err) {
      logger.error(`Error parsing CSV: ${err.message}`);
      reject(err);
    });
    
    parser.on('end', function() {
      logger.info(`Completed loading ${recordCount} records from ${filePath}`);
      resolve(records);
    });
    
    stream.pipe(parser);
  });
}

/**
 * Stream process a large CSV file in chunks
 * @param {string} filePath - Path to CSV file
 * @param {Function} processChunk - Function to process each chunk
 * @param {number} chunkSize - Number of records per chunk
 * @param {Object} options - Parser options
 */
export async function processCSVInChunks(filePath, processChunk, chunkSize = 1000, options = {}) {
  return new Promise((resolve, reject) => {
    let chunk = [];
    let totalProcessed = 0;
    
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: true,
      ...options
    });
    
    const stream = fs.createReadStream(filePath);
    
    parser.on('readable', async function() {
      let record;
      while ((record = parser.read()) !== null) {
        chunk.push(record);
        
        if (chunk.length >= chunkSize) {
          // Pause the stream while processing
          parser.pause();
          
          try {
            await processChunk(chunk, totalProcessed);
            totalProcessed += chunk.length;
            chunk = [];
            
            logger.info(`Processed ${totalProcessed} records`);
            
            // Resume the stream
            parser.resume();
          } catch (error) {
            parser.destroy();
            reject(error);
          }
        }
      }
    });
    
    parser.on('error', function(err) {
      logger.error(`Error parsing CSV: ${err.message}`);
      reject(err);
    });
    
    parser.on('end', async function() {
      // Process any remaining records
      if (chunk.length > 0) {
        try {
          await processChunk(chunk, totalProcessed);
          totalProcessed += chunk.length;
        } catch (error) {
          reject(error);
          return;
        }
      }
      
      logger.info(`Completed processing ${totalProcessed} total records`);
      resolve(totalProcessed);
    });
    
    stream.pipe(parser);
  });
}

/**
 * Get CSV file stats
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Object>} File stats including estimated row count
 */
export async function getCSVStats(filePath) {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    let headerLine = null;
    
    const stream = fs.createReadStream(filePath);
    const parser = parse({
      to_line: 100 // Sample first 100 lines
    });
    
    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        if (lineCount === 0) {
          headerLine = record;
        }
        lineCount++;
      }
    });
    
    parser.on('end', function() {
      const stats = fs.statSync(filePath);
      const avgBytesPerLine = stats.size / Math.max(lineCount - 1, 1);
      const estimatedLines = Math.floor(stats.size / avgBytesPerLine);
      
      resolve({
        filePath,
        fileSize: stats.size,
        fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
        headers: headerLine,
        sampleLines: lineCount,
        estimatedTotalLines: estimatedLines,
        lastModified: stats.mtime
      });
    });
    
    parser.on('error', reject);
    
    stream.pipe(parser);
  });
}

/**
 * Validate CSV headers
 * @param {string} filePath - Path to CSV file
 * @param {Array<string>} requiredHeaders - Required header names
 * @returns {Promise<Object>} Validation result
 */
export async function validateCSVHeaders(filePath, requiredHeaders) {
  return new Promise((resolve, reject) => {
    const parser = parse({
      to_line: 1
    });
    
    const stream = fs.createReadStream(filePath);
    
    parser.on('readable', function() {
      const headers = parser.read();
      if (headers) {
        const headerSet = new Set(headers.map(h => h.toLowerCase()));
        const missing = requiredHeaders.filter(h => !headerSet.has(h.toLowerCase()));
        
        resolve({
          valid: missing.length === 0,
          headers: headers,
          missing: missing,
          extra: headers.filter(h => !requiredHeaders.map(r => r.toLowerCase()).includes(h.toLowerCase()))
        });
      }
    });
    
    parser.on('error', reject);
    
    stream.pipe(parser);
  });
}

export default {
  loadCSV,
  processCSVInChunks,
  getCSVStats,
  validateCSVHeaders
};