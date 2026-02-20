const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { runBackup } = require('../backup');

/**
 * GET /backups
 * Returns a detailed list of all existing backup versions based on CONFIG.BACKUP_PREFIX
 */
router.get('/', (req, res) => {
  try {
    const PREFIX = CONFIG.BACKUP_PREFIX;

    // Safety check: If backup directory doesn't exist, return empty array instead of crashing
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
      return res.json({ status: "success", data: [], prefix: PREFIX });
    }

    const folders = fs.readdirSync(CONFIG.BACKUP_DIR);
    
    const backupList = folders
      .filter(name => name.startsWith(PREFIX)) // Uses central config prefix
      .map(name => {
        const fullPath = path.join(CONFIG.BACKUP_DIR, name);
        const stats = fs.statSync(fullPath);
        
        // Robustness: Handle empty folders or missing permissions
        let filesInVersion = [];
        let totalSize = 0;
        
        try {
          filesInVersion = fs.readdirSync(fullPath);
          totalSize = filesInVersion.reduce((acc, file) => {
            const filePath = path.join(fullPath, file);
            return acc + (fs.statSync(filePath).size || 0);
          }, 0);
        } catch (e) {
          console.error(`Could not read backup folder ${name}:`, e.message);
        }

        return {
          versionName: name,
          createdAt: stats.mtime,
          fileCount: filesInVersion.length,
          sizeInBytes: totalSize,
          sizeFormatted: (totalSize / 1024).toFixed(2) + " KB",
          files: filesInVersion
        };
      })
      // Sort newest versions to the top (latest version index 0)
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json({ 
      status: "success", 
      data: backupList,
      config: {
        prefix: PREFIX,
        maxBackups: CONFIG.MAX_BACKUPS || 3
      }
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});


/**
 * GET /backups/:versionName/files/:fileName
 * Reads and returns the JSON data from a specific database file in a backup
 */
router.get('/:versionName/files/:fileName', (req, res) => {
  const { versionName, fileName } = req.params;
  const filePath = path.join(CONFIG.BACKUP_DIR, versionName, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ status: "error", message: "File not found" });
  }

  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    // NeDB files are newline-delimited JSON. 
    // We split by line, filter out empty lines, and parse each line.
    const data = rawContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    res.json({ status: "success", fileName, data });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to parse database file" });
  }
});


/**
 * POST /backups/trigger
 * Executes the backup and rotation logic
 */
router.post('/trigger', (req, res) => {
  try {
    const result = runBackup();
    res.json({
      status: "success",
      message: "Backup sequence completed",
      details: result
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Backup execution failed", error: error.message });
  }
});

/**
 * DELETE /backups/:versionName
 * Manual deletion of a specific version with prefix validation
 */
router.delete('/:versionName', (req, res) => {
  const { versionName } = req.params;
  const PREFIX = CONFIG.BACKUP_PREFIX;
  const targetPath = path.join(CONFIG.BACKUP_DIR, versionName);

  // Robustness check: Ensure the path is within BACKUP_DIR and starts with correct prefix
  // This prevents accidental deletion of system folders if someone sends a malicious path
  if (fs.existsSync(targetPath) && versionName.startsWith(PREFIX)) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return res.json({ status: "success", message: `Version ${versionName} successfully purged.` });
    } catch (err) {
      return res.status(500).json({ status: "error", message: "Failed to delete folder", details: err.message });
    }
  }
  
  res.status(404).json({ status: "error", message: "Invalid version name or folder not found." });
});

module.exports = router;
