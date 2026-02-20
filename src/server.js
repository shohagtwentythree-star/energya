const express = require('express');
const cors = require('cors');
const CONFIG = require('./config');
const dbs = require('./db');
const { runBackup } = require('./backup');

// Route Imports
const authRoutes = require('./routes/auth');
const backupRoutes = require('./routes/backups');
const databaseRoutes = require('./routes/database'); // <--- New Live DB Route
const createCrudRoutes = require('./routes/crud');

const app = express();

// --- 1. MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- 2. ROUTES ---

// Auth endpoints (/auth/login, /auth/register)
app.use('/auth', authRoutes);

// Backup endpoints (/maintenance/backups/)
app.use('/maintenance/backups', backupRoutes);

// Live Database Inspection (/maintenance/database/)
app.use('/maintenance/database', databaseRoutes); // <--- Register the new module

// Dynamic CRUD for resources
const resources = ['fabricators', 'pallets', 'drawings', 'jobs', 'cart'];
resources.forEach(resource => {
  createCrudRoutes(app, dbs, resource);
});

// Logs endpoint
app.get('/logs', (req, res) => {
  dbs.logs.find({}).sort({ timestamp: -1 }).limit(100).exec((err, docs) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });
    res.json({ status: "success", data: docs });
  });
});

// --- 3. SERVER INITIALIZATION ---

console.log("🛠️  Performing startup system check...");

// Run an initial backup snapshot on boot to ensure data safety
try {
  runBackup();
} catch (e) {
  console.error("⚠️  Startup backup failed, but server will proceed:", e.message);
}

app.listen(CONFIG.PORT, () => {
  console.log(`---`);
  console.log(`🚀 Industrial Server Live: http://localhost:${CONFIG.PORT}`);
  console.log(`📡 Status: [Live Engine & Vault Ready]`);
  console.log(`📂 Database Path: ${CONFIG.DB_DIR}`);
  console.log(`💾 Backup Path:   ${CONFIG.BACKUP_DIR}`);
  console.log(`---`);
});

// --- 4. GLOBAL ERROR HANDLERS ---
// Keeps the server running even if a specific request fails catastrophically
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
