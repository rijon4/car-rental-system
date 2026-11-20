const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
let cachedDb = null;

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getDb() {
  if (cachedDb) return cachedDb;
  let db = load();
  if (!db) {
    db = {
      vehicles: [],
      customers: [],
      rentals: [],
      payments: [],
      logs: [],
      sessions: [],
      users: [
        { id: 'u1', username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      ],
      settings: {
        taxRate: 0.08,
        lateFeePerDay: 50,
        currency: 'USD',
      },
    };
    save(db);
  }
  cachedDb = db;
  return db;
}

module.exports = { getDb, save, load, DB_PATH };
