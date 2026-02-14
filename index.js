const express = require('express');
const Datastore = require('@seald-io/nedb');
const cors = require('cors'); // Required for Vite communication

const app = express();

// 1. MIDDLEWARE
app.use(cors()); // Allows your React app to talk to this API
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// 2. DATABASE INITIALIZATION
const dbs = {
    fabricators: new Datastore({ filename: 'fabricators.db', autoload: true }),
    pallets: new Datastore({ filename: 'pallets.db', autoload: true }),
    drawings: new Datastore({ filename: 'drawings.db', autoload: true }),
    jobs: new Datastore({ filename: 'jobs.db', autoload: true })
};

// 3. CRUD ROUTE GENERATOR
const createCrudRoutes = (resourceName) => {
    const db = dbs[resourceName];

    // CREATE
    app.post(`/${resourceName}`, (req, res) => {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ status: "error", message: "No data provided" });
        }
        db.insert(req.body, (err, doc) => {
            if (err) return res.status(500).json({ status: "error", message: err.message });
            res.status(201).json({ status: "success", data: doc });
        });
    });

    // READ ALL
    app.get(`/${resourceName}`, (req, res) => {
        db.find({}, (err, docs) => {
            if (err) return res.status(500).json({ status: "error", message: err.message });
            res.json({ status: "success", count: docs.length, data: docs });
        });
    });

    // READ ONE
    app.get(`/${resourceName}/:id`, (req, res) => {
        db.findOne({ _id: req.params.id }, (err, doc) => {
            if (err) return res.status(500).json({ status: "error", message: err.message });
            if (!doc) return res.status(404).json({ status: "error", message: "Resource not found" });
            res.json({ status: "success", data: doc });
        });
    });

    // UPDATE
    app.put(`/${resourceName}/:id`, (req, res) => {
        db.update({ _id: req.params.id }, { $set: req.body }, {}, (err, numReplaced) => {
            if (err) return res.status(500).json({ status: "error", message: err.message });
            if (numReplaced === 0) return res.status(404).json({ status: "error", message: "Resource not found" });
            res.json({ status: "success", message: "Updated successfully" });
        });
    });

    // DELETE
    app.delete(`/${resourceName}/:id`, (req, res) => {
        db.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
            if (err) return res.status(500).json({ status: "error", message: err.message });
            if (numRemoved === 0) return res.status(404).json({ status: "error", message: "Resource not found" });
            res.json({ status: "success", message: "Deleted successfully" });
        });
    });
};

// INITIALIZE ROUTES
Object.keys(dbs).forEach(resource => createCrudRoutes(resource));

// 4. ERROR HANDLING
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server live: http://localhost:${PORT}`);
    console.log(`📡 CORS enabled for Vite development`);
});
