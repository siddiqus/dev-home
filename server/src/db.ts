import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

/**
 * Resolve the path to the SQLite database file.
 * Checks DEV_HOME_DB_PATH env var first, then falls back to ../data/notes.db.
 */
export function getDbPath(): string {
  if (process.env.DEV_HOME_DB_PATH) {
    return process.env.DEV_HOME_DB_PATH;
  }

  const dataDir = path.resolve(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return path.join(dataDir, "notes.db");
}

/**
 * Get (or lazily initialize) the SQLite database connection.
 * Enables WAL mode and creates the schema on first call.
 */
export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('free_text', 'jira_ticket', 'github_pr')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      reference_id TEXT DEFAULT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kanban_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL CHECK(item_type IN ('note', 'pr', 'review')),
      item_id TEXT NOT NULL,
      column_name TEXT NOT NULL CHECK(column_name IN ('todo', 'in_progress', 'on_hold', 'in_review', 'done')),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_type, item_id)
    );
  `);

  // Migration: add title column if missing (existing databases)
  const columns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "title")) {
    db.exec("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
  }

  return db;
}

/**
 * Close the database connection for graceful shutdown.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
