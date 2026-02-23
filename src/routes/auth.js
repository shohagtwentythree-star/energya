const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbs = require('../db');
const CONFIG = require('../config');

// Helper to wrap NeDB findOne in a Promise for cleaner async/await flow
const findUser = (query) => new Promise((resolve, reject) => {
  dbs.application.findOne(query, (err, doc) => err ? reject(err) : resolve(doc));
});

// --- 1. REGISTER ---
router.post('/register', async (req, res) => {
  const { username, password, setupKey } = req.body;

  if (setupKey !== CONFIG.MASTER_SETUP_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid Master Setup Key" });
  }

  try {
    // Optimization: Check if user exists BEFORE hashing to save CPU cycles
    const existingUser = await findUser({ type: 'user', username });
    if (existingUser) {
      return res.status(400).json({ status: "error", message: "Username already exists" });
    }

    // bcryptjs.hash is async, but it still uses the thread pool. 
    // Salt rounds (10) is a good balance for industrial hardware.
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = {
      type: 'user',
      username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    dbs.application.insert(newUser, (err, doc) => {
      if (err) return res.status(500).json({ status: "error", message: "Storage error" });
      res.status(201).json({ status: "success", data: { username: doc.username } });
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// --- 2. LOGIN ---
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Database lookup (Fastest part if indexed)
    const user = await findUser({ type: 'user', username });
    
    // 2. Fail fast: If no user, don't even bother with bcrypt
    if (!user) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }

    // 3. Password Check (CPU Intensive)
    // bcrypt.compare is handled in the libuv thread pool, keeping the main loop free.
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }

    // Return user data (Exclude password even though it's hashed)
    res.json({ 
      status: "success", 
      user: { 
        username: user.username, 
        role: user.role 
      } 
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Login service temporarily unavailable" });
  }
});

module.exports = router;
