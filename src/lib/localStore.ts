/**
 * Browser-local persistence that replaces the desktop app's SQLite tables.
 * Collections keep the old row shape (numeric auto-increment `id`) so the
 * service modules and UI didn't have to change.
 */
export const DB_PREFIX = "dev-home:db:";

/** UTC timestamp in SQLite's `datetime('now')` format. */
export function sqliteNow(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(DB_PREFIX + key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(DB_PREFIX + key, JSON.stringify(value));
}

export interface Collection<T extends { id: number }> {
  all(): T[];
  get(id: number): T | undefined;
  insert(row: Omit<T, "id">): T;
  update(id: number, patch: Partial<Omit<T, "id">>): T | undefined;
  remove(id: number): boolean;
  removeWhere(pred: (row: T) => boolean): number;
  replaceAll(rows: T[]): void;
}

interface Stored<T> {
  nextId: number;
  rows: T[];
}

export function createCollection<T extends { id: number }>(name: string): Collection<T> {
  const load = (): Stored<T> => {
    const raw = readJson<Stored<T>>(name, { nextId: 1, rows: [] });
    // Validate the loaded data and fall back if malformed (including null)
    if (!raw || !Array.isArray(raw.rows) || typeof raw.nextId !== "number") {
      return { nextId: 1, rows: [] };
    }
    return raw;
  };
  const save = (s: Stored<T>) => writeJson(name, s);

  return {
    all: () => load().rows,
    get: (id) => load().rows.find((r) => r.id === id),
    insert(row) {
      const s = load();
      const created = { ...row, id: s.nextId } as T;
      save({ nextId: s.nextId + 1, rows: [...s.rows, created] });
      return created;
    },
    update(id, patch) {
      const s = load();
      const idx = s.rows.findIndex((r) => r.id === id);
      if (idx === -1) return undefined;
      const updated = { ...s.rows[idx], ...patch, id } as T;
      const rows = [...s.rows];
      rows[idx] = updated;
      save({ ...s, rows });
      return updated;
    },
    remove(id) {
      return this.removeWhere((r) => r.id === id) > 0;
    },
    removeWhere(pred) {
      const s = load();
      const rows = s.rows.filter((r) => !pred(r));
      save({ ...s, rows });
      return s.rows.length - rows.length;
    },
    replaceAll(rows) {
      const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0);
      save({ nextId: maxId + 1, rows });
    },
  };
}
