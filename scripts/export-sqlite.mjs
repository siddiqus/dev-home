#!/usr/bin/env node
// Convert a Dev Home desktop database (notes.db) into a web backup file.
// Usage: node scripts/export-sqlite.mjs <path/to/notes.db> [out.json]
// Requires the `sqlite3` CLI (preinstalled on macOS).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [dbPath, outPath = `dev-home-backup-${new Date().toISOString().slice(0, 10)}.json`] =
  process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: node scripts/export-sqlite.mjs <path/to/notes.db> [out.json]");
  process.exit(1);
}

function query(sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
  return out.trim() ? JSON.parse(out) : [];
}

function tableExists(name) {
  return query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0;
}

function collection(table) {
  const rows = tableExists(table) ? query(`SELECT * FROM ${table}`) : [];
  const nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return { nextId, rows };
}

const data = {
  notes: collection("notes"),
  kanban_items: collection("kanban_items"),
  saved_filters: collection("saved_filters"),
  jira_jql_filters: collection("jira_jql_filters"),
  teams: collection("teams"),
  team_members: collection("team_members"),
};

// saved_filters.filter_config is stored as a JSON string in SQLite.
for (const row of data.saved_filters.rows) {
  try {
    row.filter_config = JSON.parse(row.filter_config);
  } catch {
    row.filter_config = { authors: [], repos: [] };
  }
}

data.focus_state = {};
if (tableExists("focus_state")) {
  for (const r of query("SELECT * FROM focus_state")) {
    data.focus_state[r.item_id] = {
      pinnedAt: r.pinned_at,
      snoozedUntil: r.snoozed_until,
      dismissedAt: r.dismissed_at ?? null,
      updatedAt: r.updated_at,
    };
  }
}

data.sprint_snapshots = {};
if (tableExists("sprint_snapshots")) {
  for (const r of query("SELECT * FROM sprint_snapshots")) {
    (data.sprint_snapshots[r.sprint_id] ??= {})[r.snapshot_date] = {
      doneCount: r.done_count,
      totalCount: r.total_count,
    };
  }
}

const backup = { app: "dev-home", version: 1, exportedAt: new Date().toISOString(), data, settings: {} };
writeFileSync(outPath, JSON.stringify(backup, null, 2));
console.log(`Wrote ${outPath}`);
