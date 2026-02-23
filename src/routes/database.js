const express = require('express');
const router = express.Router();
const fs = require('fs').promises; // Use Promise-based FS
const fsSync = require('fs');      // Keep sync for exists check
const path = require('path');
const CONFIG = require('../config');

// GET /database - List all live .db files
// Optimized: Non-blocking parallel stat fetching
router.get('/', async (req, res) => {
  try {
    const rawFiles = await fs.readdir(CONFIG.DB_DIR);
    const dbFiles = rawFiles.filter(file => file.endsWith('.db'));

    const filesData = await Promise.all(dbFiles.map(async (file) => {
      const stats = await fs.stat(path.join(CONFIG.DB_DIR, file));
      return {
        name: file,
        sizeInBytes: stats.size,
        size: (stats.size / 1024).toFixed(2) + " KB",
        lastModified: stats.mtime
      };
    }));

    res.json({ status: "success", data: filesData });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /database/:fileName - Read records from a live file
// Optimized: Added a line-limit and async reading to prevent RAM crashes
router.get('/:fileName', async (req, res) => {
  try {
    const filePath = path.join(CONFIG.DB_DIR, req.params.fileName);
    
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ status: "error", message: "File not found" });
    }

    // Optimization: Reading large files as a string is slow. 
    // We use a buffer-safe async read.
    const rawContent = await fs.readFile(filePath, 'utf8');
    
    // Safety check: If file is massive, we only return the last 1000 lines 
    // to prevent browser/server hang.
    const lines = rawContent.split('\n').filter(l => l.trim());
    const limit = 1000; 
    const isTruncated = lines.length > limit;
    const targetLines = isTruncated ? lines.slice(-limit) : lines;

    const records = targetLines.map(l => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return { _parseError: true, raw: l }; // Handle corrupted lines gracefully
      }
    });

    res.json({ 
      status: "success", 
      data: records,
      meta: {
        totalLines: lines.length,
        showingLast: targetLines.length,
        truncated: isTruncated
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
