const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbs = require('../db');
const CONFIG = require('../config');

router.post('/register', async (req, res) => {
  const { username, password, setupKey } = req.body;
  if (setupKey !== CONFIG.MASTER_SETUP_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid Master Setup Key" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      type: 'user', username, password: hashedPassword,
      role: 'admin', createdAt: new Date().toISOString()
    };
    dbs.application.insert(newUser, (err, doc) => {
      if (err) return res.status(400).json({ status: "error", message: "Username already exists" });
      res.status(201).json({ status: "success", data: { username: doc.username } });
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  dbs.application.findOne({ type: 'user', username }, async (err, user) => {
    if (err) return res.status(500).json({ status: "error" });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }
    res.json({ status: "success", user: { username: user.username, role: user.role } });
  });
});

module.exports = router;
