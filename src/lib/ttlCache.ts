/**
 * Plain localStorage JSON caches with a write-time stamp. Unlike localStore,
 * keys are used verbatim (no DB_PREFIX) and entries are disposable: corrupt,
 * unstamped or expired entries read as null, and write failures are ignored.
 */

/**
 * Reads `key` as a JSON object stamped by writeCached. Returns null when the
 * entry is missing, unparseable, or older than `ttlMs`.
 */
export function readCached<T extends object>(
  key: string,
  ttlMs: number,
  stampField = "timestamp",
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const stamp = entry?.[stampField];
    if (typeof stamp !== "number" || Date.now() - stamp > ttlMs) return null;
    return entry as T;
  } catch {
    return null;
  }
}

/** Writes `entry` to `key` with the current time under `stampField`. */
export function writeCached(key: string, entry: object, stampField = "timestamp"): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...entry, [stampField]: Date.now() }));
  } catch {
    // ignore quota errors
  }
}
