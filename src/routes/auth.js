import express from 'express';
import bcrypt from 'bcryptjs';
import dbs from '../db.js';
import CONFIG from '../config.js';

const router = express.Router();

// --- 1. REGISTER ---
router.post('/register', async (req, res) => {
  const { username, password, setupKey } = req.body;
  
  if (setupKey !== CONFIG.MASTER_SETUP_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid Master Setup Key" });
  }

  try {
    // Lowdb v7: Direct array access for faster lookups
    const existingUser = dbs.application.data.users.find(u => u.username === username);

    if (existingUser) {
      return res.status(400).json({ status: "error", message: "User exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    // Use .update() to modify the in-memory state and sync to application.json
    await dbs.application.update(({ users }) => {
      users.push(newUser);
    });

    res.status(201).json({ status: "success", data: { username: newUser.username } });
  } catch (e) {
    console.error('Registration Error:', e);
    res.status(500).json({ status: "error", message: "Internal storage error" });
  }
});

// --- 2. LOGIN ---
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Standard JS .find() on the loaded JSON data
    const user = dbs.application.data.users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: "error", message: "Invalid credentials" });
    }

    res.json({ status: "success", user: { username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Login service unavailable" });
  }
});

// --- 3. UPDATE USER ---
router.post('/update', async (req, res) => {
  const { currentUsername, newUsername, newPassword, key } = req.body;

  // 🛡️ Security Check
  if (key !== 'Shohag4750') {
    return res.status(401).json({ status: "error", message: "Unauthorized Admin Key" });
  }

  try {
    let userFound = false;

    // We use .update() to find and modify the user record safely
    await dbs.application.update(({ users }) => {
      const userIndex = users.findIndex(u => u.username === currentUsername);
      
      if (userIndex !== -1) {
        userFound = true;
        
        if (newUsername) users[userIndex].username = newUsername;
        
        // Handle password hashing if a new password is provided
        if (newPassword) {
          users[userIndex].password = bcrypt.hashSync(newPassword, 10);
        }
        
        users[userIndex].updatedAt = new Date().toISOString();
      }
    });

    if (!userFound) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    res.json({ status: "success", message: "Personnel record updated" });
  } catch (err) {
    console.error('Update Error:', err);
    res.status(500).json({ status: "error", message: "System update error" });
  }
});

export default router;
