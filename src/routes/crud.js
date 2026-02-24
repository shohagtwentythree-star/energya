import express from 'express';

/**
 * Modernized CRUD Router Generator
 * Adapted for Lowdb v7+ and ES Modules.
 */
const createCrudRoutes = (dbs, resourceName) => {
  const router = express.Router();
  const db = dbs[resourceName];

  if (!db) {
    console.warn(`⚠️ Warning: Resource [${resourceName}] has no database instance.`);
    return router;
  }

  // --- 1. CREATE ---
  router.post('/', async (req, res) => {
    try {
      const newItem = {
        ...req.body,
        id: Date.now().toString(), // Lowdb doesn't auto-generate _id like NeDB
        createdAt: new Date().toISOString()
      };

      // .update() modifies the data in memory AND writes to disk automatically
      await db.update(({ data }) => data.push(newItem));

      res.status(201).json({ status: "success", data: newItem });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // --- 2. READ ALL (Optimized) ---
  router.get('/', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 1000;
      const skip = parseInt(req.query.skip) || 0;

      // Accessing the raw array directly from db.data
      const allRecords = db.data.data || [];
      
      const results = allRecords
        .slice() // Create copy to avoid mutating original
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(skip, skip + limit);

      res.json({ 
        status: "success", 
        data: results,
        meta: { 
          total: allRecords.length,
          count: results.length, 
          limit, 
          skip 
        }
      });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // --- 3. READ ONE ---
  router.get('/:id', (req, res) => {
    const item = db.data.data.find(i => i.id === req.params.id);
    
    if (!item) {
      return res.status(404).json({ status: "error", message: "Not found" });
    }
    res.json({ status: "success", data: item });
  });

  // --- 4. UPDATE ---
  router.put('/:id', async (req, res) => {
    try {
      let updatedDoc = null;

      await db.update(({ data }) => {
        const index = data.findIndex(i => i.id === req.params.id);
        if (index > -1) {
          // Merge existing data with new body updates
          data[index] = { ...data[index], ...req.body, updatedAt: new Date().toISOString() };
          updatedDoc = data[index];
        }
      });

      if (!updatedDoc) {
        return res.status(404).json({ status: "error", message: "Not found" });
      }

      res.json({ status: "success", data: updatedDoc });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // --- 5. DELETE ---
  router.delete('/:id', async (req, res) => {
    try {
      let deletedCount = 0;

      await db.update(({ data }) => {
        const index = data.findIndex(i => i.id === req.params.id);
        if (index > -1) {
          data.splice(index, 1);
          deletedCount = 1;
        }
      });

      res.json({ status: "success", deletedCount });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  return router;
};

export default createCrudRoutes;
