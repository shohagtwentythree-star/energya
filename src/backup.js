import fs from 'fs';
import path from 'path';
import CONFIG from './config.js'; // Extension mandatory in ESM
import dbs from './db.js';

/**
 * runBackup
 * Creates a versioned snapshot of all lowdb JSON files.
 * Uses configuration from CONFIG for prefix and rotation limits.
 */
export const runBackup = () => {
  const PREFIX = CONFIG.BACKUP_PREFIX || "DB_BACKUP_v"; 
  const MAX_BACKUPS = CONFIG.MAX_BACKUPS || 3;

  console.log(`[${new Date().toLocaleString()}] 🛡️  Starting Industrial Backup Sequence...`);

  try {
    // 0. ENSURE BACKUP ROOT EXISTS
    if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
      fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
      console.log(`📁 Created root backup directory: ${CONFIG.BACKUP_DIR}`);
    }

    // 1. Scan and parse existing folders to find the next version number
    const allEntries = fs.readdirSync(CONFIG.BACKUP_DIR);
    
    const versionNumbers = allEntries
      .filter(name => name.startsWith(PREFIX))
      .map(name => {
        const numPart = name.replace(PREFIX, "");
        return parseInt(numPart);
      })
      .filter(num => !isNaN(num))
      .sort((a, b) => b - a);

    const nextVersionNum = versionNumbers.length > 0 ? versionNumbers[0] + 1 : 1;
    
    const formattedName = `${PREFIX}${nextVersionNum.toString().padStart(3, '0')}`;
    const targetDir = path.join(CONFIG.BACKUP_DIR, formattedName);

    // 2. Create the version-specific directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 3. Copy files from live database to versioned backup
    // UPDATED: Now looks for .json files for lowdb compatibility
    Object.keys(dbs).forEach(key => {
      const sourcePath = path.join(CONFIG.DB_DIR, `${key}.json`);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(targetDir, `${key}.json`);
        fs.copyFileSync(sourcePath, destPath);
      }
    });

    console.log(`✨ Successfully archived to: ${formattedName}`);

    // 4. Robust Rotation Logic
    const updatedEntries = fs.readdirSync(CONFIG.BACKUP_DIR)
      .filter(name => name.startsWith(PREFIX))
      .map(name => ({
        name: name,
        version: parseInt(name.replace(PREFIX, ""))
      }))
      .filter(item => !isNaN(item.version))
      .sort((a, b) => b.version - a.version);

    if (updatedEntries.length > MAX_BACKUPS) {
      const entriesToDelete = updatedEntries.slice(MAX_BACKUPS);
      
      entriesToDelete.forEach(entry => {
        const folderPath = path.join(CONFIG.BACKUP_DIR, entry.name);
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`[Rotation] 🗑️  Purged old version: ${entry.name}`);
      });
    }

    return { 
      status: "success", 
      versionName: formattedName,
      totalKept: Math.min(updatedEntries.length, MAX_BACKUPS),
      activeVersions: updatedEntries.slice(0, MAX_BACKUPS).map(e => e.name)
    };

  } catch (error) {
    console.error(`[Maintenance Error] ❌ ${error.message}`);
    throw error;
  }
};
