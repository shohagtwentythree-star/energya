import express from 'express';
import cors from 'cors';
import compression from 'compression';
import CONFIG from './config.js'; // Extensions are mandatory in ESM
import dbs from './db.js';

// Route Imports
import authRoutes from './routes/auth.js';
import backupRoutes from './routes/backups.js';
import databaseRoutes from './routes/database.js';
import createCrudRoutes from './routes/crud.js';

const app = express();

// --- 1. MIDDLEWARE ---
app.use(compression()); 
app.use(cors());
app.use(express.json());

// --- 2. ROUTES ---

// Fixed Routes
app.use('/auth', authRoutes);
app.use('/maintenance/backups', backupRoutes);
app.use('/maintenance/database', databaseRoutes);

// Dynamic CRUD Routes
const resources = ['fabricators', 'pallets', 'drawings', 'cart'];
resources.forEach(resource => {
  // Pass the specific database instance for this resource
  app.use(`/${resource}`, createCrudRoutes(dbs, resource));
});

// Logs endpoint
// Optimization: Direct array access. Fast and no complex 'query' overhead.
app.get('/logs', (req, res) => {
  try {
    const logs = dbs.logs.data.data // Access: dbs.[filename].data.[key]
      .slice() // Copy to avoid mutating original
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    res.json({ status: "success", data: logs });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- 3. SERVER INITIALIZATION ---

console.log("🛠️  Performing startup system check...");

// In ESM with lowdb v7, we start the server once DBs are confirmed ready
const server = app.listen(CONFIG.PORT, () => {
  console.log(`---`);
  console.log(`🚀 Industrial Server Live: http://localhost:${CONFIG.PORT}`);
  console.log(`📂 Storage: JSON Flat Files via LowDB`);
});

// --- 4. GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception. Closing server safely...', err);
  server.close(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
