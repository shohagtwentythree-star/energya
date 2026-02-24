const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const CONFIG = require('../config');

// List of protected files that should never be touched via the Data API
const PROTECTED_FILES = ['application.db'];

// GET /database - List all live .db files
router.get('/', async (req, res) => {
  try {
    const rawFiles = await fs.readdir(CONFIG.DB_DIR);
    
    // 🛡️ HIDDEN: application.db is now filtered out of the list
    const dbFiles = rawFiles.filter(file => 
      file.endsWith('.db') && !PROTECTED_FILES.includes(file)
    );

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

// POST /database/factory-reset - WIPES ALL DATA EXCEPT PROTECTED
// POST /database/factory-reset - WIPES ALL DATA EXCEPT PROTECTED
router.post('/factory-reset', async (req, res) => {
  try {
    const { key } = req.body;

    // 🛡️ SECURITY KEY CHECK
    if (key !== 'Shohag4750') {
      return res.status(401).json({ 
        status: "error", 
        message: "UNAUTHORIZED: Invalid Security Key. Access Logged." 
      });
    }

    const rawFiles = await fs.readdir(CONFIG.DB_DIR);
    const targets = rawFiles.filter(file => 
      file.endsWith('.db') && !PROTECTED_FILES.includes(file)
    );

    // Delete files in parallel
    await Promise.all(targets.map(file => fs.unlink(path.join(CONFIG.DB_DIR, file))));

    res.json({ 
      status: "success", 
      message: `System Purged. ${targets.length} tables removed.` 
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});


// POST /database/config-update - UPDATES application.db
router.post('/config-update', async (req, res) => {
  try {
    const { configData } = req.body; // Expecting an array of objects (lines)
    const filePath = path.join(CONFIG.DB_DIR, 'application.db');
    
    // Convert array back to NeDB/JSONL format (one JSON object per line)
    const content = configData.map(obj => JSON.stringify(obj)).join('\n') + '\n';
    
    await fs.writeFile(filePath, content, 'utf8');
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});


// GET /database/:fileName - Read records from a live file
router.get('/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;

    // 🛡️ SECURITY GUARD: Block manual URL access to config files
    if (PROTECTED_FILES.includes(fileName)) {
      return res.status(403).json({ 
        status: "error", 
        message: "ACCESS DENIED: System configuration files are restricted." 
      });
    }

    const filePath = path.join(CONFIG.DB_DIR, fileName);
    
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ status: "error", message: "File not found" });
    }

    const rawContent = await fs.readFile(filePath, 'utf8');
    const lines = rawContent.split('\n').filter(l => l.trim());
    
    // Keep performance limit to 1000 records
    const limit = 1000; 
    const isTruncated = lines.length > limit;
    const targetLines = isTruncated ? lines.slice(-limit) : lines;

    const records = targetLines.map(l => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return { _parseError: true, raw: l };
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
