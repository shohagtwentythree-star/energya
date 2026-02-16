const express = require('express');
const Datastore = require('@seald-io/nedb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
 
// CONFIGURATION
const MASTER_SETUP_KEY = "1234"; 

// 1. MIDDLEWARE
app.use(cors());
app.use(express.json());

// 2. DATABASE INITIALIZATION 
const dbs = {
  fabricators: new Datastore({ filename: 'fabricators.db', autoload: true }),
  pallets: new Datastore({ filename: 'pallets.db', autoload: true }),
  drawings: new Datastore({ filename: 'drawings.db', autoload: true }),
  jobs: new Datastore({ filename: 'jobs.db', autoload: true }),
  cart: new Datastore({ filename: 'cart.db', autoload: true }),
  application: new Datastore({ filename: 'application.db', autoload: true }),
  logs: new Datastore({ filename: 'logs.db', autoload: true })
};

// Indexing
dbs.application.ensureIndex({ fieldName: 'username', unique: true });
dbs.logs.ensureIndex({ fieldName: 'timestamp' });

// --- 3. BACKUP & MAINTENANCE SYSTEM ---
const runBackup = () => {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  // Generate Timestamp: YYYY-MM-DD_HH-mm-ss
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .split('.')[0]; 
    
  const MAX_DAYS = 30;

  console.log(`[${new Date().toLocaleString()}] 💾 Starting Backup Cycle...`);

  // Copy each database file
  Object.keys(dbs).forEach(key => {
    const sourcePath = path.join(__dirname, `${key}.db`);
    if (fs.existsSync(sourcePath)) {
      const backupFileName = `${key}_${timestamp}.db`;
      fs.copyFileSync(sourcePath, path.join(backupDir, backupFileName));
    }
  });

  // Cleanup: Delete files older than 30 days
  const expiryMs = MAX_DAYS * 24 * 60 * 60 * 1000;
  fs.readdir(backupDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      if (Date.now() - stats.mtimeMs > expiryMs) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] 🗑️ Deleted old backup: ${file}`);
      }
    });
  });
};

// Auto-compaction: Optimizes DB files every 24 hours to prevent corruption
Object.values(dbs).forEach(db => {
  db.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
});

// Run backup once on start, then every 24 hours
runBackup();
setInterval(runBackup, 24 * 60 * 60 * 1000);

// --- 4. SYSTEM LOGGING MIDDLEWARE ---
const systemLogger = (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        payload: req.originalUrl.includes('auth') ? { auth: "REDACTED" } : (req.method === 'DELETE' ? req.params : req.body),
        status: res.statusCode
      };
      dbs.logs.insert(logEntry);
    }
    return originalSend.apply(res, arguments);
  };
  next();
};

app.use(systemLogger);

// --- 5. AUTHENTICATION ROUTES ---
app.post('/auth/register', async (req, res) => {
  const { username, password, setupKey } = req.body;
  if (setupKey !== MASTER_SETUP_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid Master Setup Key" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      type: 'user',
      username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    dbs.application.insert(newUser, (err, doc) => {
      if (err) return res.status(400).json({ status: "error", message: "Username already exists" });
      res.status(201).json({ status: "success", data: { username: doc.username } });
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  dbs.application.findOne({ type: 'user', username }, async (err, user) => {
    if (err) return res.status(500).json({ status: "error" });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }
    res.json({ status: "success", user: { username: user.username, role: user.role } });
  });
});

// --- 6. SYSTEM DATA & LOGS ---
app.get('/logs', (req, res) => {
  dbs.logs.find({}).sort({ timestamp: -1 }).limit(100).exec((err, docs) => {
    res.json({ status: "success", data: docs });
  });
});

// --- 7. CRUD ROUTE GENERATOR ---
const createCrudRoutes = (resourceName) => {
  const db = dbs[resourceName];
  if (['application', 'logs'].includes(resourceName)) return; 

  app.post(`/${resourceName}`, (req, res) => {
    db.insert(req.body, (err, doc) => {
      if (err) return res.status(500).send(err);
      res.status(201).json({ status: "success", data: doc });
    });
  });

  app.get(`/${resourceName}`, (req, res) => {
    db.find({}, (err, docs) => {
      res.json({ status: "success", data: docs });
    });
  });

  app.get(`/${resourceName}/:id`, (req, res) => {
    db.findOne({ _id: req.params.id }, (err, doc) => {
      if (err) return res.status(500).send(err);
      if (!doc) return res.status(404).json({ status: "error", message: "Not found" });
      res.json({ status: "success", data: doc });
    });
  });

  app.put(`/${resourceName}/:id`, (req, res) => {
    db.update({ _id: req.params.id }, { $set: req.body }, {}, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ status: "success" });
    });
  });

  app.patch(`/${resourceName}/:id`, (req, res) => {
    db.update({ _id: req.params.id }, { $set: req.body }, {}, (err, numReplaced) => {
      if (err) return res.status(500).send(err);
      if (numReplaced === 0) return res.status(404).json({ status: "error", message: "Not found" });
      res.json({ status: "success" });
    });
  });

  app.delete(`/${resourceName}/:id`, (req, res) => {
    db.remove({ _id: req.params.id }, {}, (err) => {
      if (err) return res.status(500).send(err);
      res.json({ status: "success" });
    });
  });
};

['fabricators', 'pallets', 'drawings', 'jobs', 'cart'].forEach(createCrudRoutes);

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Industrial Server Live: http://localhost:${PORT}`);
  console.log(`📁 Backups are stored in: ${path.join(__dirname, 'backups')}`);
  console.log(`🕒 Backup Retention: 30 Days`);
});
