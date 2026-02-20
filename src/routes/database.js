const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

// GET /database - List all live .db files
router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(CONFIG.DB_DIR)
      .filter(file => file.endsWith('.db'))
      .map(file => {
        const stats = fs.statSync(path.join(CONFIG.DB_DIR, file));
        return {
          name: file,
          size: (stats.size / 1024).toFixed(2) + " KB",
          lastModified: stats.mtime
        };
      });
    res.json({ status: "success", data: files });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /database/:fileName - Read records from a live file
router.get('/:fileName', (req, res) => {
  try {
    const filePath = path.join(CONFIG.DB_DIR, req.params.fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    const records = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    res.json({ status: "success", data: records });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
