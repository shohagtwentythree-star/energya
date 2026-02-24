import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import CONFIG from './config.js'; // Extension is required in ESM

const dbs = {};

/**
 * INITIALIZATION LOOP
 * We use an async loop to ensure every database is ready
 * before the rest of the server logic attempts to use them.
 */
for (const name of CONFIG.DB_NAMES) {
  const dbPath = path.join(CONFIG.DB_DIR, `${name}.json`);
  
  // 1. Define Default Data
  // LowDB needs to know the structure of a new file.
  const defaultData = name === 'application' 
    ? { users: [], settings: {} } 
    : { data: [] };

  // 2. Initialize the Preset
  // This automatically reads the file OR creates it with defaultData if missing.
  // We use structuredClone to prevent shared references in memory.
  dbs[name] = await JSONFilePreset(dbPath, structuredClone(defaultData));
}

/**
 * INDEXING & MAINTENANCE:
 * NeDB's .ensureIndex() and .setAutocompactionInterval() are gone.
 * 1. Searching: You now use high-speed native JS array methods (find/filter).
 * 2. Compaction: Not needed; LowDB replaces the file on every write.
 */

export default dbs;
