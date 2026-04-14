import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'poker.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  chips INTEGER NOT NULL DEFAULT 10000,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  small_blind INTEGER NOT NULL,
  big_blind INTEGER NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 6,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  hand_no INTEGER NOT NULL,
  board TEXT,
  pot INTEGER NOT NULL,
  winners TEXT,
  actions TEXT,
  ended_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hands_room ON hands(room_id, ended_at DESC);
`);

export const qUserByName = db.prepare('SELECT * FROM users WHERE username = ?');
export const qUserById = db.prepare('SELECT id, username, nickname, chips FROM users WHERE id = ?');
export const qInsertUser = db.prepare(
  'INSERT INTO users (username, password_hash, nickname, chips, created_at) VALUES (?, ?, ?, ?, ?)'
);
export const qUpdateChips = db.prepare('UPDATE users SET chips = ? WHERE id = ?');

export const qInsertRoom = db.prepare(
  'INSERT INTO rooms (id, name, small_blind, big_blind, max_seats, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
export const qListRooms = db.prepare('SELECT * FROM rooms ORDER BY created_at DESC LIMIT 50');
export const qRoomById = db.prepare('SELECT * FROM rooms WHERE id = ?');

export const qInsertHand = db.prepare(
  'INSERT INTO hands (room_id, hand_no, board, pot, winners, actions, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
export const qHandsByRoom = db.prepare(
  'SELECT * FROM hands WHERE room_id = ? ORDER BY ended_at DESC LIMIT 20'
);
