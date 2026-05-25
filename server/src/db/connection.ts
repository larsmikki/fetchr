import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let db: Database;
let dirty = false;
let saveTimer: NodeJS.Timeout | null = null;
let flushIntervalHandle: NodeJS.Timeout | null = null;

const dbPath = path.join(config.dataDir, 'reely.db');
const SAVE_DEBOUNCE_MS = 1000;
const FLUSH_INTERVAL_MS = 5000;

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export async function resetDb(): Promise<void> {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dirty = false;
}

// Write the current DB to disk synchronously. Use sparingly — prefer markDirty().
export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, buffer);
  dirty = false;
}

// Mark the DB as needing a save. A flush is scheduled on a short debounce so a
// burst of mutations (e.g. one job's claim/update/complete chain) produces a
// single db.export() instead of one per call — db.export() allocates inside
// the sql.js wasm heap and frequent calls exhaust it ("memory access out of
// bounds").
export function markDirty(): void {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) {
      try {
        saveDb();
      } catch (err) {
        console.error('[db] debounced save failed:', (err as Error).message);
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

export function startDbFlusher(): void {
  if (flushIntervalHandle) return;
  flushIntervalHandle = setInterval(() => {
    if (!dirty) return;
    try {
      saveDb();
    } catch (err) {
      console.error('[db] periodic flush failed:', (err as Error).message);
    }
  }, FLUSH_INTERVAL_MS);
}

export function stopDbFlusher(): void {
  if (flushIntervalHandle) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dirty) {
    try {
      saveDb();
    } catch (err) {
      console.error('[db] shutdown flush failed:', (err as Error).message);
    }
  }
}

// Recreate the Database handle from the last on-disk snapshot. Used to recover
// after a wasm "memory access out of bounds" error — once that happens the
// existing handle is poisoned and every subsequent exec() throws the same
// error, so we must rebuild it.
export async function reloadDb(): Promise<void> {
  const SQL = await initSqlJs();
  const buffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  try {
    db.close();
  } catch {
    // handle already corrupted — ignore
  }
  // Build into a local first and only swap on success. Closing above frees the
  // old handle's wasm memory, so a re-create that previously OOM'd should now
  // succeed; if it still throws, `db` keeps pointing at the closed handle and
  // queries throw "Database closed", which the worker treats as recoverable and
  // retries on its next tick.
  const fresh = buffer ? new SQL.Database(buffer) : new SQL.Database();
  fresh.run('PRAGMA foreign_keys = ON');
  db = fresh;
  dirty = false;
}

// sql.js throws bare strings (e.g. `throw "Database closed"`) as well as real
// Error objects, so never assume `err.message` exists.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isWasmOomError(err: unknown): boolean {
  const msg = errorMessage(err);
  return msg.includes('memory access out of bounds') || msg.includes('out of memory');
}

// The handle was closed (e.g. a failed reloadDb left it poisoned). Recoverable:
// reloading from disk rebuilds a usable handle.
export function isDbClosedError(err: unknown): boolean {
  return errorMessage(err) === 'Database closed';
}

// Errors the job worker can recover from by reloading the DB handle from disk.
export function isRecoverableDbError(err: unknown): boolean {
  return isWasmOomError(err) || isDbClosedError(err);
}
