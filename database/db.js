const path = require('path');

const databasePath = path.join(__dirname, '..', 'database.db');

let db;

try {
  const { DatabaseSync } = require('node:sqlite');

  db = new DatabaseSync(databasePath);
} catch (err) {
  const Database = require('better-sqlite3');

  db = new Database(databasePath);
}

db.exec('PRAGMA foreign_keys = ON');

if (typeof db.transaction !== 'function') {
  db.transaction = fn => (...args) => {
    db.exec('BEGIN');

    try {
      const result = fn(...args);

      db.exec('COMMIT');

      return result;
    } catch (err) {
      db.exec('ROLLBACK');

      throw err;
    }
  };
}

module.exports = db;
