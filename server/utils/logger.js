/**
 * Logger Utility
 * Handles logging to both console and file
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create log file with timestamp in name
const timestamp = new Date().toISOString().replace(/:/g, '-');
const logFile = path.join(logsDir, `server-${timestamp}.log`);

// Create write stream
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Custom logger that writes to both console and file
const logger = {
  log: function(...args) {
    const message = formatLogMessage('INFO', ...args);
    console.log(...args);
    logStream.write(message + '\n');
  },
  
  error: function(...args) {
    const message = formatLogMessage('ERROR', ...args);
    console.error(...args);
    logStream.write(message + '\n');
  },
  
  warn: function(...args) {
    const message = formatLogMessage('WARN', ...args);
    console.warn(...args);
    logStream.write(message + '\n');
  },
  
  debug: function(...args) {
    const message = formatLogMessage('DEBUG', ...args);
    console.debug(...args);
    logStream.write(message + '\n');
  },
  
  // Close the log stream (call this when shutting down)
  close: function() {
    logStream.end();
  }
};

// Format log message with timestamp and level
function formatLogMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      return util.inspect(arg, { depth: null, colors: false });
    }
    return String(arg);
  }).join(' ');
  
  return `[${timestamp}] [${level}] ${message}`;
}

// Capture uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

// Capture unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = logger; 