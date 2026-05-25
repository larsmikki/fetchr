import { Router, Request, Response } from 'express';
import { pipeline } from 'node:stream';
import { access, unlink } from 'node:fs/promises';
import fetch from 'node-fetch';
import { videosRepo } from '../db/repositories/videos.js';
import { collectionsRepo } from '../db/repositories/collections.js';
import { jobsRepo } from '../db/repositories/jobs.js';
import { getStreamUrl, extractVideoInfo } from '../services/extractor.service.js';
import {
  ingestNewVideo,
  reingestVideo,
  enqueueDownload,
  enqueueMp3Export,
  enqueueOutputCopy,
  deleteVideoCascade,
  cleanupAndRetryVideo,
} from '../services/videoIngestion.service.js';
import { guardOutboundUrl } from '../util/url-guard.js';
import { writeSidecarForVideo, deleteSidecar } from '../util/sidecar.js';

const router = Router();

// Cache stream URLs to avoid re-running yt-dlp on every browser range request
const streamUrlCache = new Map<number, { url: string; expiresAt: number }>();
const STREAM_URL_TTL_MS = 4 * 60 * 60 * 1000;

async function getCachedStreamUrl(id: number, pageUrl: string): Promise<string> {
  const cached = streamUrlCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const url = await getStreamUrl(pageUrl);
  streamUrlCache.set(id, { url, expiresAt: Date.now() + STREAM_URL_TTL_MS });
  return url;
}

function pickDesktop(value: unknown): 1 | 2 {
  return value === 2 || value === '2' ? 2 : 1;
}

// GET /api/videos
router.get('/', (req: Request, res: Response) => {
  const collectionId = req.query.collection_id as string | undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
  const q = (req.query.q as string | undefined)?.trim() || undefined;
  const desktopId = pickDesktop(req.query.desktop);

  let collection: number | 'null' | undefined;
  if (collectionId === 'null' || collectionId === '') collection = 'null';
  else if (collectionId !== undefined) collection = Number(collectionId);

  const { items, total } = videosRepo.list({ desktopId, collectionId: collection, q, page, limit });
  res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
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

  const desktopId = pickDesktop(desktop_id);
  const trimmed = url.trim();

  if (videosRepo.existsByUrl(trimmed, desktopId)) {
    res.status(409).json({ error: 'This URL has already been added to this desktop.' });
    return;
  }

  const video = ingestNewVideo(
    { url: trimmed, collectionId: collection_id ?? null, notes: notes ?? null, desktopId },
    { outputMp4: output_mp4, downloadMp3: download_mp3 },
  );

  res.status(201).json(video);
});

// GET /api/videos/:id
router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const video = videosRepo.findById(id);
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  res.json(video);
});

// GET /api/videos/:id/stream — serve local file if downloaded, otherwise proxy via yt-dlp
router.get('/:id/stream', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const video = videosRepo.findById(id);
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  if (video.local_path) {
    try {
      await access(video.local_path);
      res.sendFile(video.local_path, err => {
        if (err && !res.headersSent) res.status(500).json({ error: 'Failed to serve local file' });
      });
      return;
    } catch {
      // fall through to proxy
    }
  }

  let streamUrl: string;
  try {
    streamUrl = await getCachedStreamUrl(id, video.page_url);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }

  const guard = await guardOutboundUrl(streamUrl);
  if (!guard.ok) {
    res.status(502).json({ error: `Stream URL rejected: ${guard.reason}` });
    return;
  }

  const proxyHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': (() => { try { return new URL(video.page_url).origin + '/'; } catch { return video.page_url; } })(),
  };
  if (req.headers.range) proxyHeaders['Range'] = req.headers.range as string;

  try {
    const upstream = await fetch(streamUrl, { headers: proxyHeaders });

    if (upstream.status === 403 || upstream.status === 410) {
      streamUrlCache.delete(id);
      const freshUrl = await getCachedStreamUrl(id, video.page_url);
      const freshGuard = await guardOutboundUrl(freshUrl);
      if (!freshGuard.ok) {
        res.status(502).json({ error: `Refreshed stream URL rejected: ${freshGuard.reason}` });
        return;
      }
      const retried = await fetch(freshUrl, { headers: proxyHeaders });
      pipeUpstream(retried, res);
      return;
    }

    pipeUpstream(upstream, res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: (err as Error).message });
  }
});

function pipeUpstream(upstream: import('node-fetch').Response, res: Response): void {
  res.status(upstream.status);
  for (const h of ['content-type', 'content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('Accept-Ranges', 'bytes');
  if (!upstream.body) { res.end(); return; }
  pipeline(upstream.body as unknown as NodeJS.ReadableStream, res, err => {
    if (err && !res.destroyed) res.destroy(err);
  });
}

// POST /api/videos/:id/refresh — synchronously re-extract metadata
router.post('/:id/refresh', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const video = videosRepo.findById(id);
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  videosRepo.update(id, { fetchStatus: 'pending', fetchError: null });
  try {
    const info = await extractVideoInfo(video.page_url);
    const updated = videosRepo.update(id, {
      title: info.title,
      description: info.description,
      duration: info.duration,
      thumbnailUrl: info.thumbnail_url,
      site: info.site,
      fetchStatus: 'ok',
      fetchError: null,
    });
    if (updated?.local_path) await writeSidecarForVideo(id);
    res.json(updated);
  } catch (err) {
    const message = (err as Error).message;
    const updated = videosRepo.update(id, { fetchStatus: 'error', fetchError: message });
    res.json(updated);
  }
});

// POST /api/videos/:id/redownload
router.post('/:id/redownload', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!enqueueDownload(id)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  res.status(202).json({ ok: true });
});

// POST /api/videos/:id/cleanup-retry — cancel in-flight jobs, delete partial files, re-run pipeline
router.post('/:id/cleanup-retry', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = await cleanupAndRetryVideo(id);
  if (!updated) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  res.status(202).json({ ok: true });
});

// GET /api/videos/:id/thumbnail
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const video = videosRepo.findById(id);
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  if (!video.thumbnail_url) {
    res.status(404).json({ error: 'No thumbnail available' });
    return;
  }

  const guard = await guardOutboundUrl(video.thumbnail_url);
  if (!guard.ok) {
    res.status(502).json({ error: `Thumbnail URL rejected: ${guard.reason}` });
    return;
  }

  try {
    const response = await fetch(video.thumbnail_url);
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
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as {
    collection_id?: number | null;
    notes?: string | null;
    title?: string | null;
    download_mp3?: boolean;
    output_mp4?: boolean;
    page_url?: string;
    redownload?: boolean;
  };

  const existing = videosRepo.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const urlChanged = !!(body.page_url && body.page_url.trim() !== existing.page_url);

  if (body.redownload && urlChanged) {
    streamUrlCache.delete(id);
    const newUrl = body.page_url!.trim();
    const updated = reingestVideo(id, newUrl, {
      outputMp4: body.output_mp4,
      downloadMp3: body.download_mp3,
    });
    if (body.collection_id !== undefined && body.collection_id !== existing.collection_id) {
      videosRepo.update(id, { collectionId: body.collection_id });
      collectionsRepo.pruneIfEmpty(existing.collection_id);
    }
    res.json(videosRepo.findById(id) ?? updated);
    return;
  }

  const updated = videosRepo.update(id, {
    collectionId: body.collection_id,
    notes: body.notes,
    title: body.title,
    pageUrl: urlChanged ? body.page_url!.trim() : undefined,
  });

  if (body.collection_id !== undefined && body.collection_id !== existing.collection_id) {
    collectionsRepo.pruneIfEmpty(existing.collection_id);
  }

  if (urlChanged) streamUrlCache.delete(id);

  if (body.output_mp4 && existing.local_path) enqueueOutputCopy(id);
  if (body.download_mp3) enqueueMp3Export(id);

  const titleChanged = body.title !== undefined && body.title !== existing.title;
  const collectionChanged =
    body.collection_id !== undefined && body.collection_id !== existing.collection_id;
  if (updated?.local_path && (titleChanged || collectionChanged)) {
    await writeSidecarForVideo(id);
  }

  res.json(updated);
});

// DELETE /api/videos/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const video = videosRepo.findById(id);
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  const localPath = video.local_path;
  deleteVideoCascade(id);
  if (localPath) {
    unlink(localPath).catch(e => {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[delete] failed to remove file ${localPath}:`, (e as Error).message);
      }
    });
    deleteSidecar(localPath);
  }
  res.json({ status: 'ok' });
});

// GET /api/videos/:id/jobs — recent jobs for this video
router.get('/:id/jobs', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!videosRepo.findById(id)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  res.json({ items: jobsRepo.listForVideo(id) });
});

export default router;
