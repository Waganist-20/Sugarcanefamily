const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'listings.db');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      type TEXT NOT NULL,
      size REAL NOT NULL,
      price REAL NOT NULL,
      sugarcaneStatus TEXT NOT NULL,
      description TEXT NOT NULL,
      ownerName TEXT NOT NULL,
      ownerUsername TEXT,
      ownerEmail TEXT NOT NULL,
      ownerPhone TEXT,
      listingImage TEXT,
      profilePhoto TEXT,
      createdAt TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Unable to create listings table:', err);
      return;
    }

    db.all('PRAGMA table_info(listings)', (pragmaErr, columns) => {
      if (pragmaErr) {
        console.error('Unable to inspect listings schema:', pragmaErr);
        return;
      }

      const names = columns.map((column) => column.name);
      if (!names.includes('listingImage')) {
        db.run('ALTER TABLE listings ADD COLUMN listingImage TEXT');
      }
      if (!names.includes('profilePhoto')) {
        db.run('ALTER TABLE listings ADD COLUMN profilePhoto TEXT');
      }
      if (!names.includes('ownerUsername')) {
        db.run('ALTER TABLE listings ADD COLUMN ownerUsername TEXT');
      }
      if (!names.includes('ownerPhone')) {
        db.run('ALTER TABLE listings ADD COLUMN ownerPhone TEXT');
      }
    });
  });
});

module.exports = db;
