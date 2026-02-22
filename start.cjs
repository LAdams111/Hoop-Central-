#!/usr/bin/env node
const path = require('path');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err && err.stack ? err.stack : err);
  process.exit(1);
});

if (!process.env.DATABASE_URL) {
  console.warn('Warning: DATABASE_URL not set — database features may be disabled.');
}

try {
  require(path.join(__dirname, 'dist', 'index.cjs'));
} catch (err) {
  console.error('Failed to start server:', err && err.stack ? err.stack : err);
  process.exit(1);
}
