const express = require('express');

const router = express.Router();

const db = require('../database/db');

const ROLL_UNITS = new Set(['roll', 'rolls', 'sqm', 'sqft', 'sq.ft']);

const MATERIAL_CATALOG = [
  ...rollCatalog('Large Format', 'Flexy', ['Glossy', 'Mat'], [8, 7, 6, 5, 4, 3]),
  ...rollCatalog('Large Format', 'Reflective', ['Glossy'], [8, 7, 6, 5, 4, 3]),
  ...rollCatalog('Large Format', 'One-way', ['Glossy', 'Mat'], [5, 4, 3]),
  ...rollCatalog('Large Format', 'Sticker', ['Glossy', 'Mat'], [5, 4, 3]),
  ...countCatalog('Large Format Consumables', [
    ['Ink Cyan', 'Ink', 'Cyan', 'bottle'],
    ['Ink Red', 'Ink', 'Red', 'bottle'],
    ['Ink Blue', 'Ink', 'Blue', 'bottle'],
    ['Ink Black', 'Ink', 'Black', 'bottle'],
    ['Solvent', 'Solvent', '', 'bottle'],
    ['Eyelets', 'Finishing', '', 'pack'],
    ['Print Head', 'Parts', '', 'pcs'],
    ['Head Cable', 'Parts', '', 'pcs'],
    ['Damper', 'Parts', '', 'pcs'],
    ['Cap', 'Parts', '', 'pcs'],
    ['Encoder Strip', 'Parts', '', 'pcs']
  ]),
  ...countCatalog('Digital Printing Materials', [
    ['Brown Envelope A4', 'Envelope', 'A4', 'pack'],
    ['Brown Envelope A5', 'Envelope', 'A5', 'pack'],
    ['A4 White Paper', 'Paper', 'A4', 'rim'],
    ['A3 White Paper', 'Paper', 'A3', 'rim'],
    ['A4 Color Paper', 'Paper', 'A4 Color', 'rim'],
    ['A4 Art Paper', 'Art Paper', 'A4', 'pack'],
    ['A3 Art Paper', 'Art Paper', 'A3', 'pack'],
    ['A4 Art Card Big', 'Art Card', 'A4 Big', 'pack'],
    ['A4 Art Card Small', 'Art Card', 'A4 Small', 'pack'],
    ['A3 Art Card Big', 'Art Card', 'A3 Big', 'pack'],
    ['A3 Art Card Small', 'Art Card', 'A3 Small', 'pack'],
    ['A4 Photo Paper', 'Photo Paper', 'A4', 'pack'],
    ['A4 Photo Card', 'Photo Card', 'A4', 'pack'],
    ['Photo Paper 5in x 7in', 'Photo Paper', '5in x 7in', 'pack'],
    ['Laminate Film A4', 'Laminate Film', 'A4', 'pack'],
    ['Laminate Film A3', 'Laminate Film', 'A3', 'pack'],
    ['PVC Rubber A4', 'PVC Rubber', 'A4', 'pack'],
    ['Comb Binding', 'Binding', '', 'pack'],
    ['Stepper Pins', 'Parts', '', 'box'],
    ['Toner Red', 'Toner', 'Red 500mg', 'bottle'],
    ['Toner Cyan', 'Toner', 'Cyan 500mg', 'bottle'],
    ['Toner Blue', 'Toner', 'Blue 500mg', 'bottle'],
    ['Toner Black', 'Toner', 'Black 500mg', 'bottle'],
    ['Drum', 'Parts', '', 'pcs'],
    ['Blade', 'Parts', '', 'pcs']
  ])
];

ensureInventoryTables();
seedMaterialCatalog();

router.get('/materials', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        m.*,
        COALESCE(SUM(r.remaining_area), 0) AS roll_area,
        COUNT(r.id) AS roll_count
      FROM materials m
      LEFT JOIN material_rolls r
        ON r.material_id = m.id
        AND r.remaining_area > 0
      GROUP BY m.id
      ORDER BY m.category, m.name, m.size, m.type
    `).all();

    res.json(rows.map(materialView));
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post('/materials', (req, res) => {
  try {
    const payload = normalizeMaterial(req.body);

    if (!payload.name || payload.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Material name and quantity are required'
      });
    }

    const result = addMaterialStock(payload, 'purchase', 'Manual stock entry');

    res.json({
      success: true,
      material_id: result.material_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false
    });
  }
});

router.get('/materials/:id/rolls', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *
      FROM material_rolls
      WHERE material_id = ?
      ORDER BY remaining_area DESC, id ASC
    `).all(req.params.id);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post('/materials/:id/consume', (req, res) => {
  try {
    const materialId = Number(req.params.id);
    const area = Number(req.body.area || req.body.area_used || 0);
    const quantity = Number(req.body.quantity || 0);
    const rollId = req.body.roll_id ? Number(req.body.roll_id) : null;

    consumeMaterial({
      materialId,
      rollId,
      area,
      quantity,
      note: req.body.note || 'Manual consumption'
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

router.delete('/materials/:id', (req, res) => {
  try {
    const id = Number(req.params.id);

    db.prepare('DELETE FROM material_rolls WHERE material_id = ?').run(id);
    db.prepare('DELETE FROM material_transactions WHERE material_id = ?').run(id);
    db.prepare('DELETE FROM materials WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

function ensureInventoryTables() {
  addColumn('materials', 'reorder_level', 'REAL DEFAULT 0');
  addColumn('material_rolls', 'roll_name', 'TEXT');
  addColumn('material_rolls', 'material_type', 'TEXT');
  addColumn('material_rolls', 'date_added', 'TEXT');

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

function seedMaterialCatalog() {
  const exists = db.prepare(`
    SELECT id
    FROM materials
    WHERE lower(name) = lower(?)
      AND lower(COALESCE(category, '')) = lower(?)
      AND lower(COALESCE(type, '')) = lower(?)
      AND lower(COALESCE(size, '')) = lower(?)
    LIMIT 1
  `);

  const insert = db.prepare(`
    INSERT INTO materials (name, category, type, size, unit, quantity, total_area, reorder_level)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `);

  const seed = db.transaction(() => {
    MATERIAL_CATALOG.forEach(item => {
      const found = exists.get(
        item.name,
        item.category || '',
        item.type || '',
        item.size || ''
      );

      if (!found) {
        insert.run(
          item.name,
          item.category,
          item.type,
          item.size,
          item.unit,
          item.reorder_level || 0
        );
      }
    });
  });

  seed();
}

function addMaterialStock(payload, movementType, note) {
  let material = findMaterial(payload);

  if (!material) {
    const result = db.prepare(`
      INSERT INTO materials (name, category, type, size, unit, quantity, total_area, reorder_level)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      payload.name,
      payload.category,
      payload.type,
      payload.size,
      payload.unit,
      payload.reorder_level
    );

    material = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid);
  }

  const areaPerUnit = calculateMaterialArea(payload.size);
  const isRoll = areaPerUnit > 0 || ROLL_UNITS.has(String(payload.unit).toLowerCase());
  const totalAreaAdded = isRoll ? areaPerUnit * payload.quantity : 0;

  const addStock = db.transaction(() => {
    db.prepare(`
      UPDATE materials
      SET quantity = COALESCE(quantity, 0) + ?,
          total_area = COALESCE(total_area, 0) + ?,
          unit = COALESCE(NULLIF(?, ''), unit),
          category = COALESCE(NULLIF(?, ''), category),
          type = COALESCE(NULLIF(?, ''), type),
          size = COALESCE(NULLIF(?, ''), size)
      WHERE id = ?
    `).run(
      payload.quantity,
      totalAreaAdded,
      payload.unit,
      payload.category,
      payload.type,
      payload.size,
      material.id
    );

    if (isRoll && areaPerUnit > 0) {
      for (let i = 0; i < payload.quantity; i += 1) {
        const rollName = `${payload.name} ${payload.size} #${i + 1}`;

        const roll = db.prepare(`
          INSERT INTO material_rolls
            (material_id, size, total_area, remaining_area, created_at, waste_area, roll_name, material_type, date_added)
          VALUES (?, ?, ?, ?, datetime('now'), 0, ?, ?, datetime('now'))
        `).run(
          material.id,
          payload.size,
          areaPerUnit,
          areaPerUnit,
          rollName,
          payload.type
        );

        logTransaction(material.id, roll.lastInsertRowid, movementType, 1, areaPerUnit, note);
      }
    } else {
      logTransaction(material.id, null, movementType, payload.quantity, 0, note);
    }
  });

  addStock();

  return { material_id: material.id };
}

function consumeMaterial({ materialId, rollId, area, quantity, note }) {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);

  if (!material) {
    throw new Error('Material not found');
  }

  if (area > 0) {
    const roll = rollId
      ? db.prepare('SELECT * FROM material_rolls WHERE id = ? AND material_id = ?').get(rollId, materialId)
      : db.prepare(`
          SELECT *
          FROM material_rolls
          WHERE material_id = ?
            AND remaining_area >= ?
          ORDER BY remaining_area ASC
          LIMIT 1
        `).get(materialId, area);

    if (!roll) {
      throw new Error('No roll has enough remaining material');
    }

    if (Number(roll.remaining_area) < area) {
      throw new Error('Selected roll does not have enough remaining material');
    }

    const consume = db.transaction(() => {
      db.prepare(`
        UPDATE material_rolls
        SET remaining_area = remaining_area - ?
        WHERE id = ?
      `).run(area, roll.id);

      db.prepare(`
        UPDATE materials
        SET total_area = MAX(COALESCE(total_area, 0) - ?, 0)
        WHERE id = ?
      `).run(area, materialId);

      logTransaction(materialId, roll.id, 'consume', 0, -area, note);
    });

    consume();
    return;
  }

  if (quantity <= 0) {
    throw new Error('Enter area or quantity to consume');
  }

  if (Number(material.quantity) < quantity) {
    throw new Error('Not enough stock quantity');
  }

  const consumeQty = db.transaction(() => {
    db.prepare(`
      UPDATE materials
      SET quantity = quantity - ?
      WHERE id = ?
    `).run(quantity, materialId);

    logTransaction(materialId, null, 'consume', -quantity, 0, note);
  });

  consumeQty();
}

function logTransaction(materialId, rollId, movementType, quantityChange, areaChange, note) {
  db.prepare(`
    INSERT INTO material_transactions
      (material_id, roll_id, movement_type, quantity_change, area_change, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(materialId, rollId, movementType, quantityChange, areaChange, note);
}

function normalizeMaterial(body) {
  return {
    name: String(body.name || '').trim(),
    category: String(body.category || '').trim(),
    type: String(body.type || '').trim(),
    size: String(body.size || '').trim(),
    unit: String(body.unit || '').trim() || 'pcs',
    quantity: Math.max(0, Math.floor(Number(body.quantity || body.qty || 0))),
    reorder_level: Number(body.reorder_level || body.reorderLevel || 0)
  };
}

function findMaterial(payload) {
  return db.prepare(`
    SELECT *
    FROM materials
    WHERE lower(name) = lower(?)
      AND lower(COALESCE(category, '')) = lower(?)
      AND lower(COALESCE(type, '')) = lower(?)
      AND lower(COALESCE(size, '')) = lower(?)
    LIMIT 1
  `).get(
    payload.name,
    payload.category || '',
    payload.type || '',
    payload.size || ''
  );
}

function materialView(row) {
  const rollArea = Number(row.roll_area || 0);
  const totalArea = rollArea > 0 ? rollArea : Number(row.total_area || 0);
  const quantity = Number(row.quantity || 0);
  const reorderLevel = Number(row.reorder_level || 0);

  return {
    ...row,
    quantity,
    total_area: totalArea,
    roll_count: Number(row.roll_count || 0),
    is_low: totalArea > 0
      ? totalArea <= Math.max(reorderLevel, 50)
      : quantity <= Math.max(reorderLevel, 1)
  };
}

function calculateMaterialArea(sizeText) {
  if (!sizeText) return 0;

  const cleaned = String(sizeText)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/by/g, 'x');

  const match = cleaned.match(/(\d+(?:\.\d+)?)(ft|m|in)?x(\d+(?:\.\d+)?)(ft|m|in)?/);

  if (!match) return 0;

  let width = Number(match[1]);
  let height = Number(match[3]);
  const widthUnit = match[2] || 'ft';
  const heightUnit = match[4] || 'm';

  if (widthUnit === 'm') width *= 3.28084;
  if (heightUnit === 'm') height *= 3.28084;
  if (widthUnit === 'in') width /= 12;
  if (heightUnit === 'in') height /= 12;

  return Number((width * height).toFixed(2));
}

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (!columns.some(col => col.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function rollCatalog(category, name, types, widths) {
  return widths.flatMap(width => types.map(type => ({
    name,
    category,
    type,
    size: `${width}ft x 50m`,
    unit: 'roll',
    reorder_level: 50
  })));
}

function countCatalog(category, rows) {
  return rows.map(([name, itemCategory, type, unit]) => ({
    name,
    category: itemCategory || category,
    type,
    size: type,
    unit,
    reorder_level: 1
  }));
}

module.exports = router;
