const express = require('express');
const Datastore = require('@seald-io/nedb');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// CONFIGURATION
const MASTER_SETUP_KEY = "1234"; // Use this key to register new users

// 1. MIDDLEWARE
app.use(cors());
app.use(express.json());

// 2. DATABASE INITIALIZATION
const dbs = {
  // Business Data
  fabricators: new Datastore({ filename: 'fabricators.db', autoload: true }),
  pallets: new Datastore({ filename: 'pallets.db', autoload: true }),
  drawings: new Datastore({ filename: 'drawings.db', autoload: true }),
  jobs: new Datastore({ filename: 'jobs.db', autoload: true }),
  cart: new Datastore({ filename: 'cart.db', autoload: true }),
  
  // System Data
  application: new Datastore({ filename: 'application.db', autoload: true }),
  logs: new Datastore({ filename: 'logs.db', autoload: true })
};

// Indexing for performance and security
dbs.application.ensureIndex({ fieldName: 'username', unique: true });
dbs.logs.ensureIndex({ fieldName: 'timestamp' });

// 3. AUTOMATED LOGGING MIDDLEWARE
const systemLogger = (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    // Only log successful changes (POST, PUT, DELETE)
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && res.statusCode < 400) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        // Redact auth payloads for security
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

// 4. AUTHENTICATION ROUTES
// Simplified Register with Master Key
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

// Login Route
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  dbs.application.findOne({ type: 'user', username }, async (err, user) => {
    if (err) return res.status(500).json({ status: "error" });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }
    res.json({ 
      status: "success", 
      user: { username: user.username, role: user.role } 
    });
  });
});

// 5. SYSTEM DATA & LOGS
app.get('/logs', (req, res) => {
  dbs.logs.find({}).sort({ timestamp: -1 }).limit(100).exec((err, docs) => {
    res.json({ status: "success", data: docs });
  });
});

// 6. CRUD ROUTE GENERATOR
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

  app.put(`/${resourceName}/:id`, (req, res) => {
    db.update({ _id: req.params.id }, { $set: req.body }, {}, (err) => {
      if (err) return res.status(500).send(err);
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

app.listen(PORT, () => {
  console.log(`🚀 Industrial Server Live: http://localhost:${PORT}`);
  console.log(`🔑 Master Setup Key: ${MASTER_SETUP_KEY}`);
});
