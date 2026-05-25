import { getDb, markDirty } from '../connection.js';
import { allRows } from './rows.js';

interface KV { key: string; value: string }

export const settingsRepo = {
  getAll(): Record<string, string> {
    const rows = allRows<KV>(getDb().exec('SELECT key, value FROM settings'));
    const out: Record<string, string> = {};
    for (const { key, value } of rows) out[key] = value;
    return out;
  },

  getMany(keys: string[]): Record<string, string> {
    if (keys.length === 0) return {};
    const placeholders = keys.map((_, i) => `$k${i}`).join(', ');
    const params: Record<string, string> = {};
    keys.forEach((k, i) => { params[`$k${i}`] = k; });
    const rows = allRows<KV>(
      getDb().exec(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, params),
    );
    const out: Record<string, string> = {};
    for (const { key, value } of rows) out[key] = value;
    return out;
  },

  set(key: string, value: string): void {
    getDb().run(
      'INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v',
      { $k: key, $v: value },
    );
    markDirty();
  },

  setMany(values: Record<string, string>): void {
    const db = getDb();
    for (const [k, v] of Object.entries(values)) {
      if (typeof k !== 'string' || typeof v !== 'string') continue;
      db.run(
        'INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v',
        { $k: k, $v: v },
      );
    }
    markDirty();
  },
};
