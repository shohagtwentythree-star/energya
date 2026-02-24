import express from 'express';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import CONFIG from '../config.js';

const router = express.Router();

// List of protected files that should never be touched via the Data API
// UPDATED: Now targeting .json extension for Lowdb
const PROTECTED_FILES = ['application.json'];

// GET /database - List all live .json files
router.get('/', async (req, res) => {
  try {
    const rawFiles = await fs.readdir(CONFIG.DB_DIR);
    
    // 🛡️ HIDDEN: application.json is now filtered out of the list
    const dbFiles = rawFiles.filter(file => 
      file.endsWith('.json') && !PROTECTED_FILES.includes(file)
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
      file.endsWith('.json') && !PROTECTED_FILES.includes(file)
    );

    // Instead of deleting the files (which breaks Lowdb instances), 
    // we reset them to an empty data structure.
    const resetData = JSON.stringify({ data: [] }, null, 2);
    
    await Promise.all(targets.map(file => 
      fs.writeFile(path.join(CONFIG.DB_DIR, file), resetData)
    ));

    res.json({ 
      status: "success", 
      message: `System Purged. ${targets.length} tables cleared.` 
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// POST /database/config-update - UPDATES application.json
router.post('/config-update', async (req, res) => {
  try {
    const { configData } = req.body; // Expecting the full object to save
    const filePath = path.join(CONFIG.DB_DIR, 'application.json');
    
    // Lowdb uses standard JSON format. No more mapping to lines.
    await fs.writeFile(filePath, JSON.stringify(configData, null, 2), 'utf8');
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
    const parsedData = JSON.parse(rawContent);
    
    // Lowdb structures are usually { "data": [...] } or { "users": [...] }
    const records = parsedData.data || parsedData.users || parsedData;

    // Keep performance limit to 1000 records
    const limit = 1000; 
    const isTruncated = Array.isArray(records) && records.length > limit;
    const dataToSend = isTruncated ? records.slice(-limit) : records;

    res.json({ 
      status: "success", 
      data: dataToSend,
      meta: {
        totalItems: Array.isArray(records) ? records.length : 1,
        showingLast: Array.isArray(dataToSend) ? dataToSend.length : 1,
        truncated: isTruncated
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;
