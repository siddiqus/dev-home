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

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
// Append-only list of migration functions. Each runs once, in order, inside a
// transaction. Never reorder or remove existing entries — only append new ones.
// ---------------------------------------------------------------------------

type Migration = (d: Database.Database) => void;

const MIGRATIONS: Migration[] = [
  // 1 – create notes table (original schema)
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('free_text', 'jira_ticket', 'github_pr')),
        content TEXT NOT NULL DEFAULT '',
        reference_id TEXT DEFAULT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 2 – create kanban_items table (original schema)
  (d) => {
    d.exec(`
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
  },

  // 3 – add title column to notes
  (d) => {
    const columns = d.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "title")) {
      d.exec("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
    }
  },

  // 4 – drop CHECK constraint on notes.type (allow new types via app-level validation)
  (d) => {
    d.exec(`
      DROP TABLE IF EXISTS _notes_tmp;
      CREATE TABLE _notes_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        reference_id TEXT DEFAULT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        title TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO _notes_tmp (id, type, content, reference_id, resolved, created_at, updated_at, title)
        SELECT id, type, COALESCE(content, ''), reference_id, resolved, created_at, updated_at, COALESCE(title, '') FROM notes;
      DROP TABLE notes;
      ALTER TABLE _notes_tmp RENAME TO notes;
    `);
  },

  // 5 – drop CHECK constraints on kanban_items (allow new values via app-level validation)
  (d) => {
    d.exec(`
      DROP TABLE IF EXISTS _kanban_tmp;
      CREATE TABLE _kanban_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        column_name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(item_type, item_id)
      );
      INSERT INTO _kanban_tmp (id, item_type, item_id, column_name, position, created_at, updated_at)
        SELECT id, item_type, item_id, column_name, position, created_at, updated_at FROM kanban_items;
      DROP TABLE kanban_items;
      ALTER TABLE _kanban_tmp RENAME TO kanban_items;
    `);
  },

  // 6 – create saved_filters table
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filter_config TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 7 – create focus_state table
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS focus_state (
        item_id TEXT PRIMARY KEY,
        pinned_at INTEGER NULL,
        snoozed_until INTEGER NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_focus_state_snoozed ON focus_state(snoozed_until);
    `);
  },

  // 8 – add dismissed_at column to focus_state
  (d) => {
    const columns = d.prepare("PRAGMA table_info(focus_state)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "dismissed_at")) {
      d.exec("ALTER TABLE focus_state ADD COLUMN dismissed_at INTEGER NULL");
    }
  },
];

function runMigrations(d: Database.Database): void {
  d.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");

  const row = d.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  const current = row?.version ?? 0;

  if (current >= MIGRATIONS.length) return;

  for (let i = current; i < MIGRATIONS.length; i++) {
    d.transaction(() => {
      MIGRATIONS[i](d);
      d.exec("DELETE FROM schema_version");
      d.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
    })();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get (or lazily initialize) the SQLite database connection.
 * Enables WAL mode and runs pending migrations.
 */
export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");

  runMigrations(db);

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
