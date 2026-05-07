const express = require('express');

const router = express.Router();

const db = require('../database/db');

router.get('/analytics/production-summary', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS totalPrinted,
        COALESCE(SUM(area), 0) AS totalArea,
        COALESCE(SUM(price), 0) AS totalRevenue,
        COALESCE(SUM(cost), 0) AS totalCost,
        COALESCE(SUM(price - COALESCE(cost, 0)), 0) AS totalProfit
      FROM jobs
      WHERE printed = 1 OR status = 'printed'
    `).get();

    const waste = db.prepare(`
      SELECT COALESCE(SUM(wasted_area), 0) AS totalWaste
      FROM waste_logs
    `).get();

    const totalArea = Number(summary.totalArea || 0);
    const totalWaste = Number(waste.totalWaste || 0);
    const efficiency = totalArea + totalWaste > 0
      ? (totalArea / (totalArea + totalWaste)) * 100
      : 100;

    res.json({
      ...summary,
      totalWaste,
      efficiency
    });
  } catch (err) {
    console.error(err);
    res.json({
      totalPrinted: 0,
      totalArea: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      totalWaste: 0,
      efficiency: 100
    });
  }
});

router.get('/analytics/revenue-cost', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(price), 0) AS revenue,
        COALESCE(SUM(cost), 0) AS cost
      FROM jobs
    `).get();

    res.json(row);
  } catch (err) {
    console.error(err);
    res.json({ revenue: 0, cost: 0 });
  }
});

router.get('/analytics/staff-performance', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT staff, COUNT(*) AS total
      FROM jobs
      GROUP BY staff
      ORDER BY total DESC
    `).all();

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

module.exports = router;
