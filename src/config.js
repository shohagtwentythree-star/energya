import path from 'path';
import fs from 'fs';

const CONFIG = {
  PORT: 3000,
  MASTER_SETUP_KEY: "1234",
  // In ESM, __dirname is replaced by import.meta.dirname
  DB_DIR: path.join(import.meta.dirname, '..', 'database'),
  BACKUP_DIR: path.join(import.meta.dirname, '..', 'backups'),
  BACKUP_PREFIX: "DB_v",
  MAX_BACKUPS: 3,
  DB_NAMES: ['fabricators', 'pallets', 'drawings', 'cart', 'application', 'logs']
};

// 1. Ensure Folders Exist
[CONFIG.DB_DIR, CONFIG.BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// 2. Ensure Database Files Exist
// Updated to .json for Lowdb compatibility
CONFIG.DB_NAMES.forEach(name => {
  const filePath = path.join(CONFIG.DB_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    // Lowdb expects at least an empty object or array to parse correctly
    const initialData = name === 'application' ? { users: [] } : { data: [] };
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    console.log(`📄 Created JSON database file: ${name}.json`);
  }
});

export default CONFIG;
