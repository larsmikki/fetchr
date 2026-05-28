import { Router, Request, Response } from 'express';
import { writeFile, stat, unlink } from 'node:fs/promises';
import { settingsRepo } from '../db/repositories/settings.js';
import { getDb } from '../db/connection.js';
import { allRows } from '../db/repositories/rows.js';
import { writeSidecarForVideo, importSidecars } from '../utils/sidecar.js';
import { jobsRepo } from '../db/repositories/jobs.js';
import { config } from '../config.js';

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

// GET /api/settings/cookies — whether an uploaded cookies.txt is present
router.get('/cookies', async (_req: Request, res: Response) => {
  try {
    const info = await stat(config.cookiesFile);
    res.json({ present: true, size: info.size, updatedAt: info.mtime.toISOString() });
  } catch {
    res.json({ present: false, size: 0, updatedAt: null });
  }
});

// POST /api/settings/cookies — store an uploaded cookies.txt and switch to file mode
router.post('/cookies', async (req: Request, res: Response) => {
  const { content } = (req.body ?? {}) as { content?: string };
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content (cookies.txt text) is required' });
    return;
  }
  // Netscape cookie jars start with this header line; warn but don't hard-fail,
  // since some exporters omit it.
  const looksValid = /# (Netscape )?HTTP Cookie File/i.test(content) || /\t/.test(content);
  await writeFile(config.cookiesFile, content, 'utf8');
  settingsRepo.set('youtube_cookies_mode', 'file');
  res.json({ status: 'ok', looksValid });
});

// DELETE /api/settings/cookies — remove the uploaded file
router.delete('/cookies', async (_req: Request, res: Response) => {
  await unlink(config.cookiesFile).catch(err => {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  });
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

router.post('/import-sidecars', async (_req: Request, res: Response) => {
  try {
    const result = await importSidecars();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Enqueue a fetch_thumbnail job for every video that has a page URL but no
// thumbnail. Pass ?all=1 to re-fetch for every video regardless.
router.post('/refresh-thumbnails', async (req: Request, res: Response) => {
  const all = req.query.all === '1' || req.query.all === 'true';
  const sql = all
    ? 'SELECT id, page_url FROM videos WHERE page_url IS NOT NULL AND page_url != ""'
    : 'SELECT id, page_url FROM videos WHERE page_url IS NOT NULL AND page_url != "" AND (thumbnail_url IS NULL OR thumbnail_url = "")';
  const rows = allRows<{ id: number; page_url: string }>(getDb().exec(sql));
  for (const row of rows) {
    jobsRepo.enqueue({
      videoId: row.id,
      kind: 'fetch_thumbnail',
      payload: { url: row.page_url },
    });
  }
  res.json({ enqueued: rows.length });
});

export default router;
