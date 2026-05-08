import { Router, Request, Response } from 'express';
import { access } from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { getDb, saveDb } from '../db/connection.js';

const router = Router();

// GET /api/data/export
router.get('/export', (_req: Request, res: Response) => {
  const db = getDb();

  const colResult = db.exec(
    'SELECT name, description, color, sort_order, desktop_id FROM collections ORDER BY desktop_id, sort_order',
  );
  const collections = colResult.length
    ? colResult[0].values.map(row => ({
        name: row[0],
        description: row[1],
        color: row[2],
        sort_order: row[3],
        desktop_id: row[4],
      }))
    : [];

  const vidResult = db.exec(
    `SELECT v.title, v.page_url, v.notes, v.desktop_id, c.name AS collection_name
     FROM videos v
     LEFT JOIN collections c ON v.collection_id = c.id
     ORDER BY v.desktop_id, v.added_at`,
  );
  const videos = vidResult.length
    ? vidResult[0].values.map(row => ({
        title: row[0],
        page_url: row[1],
        notes: row[2],
        desktop_id: row[3],
        collection_name: row[4],
      }))
    : [];

  const payload = { version: 1, exported_at: new Date().toISOString(), collections, videos };

  res.setHeader('Content-Disposition', 'attachment; filename="reely-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(payload);
});

// POST /api/data/import
router.post('/import', (req: Request, res: Response) => {
  const body = req.body as { version?: number; collections?: unknown[]; videos?: unknown[] };

  if (!body || body.version !== 1 || !Array.isArray(body.collections) || !Array.isArray(body.videos)) {
    res.status(400).json({ error: 'Invalid backup file' });
    return;
  }

  const db = getDb();
  const collectionKey = (name: string, desktopId: number) => `${name}:${desktopId}`;
  const nameToId = new Map<string, number>();

  for (const col of body.collections as Record<string, unknown>[]) {
    if (typeof col.name !== 'string' || !col.name) continue;
    const desktopId = Number(col.desktop_id) || 1;

    const existing = db.exec(
      'SELECT id FROM collections WHERE name = $name AND desktop_id = $d',
      { $name: col.name, $d: desktopId },
    );
    if (existing.length && existing[0].values.length) {
      nameToId.set(collectionKey(col.name, desktopId), existing[0].values[0][0] as number);
    } else {
      db.run(
        'INSERT INTO collections (name, description, color, sort_order, desktop_id) VALUES ($name, $desc, $color, $sort, $d)',
        {
          $name: col.name,
          $desc: (col.description as string | undefined) ?? null,
          $color: (col.color as string | undefined) ?? '#e11d48',
          $sort: Number(col.sort_order) || 0,
          $d: desktopId,
        },
      );
      const idRow = db.exec('SELECT last_insert_rowid()');
      nameToId.set(collectionKey(col.name, desktopId), idRow[0].values[0][0] as number);
    }
  }

  let imported = 0;
  for (const vid of body.videos as Record<string, unknown>[]) {
    if (typeof vid.page_url !== 'string' || !vid.page_url) continue;
    const desktopId = Number(vid.desktop_id) || 1;

    const exists = db.exec(
      'SELECT id FROM videos WHERE page_url = $url AND desktop_id = $d',
      { $url: vid.page_url, $d: desktopId },
    );
    if (exists.length && exists[0].values.length) continue;

    const collectionId =
      typeof vid.collection_name === 'string' && vid.collection_name
        ? (nameToId.get(collectionKey(vid.collection_name, desktopId)) ?? null)
        : null;

    db.run(
      `INSERT INTO videos (page_url, title, notes, collection_id, desktop_id, local_path, fetch_status)
       VALUES ($url, $title, $notes, $cid, $d, NULL, 'pending')`,
      {
        $url: vid.page_url,
        $title: (vid.title as string | undefined) ?? null,
        $notes: (vid.notes as string | undefined) ?? null,
        $cid: collectionId,
        $d: desktopId,
      },
    );
    imported++;
  }

  saveDb();
  res.json({ status: 'ok', imported });
});

// GET /api/data/videos.zip — stream all downloaded videos as a ZIP (store mode, no recompression)
router.get('/videos.zip', async (_req: Request, res: Response) => {
  const db = getDb();
  const result = db.exec(
    "SELECT title, local_path FROM videos WHERE local_path IS NOT NULL ORDER BY added_at",
  );

  const rows = result.length ? result[0].values : [];
  if (!rows.length) {
    res.status(404).json({ error: 'No downloaded videos found' });
    return;
  }

  // Deduplicate filenames: if two files share a basename, prefix with index
  const usedNames = new Map<string, number>();
  const entries: { filePath: string; name: string }[] = [];

  for (const row of rows) {
    const filePath = row[1] as string;
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const title = typeof row[0] === 'string' && row[0] ? row[0] : base;
    const safeName = title.replace(/[<>:"/\\|?*]/g, '_') + ext;

    const count = usedNames.get(safeName) ?? 0;
    usedNames.set(safeName, count + 1);
    entries.push({ filePath, name: count === 0 ? safeName : `${title.replace(/[<>:"/\\|?*]/g, '_')} (${count})${ext}` });
  }

  // Filter to files that actually exist on disk
  const existing: typeof entries = [];
  for (const entry of entries) {
    try {
      await access(entry.filePath);
      existing.push(entry);
    } catch {
      // File missing from disk — skip silently
    }
  }

  if (!existing.length) {
    res.status(404).json({ error: 'No video files found on disk' });
    return;
  }

  res.setHeader('Content-Disposition', 'attachment; filename="reely-videos.zip"');
  res.setHeader('Content-Type', 'application/zip');

  // level: 0 = store only (no recompression — videos are already compressed, this is essentially free)
  const archive = archiver('zip', { zlib: { level: 0 } });

  archive.on('error', err => {
    console.error('Archive error:', err);
    // Headers already sent, can't send error response
  });

  archive.pipe(res);

  for (const { filePath, name } of existing) {
    archive.file(filePath, { name });
  }

  await archive.finalize();
});

export default router;
