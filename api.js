const express = require('express');
const Datastore = require('@seald-io/nedb');
const cors = require('cors');

const app = express();

/* =========================
   1. MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

/* =========================
   2. DATABASES
========================= */
const dbs = {
  drawings: new Datastore({ filename: 'drawings.db', autoload: true }),
  fabricators: new Datastore({ filename: 'fabricators.db', autoload: true }),
  pallets: new Datastore({ filename: 'pallets.db', autoload: true }),
};

/* =========================
   3. HELPERS
========================= */
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isNumber = (v) => typeof v === 'number' && !isNaN(v);

/* =========================
   4. VALIDATORS
========================= */
function validateFabricator(data) {
  const errors = [];

  if (!isNonEmptyString(data.name)) errors.push('name is required');
  if (!isNonEmptyString(data.table)) errors.push('table is required');
  if (!isNumber(data.headCount)) errors.push('headCount must be number');

  if (!['day', 'night'].includes(data.shift))
    errors.push('shift must be day or night');

  if (!isNonEmptyString(data.status)) errors.push('status is required');

  return errors;
}

function validateDrawing(data) {
  const errors = [];

  if (!isNonEmptyString(data.drawingNumber))
    errors.push('drawingNumber is required');

  if (!isNonEmptyString(data.deliverTo))
    errors.push('deliverTo (fabricator) is required');

  if (!['new', 'looking', 'complete', 'delivered'].includes(data.status))
    errors.push('invalid status');

  if (!Array.isArray(data.palates))
    errors.push('palates must be an array');

  if (Array.isArray(data.palates)) {
    data.palates.forEach((p, i) => {
      if (!isNonEmptyString(p.mark))
        errors.push(`palates[${i}].mark required`);
      if (!isNonEmptyString(p.profile))
        errors.push(`palates[${i}].profile required`);
      if (!isNumber(p.length))
        errors.push(`palates[${i}].length must be number`);
      if (!isNumber(p.width))
        errors.push(`palates[${i}].width must be number`);
      if (!isNumber(p.thickness))
        errors.push(`palates[${i}].thickness must be number`);
      if (!isNumber(p.quantity))
        errors.push(`palates[${i}].quantity must be number`);
    });
  }

  return errors;
}

function validatePallet(data) {
  const errors = [];

  if (!isNumber(data.x)) errors.push('x must be number');
  if (!isNumber(data.y)) errors.push('y must be number');

  data.z = 0; // always force z = 0

  if (!Array.isArray(data.palates))
    errors.push('palates must be array');

  if (Array.isArray(data.palates)) {
    data.palates.forEach((p, i) => {
      if (!isNonEmptyString(p.mark))
        errors.push(`palates[${i}].mark required`);
    });
  }

  return errors;
}

/* =========================
   5. CRUD FACTORY
========================= */
function createCrud(resource, validator) {
  const db = dbs[resource];

  // CREATE
  app.post(`/${resource}`, (req, res) => {
    const errors = validator ? validator(req.body) : [];
    if (errors.length)
      return res.status(400).json({ status: 'error', errors });

    db.insert(req.body, (err, doc) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(doc);
    });
  });

  // READ ALL
  app.get(`/${resource}`, (req, res) => {
    db.find({}, (err, docs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(docs);
    });
  });

  // READ ONE
  app.get(`/${resource}/:id`, (req, res) => {
    db.findOne({ _id: req.params.id }, (err, doc) => {
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);
    });
  });

  // UPDATE
  app.put(`/${resource}/:id`, (req, res) => {
    const errors = validator ? validator(req.body) : [];
    if (errors.length)
      return res.status(400).json({ status: 'error', errors });

    db.update(
      { _id: req.params.id },
      { $set: req.body },
      {},
      (err, count) => {
        if (!count) return res.status(404).json({ error: 'Not found' });
        res.json({ status: 'updated' });
      }
    );
  });

  // DELETE
  app.delete(`/${resource}/:id`, (req, res) => {
    db.remove({ _id: req.params.id }, {}, (err, count) => {
      if (!count) return res.status(404).json({ error: 'Not found' });
      res.json({ status: 'deleted' });
    });
  });
}

/* =========================
   6. INIT ROUTES
========================= */
createCrud('fabricators', validateFabricator);
createCrud('drawings', validateDrawing);
createCrud('pallets', validatePallet);

/* =========================
   7. SERVER
========================= */
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 API running at http://localhost:${PORT}`);
});