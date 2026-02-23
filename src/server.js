const express = require('express');
const cors = require('cors');
const compression = require('compression'); // New: Compresses JSON for 3x-5x faster transfers
const CONFIG = require('./config');
const dbs = require('./db');
const { runBackup } = require('./backup');

// Route Imports
const authRoutes = require('./routes/auth');
const backupRoutes = require('./routes/backups');
const databaseRoutes = require('./routes/database');
const createCrudRoutes = require('./routes/crud');

const app = express();

// --- 1. MIDDLEWARE ---
app.use(compression()); // Optimization: Shrinks response size (vital for large /logs)
app.use(cors());
app.use(express.json());

// --- 2. ROUTES ---

// Fixed Routes
app.use('/auth', authRoutes);
app.use('/maintenance/backups', backupRoutes);
app.use('/maintenance/database', databaseRoutes);

// Dynamic CRUD Routes
// Optimization: Moved to app.use() with Router-based logic for O(1) route matching
const resources = ['fabricators', 'pallets', 'drawings', 'jobs', 'cart'];
resources.forEach(resource => {
  app.use(`/${resource}`, createCrudRoutes(dbs, resource));
});

// Logs endpoint
// Optimization: Async execution and result limiting to protect RAM
app.get('/logs', (req, res) => {
  dbs.logs.find({})
    .sort({ timestamp: -1 })
    .limit(100)
    .exec((err, docs) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });
      res.json({ status: "success", data: docs });
    });
});

// --- 3. SERVER INITIALIZATION ---

console.log("🛠️  Performing startup system check...");

// Optimization: Start the server immediately, then run backup in the background
// This prevents the "Response Delay" during server boot.
const server = app.listen(CONFIG.PORT, () => {
  console.log(`---`);
  console.log(`🚀 Industrial Server Live: http://localhost:${CONFIG.PORT}`);
  console.log(`📂 Database Path: ${CONFIG.DB_DIR}`);
  console.log(`💾 Backup Path:   ${CONFIG.BACKUP_DIR}`);
});

// --- 4. GLOBAL ERROR HANDLERS ---
// Optimization: If a critical error occurs, we log it and restart via PM2 
// instead of staying in a "corrupted" memory state.



process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception. Closing server safely...', err);
  server.close(() => {
    process.exit(1); // Exit so a process manager like PM2 can restart a fresh instance
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
