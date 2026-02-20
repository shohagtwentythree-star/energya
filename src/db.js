const Datastore = require('@seald-io/nedb');
const path = require('path');
const CONFIG = require('./config');

const dbs = {};

CONFIG.DB_NAMES.forEach(name => {
  dbs[name] = new Datastore({ 
    filename: path.join(CONFIG.DB_DIR, `${name}.db`), 
    autoload: true 
  });
});

// Indexing
dbs.application.ensureIndex({ fieldName: 'username', unique: true });
dbs.logs.ensureIndex({ fieldName: 'timestamp' });

// Auto-compaction
Object.values(dbs).forEach(db => {
  db.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
});

module.exports = dbs;
