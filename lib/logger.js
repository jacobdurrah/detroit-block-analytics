import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let output = `${timestamp} ${level}: ${message}`;
    if (Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta)}`;
    }
    return output;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'detroit-block-analytics' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create child loggers for specific modules
export function createLogger(module) {
  return logger.child({ module });
}

// Progress logger for long-running operations
export class ProgressLogger {
  constructor(total, module = 'progress') {
    this.total = total;
    this.current = 0;
    this.lastPercentage = -1;
    this.startTime = Date.now();
    this.logger = createLogger(module);
  }

  update(current, message = '') {
    this.current = current;
    const percentage = Math.floor((current / this.total) * 100);
    
    // Only log when percentage changes
    if (percentage !== this.lastPercentage) {
      const elapsed = Date.now() - this.startTime;
      const rate = current / (elapsed / 1000); // items per second
      const remaining = (this.total - current) / rate; // seconds
      
      this.logger.info(`Progress: ${percentage}% (${current}/${this.total})`, {
        percentage,
        current,
        total: this.total,
        rate: Math.round(rate * 10) / 10,
        remainingSeconds: Math.round(remaining),
        message
      });
      
      this.lastPercentage = percentage;
    }
  }

  complete(message = 'Operation completed') {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.logger.info(message, {
      total: this.total,
      elapsedSeconds: Math.round(elapsed),
      rate: Math.round((this.total / elapsed) * 10) / 10
    });
  }
}

// Utility functions
export function logError(error, context = {}) {
  logger.error(error.message, {
    stack: error.stack,
    ...context
  });
}

export function logPerformance(operation, duration, metadata = {}) {
  logger.info(`Performance: ${operation}`, {
    operation,
    durationMs: Math.round(duration),
    ...metadata
  });
}

export default logger;