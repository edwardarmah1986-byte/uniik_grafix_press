const express = require('express');

const router = express.Router();

const db = require('../database/db');

ensureJobColumns();

// ============================
// GET ORDERS
// ============================
router.get('/orders', (req, res) => {

  try {

    const rows = db.prepare(`
      SELECT *
      FROM orders
      ORDER BY id DESC
    `).all();

    res.json(rows);

  } catch (err) {

    console.error(err);

    res.json([]);

  }

});

// ============================
// CREATE MANY ORDERS
// ============================
router.post('/orders/bulk', (req, res) => {

  try {

    const orders = Array.isArray(req.body.orders)
      ? req.body.orders
      : [];

    const insert = db.prepare(`
      INSERT INTO orders (
        product,
        price,
        customer,
        staff,
        date
      )
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const saveOrders = db.transaction(items => {
      items.forEach(item => {
        insert.run(
          item.product,
          Number(item.price) || 0,
          item.customer || 'Walk-in',
          item.staff || 'staff'
        );
      });
    });

    saveOrders(orders);

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

});

// ============================
// CREATE ORDER
// ============================
router.post('/orders', (req, res) => {

  try {

    const {
      product,
      price,
      customer,
      staff
    } = req.body;

    db.prepare(`

      INSERT INTO orders (

        product,
        price,
        customer,
        staff,
        date

      )

      VALUES (?, ?, ?, ?, datetime('now'))

    `).run(

      product,
      price,
      customer,
      staff

    );

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

});

// ============================
// GET JOBS
// ============================
router.get('/jobs', (req, res) => {

  try {

    const rows = db.prepare(`
      SELECT
        j.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        COALESCE((
          SELECT SUM(amount)
          FROM payments
          WHERE job_id = j.id
        ), 0) AS paid
      FROM jobs j
      LEFT JOIN customers c
        ON c.id = j.customer_id
      ORDER BY j.id DESC
    `).all();

    res.json(rows);

  } catch (err) {

    console.error(err);

    res.json([]);

  }

});

// ============================
// CREATE JOB
// ============================
router.post('/jobs', (req, res) => {

  try {

    const {
      customer_id,
      service,
      price,
      staff,
      category,
      width,
      height,
      quantity,
      cost,
      date,
      roll_id
    } = req.body;

    const materialRoll = roll_id
      ? db.prepare(`
          SELECT r.*, m.id AS material_id
          FROM material_rolls r
          JOIN materials m ON m.id = r.material_id
          WHERE r.id = ?
        `).get(roll_id)
      : null;

    const area = calculateJobArea(width, height, quantity, req.body.area);

    if (materialRoll && area > 0 && Number(materialRoll.remaining_area) < area) {
      return res.json({
        success: false,
        message: 'Selected roll does not have enough material'
      });
    }

    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO jobs (
          customer_id,
          service,
          price,
          status,
          staff,
          date,
          category,
          width,
          height,
          quantity,
          cost,
          material_id,
          roll_id,
          area
        )
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customer_id || null,
        service,
        Number(price) || 0,
        staff || 'staff',
        date || new Date().toISOString().slice(0, 10),
        category || 'large',
        Number(width) || 0,
        Number(height) || 0,
        Number(quantity) || 1,
        Number(cost) || 0,
        materialRoll ? materialRoll.material_id : null,
        materialRoll ? materialRoll.id : null,
        area
      );

      if (materialRoll && area > 0) {
        db.prepare(`
          UPDATE material_rolls
          SET remaining_area = remaining_area - ?
          WHERE id = ?
        `).run(area, materialRoll.id);

        db.prepare(`
          UPDATE materials
          SET total_area = MAX(COALESCE(total_area, 0) - ?, 0)
          WHERE id = ?
        `).run(area, materialRoll.material_id);

        db.prepare(`
          INSERT INTO material_transactions
            (material_id, roll_id, movement_type, quantity_change, area_change, note, created_at)
          VALUES (?, ?, 'consume', 0, ?, ?, datetime('now'))
        `).run(
          materialRoll.material_id,
          materialRoll.id,
          -area,
          `Job #${result.lastInsertRowid}: ${service}`
        );
      }

      return result.lastInsertRowid;
    });

    const jobId = create();

    res.json({
      success: true,
      id: jobId
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false,
      message: err.message
    });

  }

});

// ============================
// UPDATE JOB STATUS
// ============================
router.put('/jobs/:id/status', (req, res) => {

  try {

    db.prepare(`
      UPDATE jobs
      SET status = ?
      WHERE id = ?
    `).run(req.body.status || 'pending', req.params.id);

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

});

// ============================
// MARK JOB PRINTED
// ============================
router.put('/jobs/:id/print', markJobPrinted);

router.post('/jobs/:id/print', markJobPrinted);

function markJobPrinted(req, res) {

  try {

    db.prepare(`
      UPDATE jobs
      SET printed = 1,
          status = 'printed',
          printed_by = COALESCE(?, printed_by),
          printed_at = datetime('now')
      WHERE id = ?
    `).run(req.body.printed_by || req.body.user || null, req.params.id);

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

}

// ============================
// DELETE ORDER
// ============================
router.delete('/orders/:id', (req, res) => {

  try {

    db.prepare(`
      DELETE FROM orders
      WHERE id = ?
    `).run(req.params.id);

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.json({
      success: false
    });

  }

});

function ensureJobColumns() {

  addColumn('jobs', 'material_id', 'INTEGER');
  addColumn('jobs', 'roll_id', 'INTEGER');
  addColumn('jobs', 'area', 'REAL DEFAULT 0');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS material_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER,
      roll_id INTEGER,
      movement_type TEXT,
      quantity_change REAL DEFAULT 0,
      area_change REAL DEFAULT 0,
      note TEXT,
      created_at TEXT
    )
  `).run();

}

function addColumn(table, column, definition) {

  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (!columns.some(col => col.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }

}

function calculateJobArea(width, height, quantity, explicitArea) {

  const area = Number(explicitArea) || 0;

  if (area > 0) return area;

  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const qty = Number(quantity) || 1;

  if (!w || !h) return 0;

  return Number(((w * h * qty) / 144).toFixed(2));

}

module.exports = router;
