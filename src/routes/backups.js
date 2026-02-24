const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const multer = require('multer');
const unzipper = require('unzipper');
const os = require('os');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { runBackup } = require('../backup');

// --- 🛡️ SECURITY CONFIGURATION ---
// Files in this list will never be backed up, restored, or visible in the UI.
const PROTECTED_FILES = ['application.db'];

// Route uploads to OS temp directory to prevent crashes if 'temp/' folder is missing
const upload = multer({ dest: os.tmpdir() });

/**
 * 1. GET /backups
 * Returns list of snapshots, excluding protected system files.
 */
router.get('/', async (req, res) => {
  try {
    const PREFIX = CONFIG.BACKUP_PREFIX;

    if (!fsSync.existsSync(CONFIG.BACKUP_DIR)) {
      return res.json({ status: "success", data: [], prefix: PREFIX });
    }

    const folders = await fs.readdir(CONFIG.BACKUP_DIR);
    const filteredFolders = folders.filter(name => name.startsWith(PREFIX));

    const backupList = await Promise.all(filteredFolders.map(async (name) => {
      const fullPath = path.join(CONFIG.BACKUP_DIR, name);
      try {
        const stats = await fs.stat(fullPath);
        
        // 🛡️ SECURITY: Strip out application.db from the file list
        const filesInVersion = (await fs.readdir(fullPath))
          .filter(f => !PROTECTED_FILES.includes(f));
        
        // Parallel file sizing
        const fileStats = await Promise.all(filesInVersion.map(f => fs.stat(path.join(fullPath, f))));
        const totalSize = fileStats.reduce((acc, s) => acc + s.size, 0);

        return {
          versionName: name,
          createdAt: stats.mtime,
          fileCount: filesInVersion.length,
          sizeInBytes: totalSize,
          sizeFormatted: (totalSize / 1024).toFixed(2) + " KB",
          files: filesInVersion
        };
      } catch (e) {
        return null; 
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
 * 2. GET /backups/:versionName/download
 * Generates a ZIP on-the-fly, excluding protected system files.
 */
router.get('/:versionName/download', async (req, res) => {
  const { versionName } = req.params;
  const folderPath = path.join(CONFIG.BACKUP_DIR, versionName);

  if (!fsSync.existsSync(folderPath)) {
    return res.status(404).json({ status: "error", message: "Backup version not found" });
  }

  res.attachment(`${versionName}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);

  // 🛡️ SECURITY: Manually add files to ZIP to ensure application.db is skipped
  const files = await fs.readdir(folderPath);
  for (const file of files) {
    if (!PROTECTED_FILES.includes(file)) {
      archive.file(path.join(folderPath, file), { name: file });
    }
  }

  await archive.finalize();
});

/**
 * 3. GET /backups/:versionName/files/:fileName
 * Inspect contents of a specific file (blocked for protected files).
 */
router.get('/:versionName/files/:fileName', async (req, res) => {
  const { versionName, fileName } = req.params;

  // 🛡️ SECURITY: Prevent inspection of config files
  if (PROTECTED_FILES.includes(fileName)) {
    return res.status(403).json({ status: "error", message: "Access Denied: System File" });
  }

  const filePath = path.join(CONFIG.BACKUP_DIR, versionName, fileName);
  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ status: "error", message: "File not found" });
  }

  try {
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
 * 4. POST /backups/trigger
 * Manually trigger a fresh system snapshot.
 */
router.post('/trigger', async (req, res) => {
  try {
    const result = await runBackup(); 
    res.json({ status: "success", message: "Backup completed", details: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

/**
 * 5. POST /backups/restore-from-zip
 * Reconstructs the DB from an uploaded ZIP, skipping blacklisted files.
 */
router.post('/restore-from-zip', upload.single('backupZip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", message: "No file uploaded" });

  const zipPath = req.file.path;
  const livePath = CONFIG.DB_DIR;

  try {
    const directory = await unzipper.Open.file(zipPath);
    
    // 🛡️ SECURITY: Only extract files NOT in the protected list
    for (const file of directory.files) {
      if (!PROTECTED_FILES.includes(file.path)) {
        const content = await file.buffer();
        await fs.writeFile(path.join(livePath, file.path), content);
      }
    }

    await fs.unlink(zipPath);
    res.json({ status: "success", message: "External ZIP restored. Preserving config..." });

    // Force reboot to clear NeDB RAM cache
    setTimeout(() => { process.exit(0); }, 1000);
  } catch (error) {
    res.status(500).json({ status: "error", message: "Extraction failed: " + error.message });
  }
});

/**
 * 6. POST /backups/:versionName/restore
 * Internal rollback, skipping blacklisted files.
 */
router.post('/:versionName/restore', async (req, res) => {
  const { versionName } = req.params;
  const sourcePath = path.join(CONFIG.BACKUP_DIR, versionName);
  const livePath = CONFIG.DB_DIR;

  if (!fsSync.existsSync(sourcePath)) {
    return res.status(404).json({ status: "error", message: "Source not found" });
  }

  try {
    const files = await fs.readdir(sourcePath);
    for (const file of files) {
      // 🛡️ SECURITY: Overwrite ONLY .db files and skip protected ones
      if (file.endsWith('.db') && !PROTECTED_FILES.includes(file)) {
        await fs.copyFile(path.join(sourcePath, file), path.join(livePath, file));
      }
    }

    res.json({ status: "success", message: `System rolled back to ${versionName}` });

    // Force reboot to clear NeDB RAM cache
    setTimeout(() => { process.exit(0); }, 1000);
  } catch (error) {
    res.status(500).json({ status: "error", message: "Restore operation failed" });
  }
});

/**
 * 7. DELETE /backups/:versionName
 * Permanently purges a backup folder from the disk.
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
