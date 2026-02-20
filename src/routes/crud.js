const express = require('express');

/**
 * Generates standard CRUD routes for a given resource
 * @param {object} app - The Express application instance
 * @param {object} dbs - The object containing all NeDB instances
 * @param {string} resourceName - The name of the DB/route (e.g., 'pallets')
 */
const createCrudRoutes = (app, dbs, resourceName) => {
  const db = dbs[resourceName];
  const routePath = `/${resourceName}`;

  // CREATE
  app.post(routePath, (req, res) => {
    db.insert(req.body, (err, doc) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ status: "success", data: doc });
    });
  });

  // READ ALL
  app.get(routePath, (req, res) => {
    db.find({}, (err, docs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: "success", data: docs });
    });
  });

  // READ ONE
  app.get(`${routePath}/:id`, (req, res) => {
    db.findOne({ _id: req.params.id }, (err, doc) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!doc) return res.status(404).json({ status: "error", message: "Not found" });
      res.json({ status: "success", data: doc });
    });
  });

  // UPDATE
  app.put(`${routePath}/:id`, (req, res) => {
    db.update({ _id: req.params.id }, { $set: req.body }, {}, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: "success" });
    });
  });

  // DELETE
  app.delete(`${routePath}/:id`, (req, res) => {
    db.remove({ _id: req.params.id }, {}, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: "success" });
    });
  });
};

module.exports = createCrudRoutes;
