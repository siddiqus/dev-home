/**
 * Migration + round-trip tests for the notes DB schema.
 *
 * getDb() is a module-level singleton, so we point DEV_HOME_DB_PATH at a unique
 * temp file BEFORE the first getDb() call and use vi.resetModules() + a dynamic
 * import to get a fresh module bound to that temp path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

describe("notes remind_at migration", () => {
  let dbPath: string;
  const originalEnv = process.env.DEV_HOME_DB_PATH;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `dev-home-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    process.env.DEV_HOME_DB_PATH = dbPath;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEV_HOME_DB_PATH;
    } else {
      process.env.DEV_HOME_DB_PATH = originalEnv;
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) {
        fs.rmSync(p);
      }
    }
  });

  it("adds a remind_at column to the notes table", async () => {
    const { getDb, closeDb } = await import("./db");
    const db = getDb();
    try {
      const columns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
      expect(columns.some((c) => c.name === "remind_at")).toBe(true);
    } finally {
      closeDb();
    }
  });

  it("round-trips a note with a remind_at value", async () => {
    const { getDb, closeDb } = await import("./db");
    const db = getDb();
    try {
      const remindAt = "2026-07-28T10:00:00Z";
      const result = db
        .prepare("INSERT INTO notes (type, content, remind_at) VALUES (?, ?, ?)")
        .run("free_text", "reminder note", remindAt);

      const row = db
        .prepare("SELECT remind_at FROM notes WHERE id = ?")
        .get(result.lastInsertRowid) as { remind_at: string | null };

      expect(row.remind_at).toBe(remindAt);
    } finally {
      closeDb();
    }
  });

  it("allows a note with a NULL remind_at", async () => {
    const { getDb, closeDb } = await import("./db");
    const db = getDb();
    try {
      const result = db
        .prepare("INSERT INTO notes (type, content, remind_at) VALUES (?, ?, ?)")
        .run("free_text", "no reminder", null);

      const row = db
        .prepare("SELECT remind_at FROM notes WHERE id = ?")
        .get(result.lastInsertRowid) as { remind_at: string | null };

      expect(row.remind_at).toBeNull();
    } finally {
      closeDb();
    }
  });
});
