import { Router, Request, Response } from 'express';
import { settingsRepo } from '../db/repositories/settings.js';
import { getDb } from '../db/connection.js';
import { allRows } from '../db/repositories/rows.js';
import { writeSidecarForVideo } from '../utils/sidecar.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(settingsRepo.getAll());
});

router.patch('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body must be a key-value object' });
    return;
  }
  settingsRepo.setMany(body);
  res.json({ status: 'ok' });
});

router.post('/regenerate-sidecars', async (_req: Request, res: Response) => {
  const rows = allRows<{ id: number }>(
    getDb().exec('SELECT id FROM videos WHERE local_path IS NOT NULL'),
  );
  let written = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await writeSidecarForVideo(row.id);
      written++;
    } catch {
      failed++;
    }
  }
  res.json({ written, failed, total: rows.length });
});

export default router;
