const path = require('path');
const fs = require('fs');

const CONFIG = {
  PORT: 3000,
  MASTER_SETUP_KEY: "1234",
  DB_DIR: path.join(__dirname, '..', 'database'),
  BACKUP_DIR: path.join(__dirname, '..', 'backups'),
  BACKUP_DIR: path.join(__dirname, '..', 'backups'),
  BACKUP_PREFIX: "DB_v", // Change this one time here
  MAX_BACKUPS: 3,
  DB_NAMES: ['fabricators', 'pallets', 'drawings', 'jobs', 'cart', 'application', 'logs']
};

// 1. Ensure Folders Exist
[CONFIG.DB_DIR, CONFIG.BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});



// 2. Ensure Database Files Exist (Create empty files if missing)
CONFIG.DB_NAMES.forEach(name => {
  const filePath = path.join(CONFIG.DB_DIR, `${name}.db`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, ''); // Create empty file
    console.log(`📄 Created database file: ${name}.db`);
  }
});

module.exports = CONFIG;
