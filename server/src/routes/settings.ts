import { Router, Request, Response } from 'express';
import { getDb, saveDb } from '../db/connection.js';

const router = Router();

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const result = db.exec('SELECT key, value FROM settings');

  const settings: Record<string, string> = {};
  if (result.length) {
    for (const [key, value] of result[0].values) {
      settings[key as string] = value as string;
    }
  }

  res.json(settings);
});

// PATCH /api/settings
router.patch('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body must be a key-value object' });
    return;
  }

  const db = getDb();

  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    db.run(
      'INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = $value',
      { $key: key, $value: value },
    );
  }

  saveDb();
  res.json({ status: 'ok' });
});

export default router;
