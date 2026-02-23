const express = require('express');

/**
 * Optimized CRUD Router Generator
 * Maintains full functionality while increasing speed and stability.
 */
const createCrudRoutes = (dbs, resourceName) => {
  const router = express.Router(); // Using Router instead of App for faster lookups
  const db = dbs[resourceName];

  if (!db) {
    console.warn(`⚠️ Warning: Resource [${resourceName}] has no database instance.`);
    return router;
  }

  // --- 1. CREATE ---
  router.post('/', (req, res) => {
    db.insert(req.body, (err, doc) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ status: "success", data: doc });
    });
  });

  // --- 2. READ ALL (Optimized with Limit & Projection) ---
  router.get('/', (req, res) => {
    // Safeguard: Limit to 1000 items by default to prevent memory crashes
    // but allow the frontend to override it via query params.
    const limit = parseInt(req.query.limit) || 1000;
    const skip = parseInt(req.query.skip) || 0;

    db.find({})
      .sort({ timestamp: -1 }) // Assuming items have timestamps for better UX
      .skip(skip)
      .limit(limit)
      .exec((err, docs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ 
          status: "success", 
          data: docs,
          meta: { count: docs.length, limit, skip } // Added meta for easier front-end paging
        });
      });
  });

  // --- 3. READ ONE ---
  router.get('/:id', (req, res) => {
    db.findOne({ _id: req.params.id }, (err, doc) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ status: "error", message: "Not found" });
      res.json({ status: "success", data: doc });
    });
  });

  // --- 4. UPDATE ---
  router.put('/:id', (req, res) => {
    // Optimization: returnUpdatedDocs: true ensures the frontend gets the NEW data immediately
    db.update(
      { _id: req.params.id }, 
      { $set: req.body }, 
      { returnUpdatedDocs: true }, 
      (err, numReplaced, affectedDoc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "success", data: affectedDoc });
      }
    );
  });

  // --- 5. DELETE ---
  router.delete('/:id', (req, res) => {
    db.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: "success", deletedCount: numRemoved });
    });
  });

  return router;
};

module.exports = createCrudRoutes;
