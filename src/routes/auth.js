const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbs = require('../db');
const CONFIG = require('../config');

// Helper to wrap NeDB findOne
const findUser = (query) => new Promise((resolve, reject) => {
  dbs.application.findOne(query, (err, doc) => err ? reject(err) : resolve(doc));
});

// --- 1. REGISTER (Existing) ---
router.post('/register', async (req, res) => {
  const { username, password, setupKey } = req.body;
  if (setupKey !== CONFIG.MASTER_SETUP_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid Master Setup Key" });
  }

  try {
    const existingUser = await findUser({ type: 'user', username });
    if (existingUser) return res.status(400).json({ status: "error", message: "User exists" });

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
  } catch (e) { res.status(500).send("Internal error"); }
});

// --- 2. LOGIN (Existing) ---
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await findUser({ type: 'user', username });
    if (!user) return res.status(401).json({ status: "error", message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ status: "error", message: "Invalid credentials" });

    res.json({ status: "success", user: { username: user.username, role: user.role } });
  } catch (err) { res.status(500).send("Login service unavailable"); }
});

// --- 3. UPDATE USER (New Personnel Management) ---
// This route handles both username changes and password resets
router.post('/update', async (req, res) => {
  const { currentUsername, newUsername, newPassword, key } = req.body;

  // 🛡️ Security Check
  if (key !== 'Shohag4750') {
    return res.status(401).json({ status: "error", message: "Unauthorized Admin Key" });
  }

  try {
    const user = await findUser({ type: 'user', username: currentUsername });
    if (!user) return res.status(404).json({ status: "error", message: "User not found" });

    const updateData = {};
    if (newUsername) updateData.username = newUsername;
    
    // If a new password is provided, we must hash it before saving
    if (newPassword) {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    dbs.application.update(
      { _id: user._id }, 
      { $set: updateData }, 
      {}, 
      (err) => {
        if (err) return res.status(500).json({ status: "error", message: "Update failed" });
        res.json({ status: "success", message: "Personnel record updated" });
      }
    );
  } catch (err) {
    res.status(500).json({ status: "error", message: "System update error" });
  }
});

module.exports = router;
