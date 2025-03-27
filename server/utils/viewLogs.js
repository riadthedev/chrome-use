/**
 * Log Viewer Utility
 * Displays the most recent log file
 */

const fs = require('fs');
const path = require('path');

// Get logs directory
const logsDir = path.join(__dirname, '../logs');

// Check if logs directory exists
if (!fs.existsSync(logsDir)) {
  console.error('Logs directory does not exist');
  process.exit(1);
}

// Get all log files
const logFiles = fs.readdirSync(logsDir)
  .filter(file => file.endsWith('.log'))
  .map(file => ({
    name: file,
    path: path.join(logsDir, file),
    time: fs.statSync(path.join(logsDir, file)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time); // Sort by most recent

if (logFiles.length === 0) {
  console.log('No log files found');
  process.exit(0);
}

// Get most recent log file
const mostRecentLog = logFiles[0];
console.log(`Displaying most recent log file: ${mostRecentLog.name}\n`);

// Read and display the log file
const logContent = fs.readFileSync(mostRecentLog.path, 'utf8');
console.log(logContent);

// Provide info about other logs
if (logFiles.length > 1) {
  console.log(`\nThere are ${logFiles.length - 1} other log files in the logs directory.`);
  console.log('To view a specific log file, use: cat logs/filename.log');
} 