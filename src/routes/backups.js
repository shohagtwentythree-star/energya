const express = require('express');
const router = express.Router();
const fs = require('fs').promises; // Use Promise-based FS
const fsSync = require('fs');      // Keep sync only for createReadStream if needed
const path = require('path');
const CONFIG = require('../config');
const { runBackup } = require('../backup');

/**
 * GET /backups
 * Optimized: Uses Promise.all for parallel async stats (Super Fast)
 */
router.get('/', async (req, res) => {
  try {
    const PREFIX = CONFIG.BACKUP_PREFIX;

    if (!fsSync.existsSync(CONFIG.BACKUP_DIR)) {
      return res.json({ status: "success", data: [], prefix: PREFIX });
    }

    const folders = await fs.readdir(CONFIG.BACKUP_DIR);
    const filteredFolders = folders.filter(name => name.startsWith(PREFIX));

    // Perform all folder stats in parallel instead of one-by-one
    const backupList = await Promise.all(filteredFolders.map(async (name) => {
      const fullPath = path.join(CONFIG.BACKUP_DIR, name);
      try {
        const stats = await fs.stat(fullPath);
        const filesInVersion = await fs.readdir(fullPath);
        
        let totalSize = 0;
        // Parallel file sizing
        const fileStats = await Promise.all(filesInVersion.map(f => fs.stat(path.join(fullPath, f))));
        totalSize = fileStats.reduce((acc, s) => acc + s.size, 0);

        return {
          versionName: name,
          createdAt: stats.mtime,
          fileCount: filesInVersion.length,
          sizeInBytes: totalSize,
          sizeFormatted: (totalSize / 1024).toFixed(2) + " KB",
          files: filesInVersion
        };
      } catch (e) {
        return null; // Skip folders that throw errors
      }
    }));

    res.json({ 
      status: "success", 
      data: backupList.filter(b => b !== null).sort((a, b) => b.createdAt - a.createdAt),
      config: { prefix: PREFIX, maxBackups: CONFIG.MAX_BACKUPS || 3 }
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

/**
 * GET /backups/:versionName/files/:fileName
 * Optimized: Handles large files without crashing RAM
 */
router.get('/:versionName/files/:fileName', async (req, res) => {
  const { versionName, fileName } = req.params;
  const filePath = path.join(CONFIG.BACKUP_DIR, versionName, fileName);

  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ status: "error", message: "File not found" });
  }

  try {
    // For NeDB files, we still parse JSON but use async read
    const rawContent = await fs.readFile(filePath, 'utf8');
    const data = rawContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } catch(e) { return null; }
      })
      .filter(d => d !== null);

    res.json({ status: "success", fileName, data });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to parse database file" });
  }
});

/**
 * POST /backups/trigger
 * Optimized: Prevents "Unwanted Load" by making the execution non-blocking
 */
router.post('/trigger', async (req, res) => {
  try {
    // Assuming runBackup is now an async function
    const result = await runBackup(); 
    res.json({ status: "success", message: "Backup completed", details: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

/**
 * DELETE /backups/:versionName
 * Optimized: Async removal
 */
router.delete('/:versionName', async (req, res) => {
  const { versionName } = req.params;
  const targetPath = path.join(CONFIG.BACKUP_DIR, versionName);

  if (fsSync.existsSync(targetPath) && versionName.startsWith(CONFIG.BACKUP_PREFIX)) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return res.json({ status: "success", message: `Version ${versionName} purged.` });
    } catch (err) {
      return res.status(500).json({ status: "error", message: "Delete failed" });
    }
  }
  res.status(404).json({ status: "error", message: "Not found" });
});

module.exports = router;
