const express = require('express');

const router = express.Router();

const bcrypt = require('bcrypt');

const db = require('../database/db');

// ============================
// LOGIN
// ============================
router.post('/login', async (req, res) => {

  try {

    const {
      username,
      password
    } = req.body;

    const user = db.prepare(`
      SELECT * FROM users
      WHERE username = ?
    `).get(username);

    if (!user) {

      return res.json({
        success: false,
        message: 'Invalid username'
      });

    }

    const match =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!match) {

      return res.json({
        success: false,
        message: 'Wrong password'
      });

    }

    res.json({
      success: true,
      username: user.username,
      role: user.role
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

});

module.exports = router;