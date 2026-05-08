import { Router, Request, Response } from 'express';
import { pipeline } from 'node:stream';
import { access, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import fetch from 'node-fetch';
import type { BindParams } from 'sql.js';
import { getDb, saveDb } from '../db/connection.js';
import { extractVideoInfo, getStreamUrl, downloadToPath, downloadMp3ToPath } from '../services/extractor.service.js';
import type { Video } from '../types/index.js';

const router = Router();

// Cache stream URLs to avoid re-running yt-dlp on every browser range request
const streamUrlCache = new Map<number, { url: string; expiresAt: number }>();
const STREAM_URL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function getCachedStreamUrl(id: number, pageUrl: string): Promise<string> {
  const cached = streamUrlCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const url = await getStreamUrl(pageUrl);
  streamUrlCache.set(id, { url, expiresAt: Date.now() + STREAM_URL_TTL_MS });
  return url;
}

function pruneCollectionIfEmpty(collectionId: number | null): void {
  if (collectionId == null) return;
  const db = getDb();
  const result = db.exec('SELECT COUNT(*) FROM videos WHERE collection_id = $cid', { $cid: collectionId });
  const count = result.length ? (result[0].values[0][0] as number) : 0;
  if (count === 0) db.run('DELETE FROM collections WHERE id = $id', { $id: collectionId });
}

function rowToVideos(columns: string[], values: unknown[][]): Video[] {
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as unknown as Video;
  });
}

// GET /api/videos
router.get('/', (req: Request, res: Response) => {
  const collectionId = req.query.collection_id as string | undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
  const q = (req.query.q as string | undefined)?.trim();
  const desktopId = req.query.desktop === '2' ? 2 : 1;
  const offset = (page - 1) * limit;

  const db = getDb();

  const conditions: string[] = ['desktop_id = $desktop_id'];
  const params: BindParams = { $desktop_id: desktopId };

  if (collectionId !== undefined) {
    if (collectionId === 'null' || collectionId === '') {
      conditions.push('collection_id IS NULL');
    } else {
      conditions.push('collection_id = $collection_id');
      params.$collection_id = Number(collectionId);
    }
  }

  if (q) {
    conditions.push('(title LIKE $q OR notes LIKE $q OR page_url LIKE $q)');
    params.$q = `%${q}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = db.exec(`SELECT COUNT(*) FROM videos ${where}`, params);
  const total = countResult.length ? (countResult[0].values[0][0] as number) : 0;

  const dataResult = db.exec(
    `SELECT * FROM videos ${where} ORDER BY added_at DESC LIMIT $limit OFFSET $offset`,
    { ...params, $limit: limit, $offset: offset },
  );

  const items = dataResult.length
    ? rowToVideos(dataResult[0].columns, dataResult[0].values)
    : [];

  res.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/videos
router.post('/', (req: Request, res: Response) => {
  const { url, collection_id, notes, download_mp3, output_mp4, desktop_id } = req.body as {
    url: string;
    collection_id?: number | null;
    notes?: string;
    download_mp3?: boolean;
    output_mp4?: boolean;
    desktop_id?: number;
  };

  if (!url || typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const desktopId = desktop_id === 2 ? 2 : 1;
  const db = getDb();

  const dup = db.exec(
    'SELECT id FROM videos WHERE page_url = $page_url AND desktop_id = $desktop_id',
    { $page_url: url.trim(), $desktop_id: desktopId },
  );
  if (dup.length && dup[0].values.length) {
    res.status(409).json({ error: 'This URL has already been added to this desktop.' });
    return;
  }

  db.run(
    `INSERT INTO videos (page_url, collection_id, notes, fetch_status, desktop_id)
     VALUES ($page_url, $collection_id, $notes, 'pending', $desktop_id)`,
    {
      $page_url: url.trim(),
      $collection_id: collection_id ?? null,
      $notes: notes ?? null,
      $desktop_id: desktopId,
    },
  );

  const idResult = db.exec('SELECT last_insert_rowid()');
  const id = idResult[0].values[0][0] as number;
  saveDb();

  const videoResult = db.exec('SELECT * FROM videos WHERE id = $id', { $id: id });
  const video = rowToVideos(videoResult[0].columns, videoResult[0].values)[0];

  // Trigger extraction in background
  console.log(`[video:${id}] fetching metadata for ${url.trim()}`);
  extractVideoInfo(url.trim())
    .then(info => {
      console.log(`[video:${id}] metadata ok — title: "${info.title}"`);
      const db2 = getDb();
      db2.run(
        `UPDATE videos SET
          title = $title,
          description = $description,
          duration = $duration,
          thumbnail_url = $thumbnail_url,
          site = $site,
          fetch_status = 'ok',
          fetch_error = NULL,
          updated_at = datetime('now')
         WHERE id = $id`,
        {
          $id: id,
          $title: info.title,
          $description: info.description,
          $duration: info.duration,
          $thumbnail_url: info.thumbnail_url,
          $site: info.site,
        },
      );
      saveDb();

      const settingsResult = db2.exec("SELECT key, value FROM settings WHERE key IN ('download_path', 'ffmpeg_path')");
      const settings: Record<string, string> = {};
      if (settingsResult.length) {
        for (const [k, v] of settingsResult[0].values) settings[k as string] = v as string;
      }
      const outputPath = settings['download_path'] ?? null;
      const ffmpegPath = settings['ffmpeg_path'] || config.ffmpegPath;

      console.log(`[video:${id}] downloading to ${config.videosDir}`);
      downloadToPath(id, url.trim(), config.videosDir, ffmpegPath)
        .then(async localPath => {
          console.log(`[video:${id}] download complete — ${localPath}`);
          const db3 = getDb();
          db3.run(
            `UPDATE videos SET local_path = $local_path, updated_at = datetime('now') WHERE id = $id`,
            { $id: id, $local_path: localPath },
          );
          saveDb();
          if (output_mp4 && outputPath) {
            const dest = path.join(outputPath, path.basename(localPath));
            console.log(`[video:${id}] copying mp4 to output folder — ${dest}`);
            await copyFile(localPath, dest).catch(
              (e: unknown) => { console.error(`[video:${id}] copy to output failed:`, (e as Error).message); },
            );
          }
        })
        .catch((e: unknown) => { console.error(`[video:${id}] download error:`, (e as Error).message); });

      if (download_mp3 && outputPath) {
        console.log(`[video:${id}] queuing mp3 export to ${outputPath}`);
        downloadMp3ToPath(url.trim(), outputPath, ffmpegPath).catch((e: unknown) => { console.error(`[video:${id}] mp3 error:`, (e as Error).message); });
      }
    })
    .catch(err => {
      console.error(`[video:${id}] metadata failed:`, (err as Error).message);
      const db2 = getDb();
      db2.run(
        `UPDATE videos SET fetch_status = 'error', fetch_error = $error, updated_at = datetime('now') WHERE id = $id`,
        { $id: id, $error: (err as Error).message },
      );
      saveDb();
    });

  res.status(201).json(video);
});

// GET /api/videos/:id
router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const result = db.exec('SELECT * FROM videos WHERE id = $id', { $id: id });
  if (!result.length || !result[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const video = rowToVideos(result[0].columns, result[0].values)[0];
  res.json(video);
});

// GET /api/videos/:id/stream — serve local file if downloaded, otherwise proxy via yt-dlp
router.get('/:id/stream', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const result = db.exec('SELECT page_url, local_path FROM videos WHERE id = $id', { $id: id });
  if (!result.length || !result[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const pageUrl = result[0].values[0][0] as string;
  const localPath = result[0].values[0][1] as string | null;

  // Serve the local file if it exists — sendFile handles Range requests natively
  if (localPath) {
    try {
      await access(localPath);
      res.sendFile(localPath, err => {
        if (err && !res.headersSent) res.status(500).json({ error: 'Failed to serve local file' });
      });
      return;
    } catch {
      // File was deleted or moved — fall through to yt-dlp proxy
    }
  }

  let streamUrl: string;
  try {
    streamUrl = await getCachedStreamUrl(id, pageUrl);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }

  const proxyHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': (() => { try { return new URL(pageUrl).origin + '/'; } catch { return pageUrl; } })(),
  };
  if (req.headers.range) proxyHeaders['Range'] = req.headers.range as string;

  try {
    const upstream = await fetch(streamUrl, { headers: proxyHeaders });

    // If the cached URL expired on the CDN side, invalidate cache and retry once
    if (upstream.status === 403 || upstream.status === 410) {
      streamUrlCache.delete(id);
      const freshUrl = await getCachedStreamUrl(id, pageUrl);
      const retried = await fetch(freshUrl, { headers: proxyHeaders });
      res.status(retried.status);
      for (const h of ['content-type', 'content-length', 'content-range']) {
        const v = retried.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      if (!retried.body) { res.end(); return; }
      pipeline(retried.body as unknown as NodeJS.ReadableStream, res, (err) => {
        if (err && !res.destroyed) res.destroy(err);
      });
      return;
    }

    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    if (!upstream.body) { res.end(); return; }
    pipeline(upstream.body as unknown as NodeJS.ReadableStream, res, (err) => {
      if (err && !res.destroyed) res.destroy(err);
    });
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: (err as Error).message });
  }
});

// POST /api/videos/:id/refresh
router.post('/:id/refresh', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const existing = db.exec('SELECT page_url FROM videos WHERE id = $id', { $id: id });
  if (!existing.length || !existing[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const pageUrl = existing[0].values[0][0] as string;

  // Set status to pending while refreshing
  db.run(
    `UPDATE videos SET fetch_status = 'pending', fetch_error = NULL, updated_at = datetime('now') WHERE id = $id`,
    { $id: id },
  );
  saveDb();

  try {
    const info = await extractVideoInfo(pageUrl);
    db.run(
      `UPDATE videos SET
        title = $title,
        description = $description,
        duration = $duration,
        thumbnail_url = $thumbnail_url,
        site = $site,
        fetch_status = 'ok',
        fetch_error = NULL,
        updated_at = datetime('now')
       WHERE id = $id`,
      {
        $id: id,
        $title: info.title,
        $description: info.description,
        $duration: info.duration,
        $thumbnail_url: info.thumbnail_url,
        $site: info.site,
      },
    );
    saveDb();
  } catch (err) {
    db.run(
      `UPDATE videos SET fetch_status = 'error', fetch_error = $error, updated_at = datetime('now') WHERE id = $id`,
      { $id: id, $error: (err as Error).message },
    );
    saveDb();
  }

  const videoResult = db.exec('SELECT * FROM videos WHERE id = $id', { $id: id });
  const video = rowToVideos(videoResult[0].columns, videoResult[0].values)[0];
  res.json(video);
});

// POST /api/videos/:id/redownload — re-trigger local download for a live-stream video
router.post('/:id/redownload', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const result = db.exec('SELECT id, page_url FROM videos WHERE id = $id', { $id: id });
  if (!result.length || !result[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const [, pageUrl] = result[0].values[0] as [number, string];
  const settingsResult = db.exec("SELECT key, value FROM settings WHERE key = 'ffmpeg_path'");
  const settings: Record<string, string> = {};
  if (settingsResult.length) {
    for (const [k, v] of settingsResult[0].values) settings[k as string] = v as string;
  }
  const ffmpegPath = settings['ffmpeg_path'] || config.ffmpegPath;

  res.status(202).json({ ok: true });

  downloadToPath(id, pageUrl, config.videosDir, ffmpegPath)
    .then(localPath => {
      const db2 = getDb();
      db2.run(
        `UPDATE videos SET local_path = $local_path, updated_at = datetime('now') WHERE id = $id`,
        { $id: id, $local_path: localPath },
      );
      saveDb();
    })
    .catch((e: unknown) => { console.error('[redownload] error:', (e as Error).message); });
});

// GET /api/videos/:id/thumbnail
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const result = db.exec('SELECT thumbnail_url FROM videos WHERE id = $id', { $id: id });
  if (!result.length || !result[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const thumbnailUrl = result[0].values[0][0] as string | null;
  if (!thumbnailUrl) {
    res.status(404).json({ error: 'No thumbnail available' });
    return;
  }

  try {
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      res.status(502).json({ error: 'Failed to fetch thumbnail' });
      return;
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    response.body?.pipe(res);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// PUT /api/videos/:id
router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { collection_id, notes, title, download_mp3, output_mp4, page_url, redownload } = req.body as {
    collection_id?: number | null;
    notes?: string | null;
    title?: string | null;
    download_mp3?: boolean;
    output_mp4?: boolean;
    page_url?: string;
    redownload?: boolean;
  };

  const db = getDb();

  const existingResult = db.exec('SELECT id, page_url, local_path, collection_id FROM videos WHERE id = $id', { $id: id });
  if (!existingResult.length || !existingResult[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const existing = rowToVideos(existingResult[0].columns, existingResult[0].values)[0];

  const updates: string[] = ["updated_at = datetime('now')"];
  const params: BindParams = { $id: id };

  if (collection_id !== undefined) { updates.push('collection_id = $collection_id'); params.$collection_id = collection_id; }
  if (notes !== undefined) { updates.push('notes = $notes'); params.$notes = notes; }

  const urlChanged = !!(page_url && page_url.trim() !== existing.page_url);
  if (urlChanged) {
    updates.push('page_url = $page_url');
    params.$page_url = page_url!.trim();
    streamUrlCache.delete(id);
  }

  if (redownload && urlChanged) {
    updates.push("fetch_status = 'pending'", 'fetch_error = NULL', 'title = NULL', 'description = NULL', 'duration = NULL', 'thumbnail_url = NULL', 'site = NULL', 'local_path = NULL');
  } else {
    if (title !== undefined) { updates.push('title = $title'); params.$title = title; }
  }

  db.run(`UPDATE videos SET ${updates.join(', ')} WHERE id = $id`, params);
  if (collection_id !== undefined && collection_id !== existing.collection_id) {
    pruneCollectionIfEmpty(existing.collection_id);
  }
  saveDb();

  const settingsResult = db.exec("SELECT key, value FROM settings WHERE key IN ('download_path', 'ffmpeg_path')");
  const settings: Record<string, string> = {};
  if (settingsResult.length) {
    for (const [k, v] of settingsResult[0].values) settings[k as string] = v as string;
  }
  const outputPath = settings['download_path'] ?? null;
  const ffmpegPath = settings['ffmpeg_path'] || config.ffmpegPath;

  if (redownload && urlChanged) {
    const newUrl = page_url!.trim();
    extractVideoInfo(newUrl)
      .then(info => {
        const db2 = getDb();
        db2.run(
          `UPDATE videos SET
            title = $title,
            description = $description,
            duration = $duration,
            thumbnail_url = $thumbnail_url,
            site = $site,
            fetch_status = 'ok',
            fetch_error = NULL,
            updated_at = datetime('now')
           WHERE id = $id`,
          { $id: id, $title: info.title, $description: info.description, $duration: info.duration, $thumbnail_url: info.thumbnail_url, $site: info.site },
        );
        saveDb();

        downloadToPath(id, newUrl, config.videosDir, ffmpegPath)
          .then(async localPath => {
            const db3 = getDb();
            db3.run(
              `UPDATE videos SET local_path = $local_path, updated_at = datetime('now') WHERE id = $id`,
              { $id: id, $local_path: localPath },
            );
            saveDb();
            if (output_mp4 && outputPath) {
              await copyFile(localPath, path.join(outputPath, path.basename(localPath))).catch(
                (e: unknown) => { console.error('[dl] copy to output failed:', (e as Error).message); },
              );
            }
          })
          .catch((e: unknown) => { console.error('[dl] error:', (e as Error).message); });

        if (download_mp3 && outputPath) {
          downloadMp3ToPath(newUrl, outputPath, ffmpegPath).catch((e: unknown) => { console.error('[mp3] download error:', (e as Error).message); });
        }
      })
      .catch(err => {
        const db2 = getDb();
        db2.run(
          `UPDATE videos SET fetch_status = 'error', fetch_error = $error, updated_at = datetime('now') WHERE id = $id`,
          { $id: id, $error: (err as Error).message },
        );
        saveDb();
      });
  } else if (download_mp3 === true || output_mp4 === true) {
    if (download_mp3 && outputPath) {
      downloadMp3ToPath(existing.page_url, outputPath, ffmpegPath).catch((e: unknown) => { console.error('[mp3] download error:', (e as Error).message); });
    }
    if (output_mp4 && outputPath && existing.local_path) {
      copyFile(existing.local_path, path.join(outputPath, path.basename(existing.local_path))).catch((e: unknown) => { console.error('[dl] copy to output failed:', (e as Error).message); });
    }
  }

  const videoResult = db.exec('SELECT * FROM videos WHERE id = $id', { $id: id });
  const video = rowToVideos(videoResult[0].columns, videoResult[0].values)[0];
  res.json(video);
});

// DELETE /api/videos/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const existing = db.exec('SELECT id, collection_id, local_path FROM videos WHERE id = $id', { $id: id });
  if (!existing.length || !existing[0].values.length) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const collectionId = existing[0].values[0][1] as number | null;
  const localPath = existing[0].values[0][2] as string | null;

  db.run('DELETE FROM videos WHERE id = $id', { $id: id });
  pruneCollectionIfEmpty(collectionId);
  saveDb();

  if (localPath) {
    unlink(localPath).catch(e => {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[delete] failed to remove file ${localPath}:`, (e as Error).message);
      }
    });
  }

  res.json({ status: 'ok' });
});

export default router;
