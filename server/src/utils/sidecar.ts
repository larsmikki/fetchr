import { writeFile, unlink, readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { getDb, markDirty } from '../db/connection.js';
import { allRows, firstRow } from '../db/repositories/rows.js';
import { collectionsRepo } from '../db/repositories/collections.js';
import { videosRepo } from '../db/repositories/videos.js';
import { jobsRepo } from '../db/repositories/jobs.js';
import { config } from '../config.js';

export interface SidecarData {
  title: string | null;
  site: string | null;
  collection: string | null;
  page_url: string | null;
}

function sidecarPath(localPath: string): string {
  return `${localPath}.json`;
}

export async function writeSidecar(localPath: string, data: SidecarData): Promise<void> {
  try {
    await writeFile(sidecarPath(localPath), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[sidecar] failed to write ${sidecarPath(localPath)}:`, (err as Error).message);
  }
}

export async function deleteSidecar(localPath: string): Promise<void> {
  try {
    await unlink(sidecarPath(localPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[sidecar] failed to remove ${sidecarPath(localPath)}:`, (err as Error).message);
    }
  }
}

export async function writeSidecarForVideo(videoId: number): Promise<void> {
  const video = videosRepo.findById(videoId);
  if (!video || !video.local_path) return;
  const collection = video.collection_id != null
    ? collectionsRepo.findById(video.collection_id)?.name ?? null
    : null;
  await writeSidecar(video.local_path, {
    title: video.title,
    site: video.site,
    collection,
    page_url: video.page_url,
  });
}

export interface ImportSidecarsResult {
  imported: number;
  replaced: number;
  skippedNoMedia: number;
  failed: number;
  total: number;
}

const DEFAULT_COLLECTION_COLOR = '#e11d48';

function parseSidecarFilename(name: string): { videoId: number; mediaFile: string } | null {
  // Sidecar files are named "<id>.<ext>.json", sibling media is "<id>.<ext>"
  if (!name.endsWith('.json')) return null;
  const base = name.slice(0, -'.json'.length);
  const dot = base.indexOf('.');
  if (dot <= 0) return null;
  const idPart = base.slice(0, dot);
  if (!/^\d+$/.test(idPart)) return null;
  const videoId = Number(idPart);
  if (!Number.isFinite(videoId) || videoId <= 0) return null;
  return { videoId, mediaFile: base };
}

export async function importSidecars(): Promise<ImportSidecarsResult> {
  const result: ImportSidecarsResult = {
    imported: 0,
    replaced: 0,
    skippedNoMedia: 0,
    failed: 0,
    total: 0,
  };

  let entries: string[];
  try {
    entries = await readdir(config.videosDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw err;
  }

  const sidecars = entries.filter(name => name.endsWith('.json'));
  result.total = sidecars.length;

  const db = getDb();
  const collectionCache = new Map<string, number>();

  const desktopId = 1;
  const resolveCollection = (name: string | null): number | null => {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cached = collectionCache.get(trimmed);
    if (cached !== undefined) return cached;
    const existing = collectionsRepo.findByNameAndDesktop(trimmed, desktopId);
    if (existing) {
      collectionCache.set(trimmed, existing.id);
      return existing.id;
    }
    const created = collectionsRepo.create({
      name: trimmed,
      description: null,
      color: DEFAULT_COLLECTION_COLOR,
      desktopId,
    });
    collectionCache.set(trimmed, created.id);
    return created.id;
  };

  for (const sidecarName of sidecars) {
    try {
      const parsed = parseSidecarFilename(sidecarName);
      if (!parsed) {
        result.failed++;
        continue;
      }

      const mediaPath = path.join(config.videosDir, parsed.mediaFile);
      try {
        await access(mediaPath);
      } catch {
        result.skippedNoMedia++;
        continue;
      }

      const raw = await readFile(path.join(config.videosDir, sidecarName), 'utf8');
      const data = JSON.parse(raw) as Partial<SidecarData>;
      const pageUrl = typeof data.page_url === 'string' ? data.page_url : '';
      if (!pageUrl) {
        result.failed++;
        continue;
      }

      const collectionId = resolveCollection(
        typeof data.collection === 'string' ? data.collection : null,
      );
      const title = typeof data.title === 'string' ? data.title : null;
      const site = typeof data.site === 'string' ? data.site : null;

      // "Sidecar wins": remove any existing row with this id or this page_url
      // (within the target desktop) before reinserting. We don't touch files —
      // the conflicting row may have pointed at the very file we're importing.
      const conflicts = allRows<{ id: number }>(
        db.exec(
          'SELECT id FROM videos WHERE id = $id OR (page_url = $url AND desktop_id = $d)',
          { $id: parsed.videoId, $url: pageUrl, $d: desktopId },
        ),
      );
      if (conflicts.length > 0) {
        for (const c of conflicts) {
          db.run('DELETE FROM videos WHERE id = $id', { $id: c.id });
        }
        result.replaced++;
      }

      db.run(
        `INSERT INTO videos (id, page_url, title, site, collection_id, desktop_id, local_path, fetch_status)
         VALUES ($id, $url, $title, $site, $cid, $d, $path, 'ok')`,
        {
          $id: parsed.videoId,
          $url: pageUrl,
          $title: title,
          $site: site,
          $cid: collectionId,
          $d: desktopId,
          $path: mediaPath,
        },
      );
      // Sidecars don't carry a thumbnail URL — re-fetch it from the source page
      // asynchronously so the import returns quickly. This does not redownload
      // the video; see runFetchThumbnail in jobs.service.ts.
      jobsRepo.enqueue({
        videoId: parsed.videoId,
        kind: 'fetch_thumbnail',
        payload: { url: pageUrl },
      });
      result.imported++;
    } catch (err) {
      console.error(`[sidecar-import] failed for ${sidecarName}:`, (err as Error).message);
      result.failed++;
    }
  }

  // Belt-and-suspenders: ensure AUTOINCREMENT seq is at least max(id) so new
  // videos can never collide with imported ids. SQLite normally does this on
  // explicit inserts, but make it explicit in case sqlite_sequence was empty.
  const maxId = firstRow<{ m: number | null }>(
    db.exec("SELECT MAX(id) AS m FROM videos"),
  )?.m ?? 0;
  if (maxId > 0) {
    const seqExists = firstRow(
      db.exec("SELECT seq FROM sqlite_sequence WHERE name = 'videos'"),
    );
    if (seqExists) {
      db.run(
        "UPDATE sqlite_sequence SET seq = $s WHERE name = 'videos' AND seq < $s",
        { $s: maxId },
      );
    } else {
      db.run("INSERT INTO sqlite_sequence (name, seq) VALUES ('videos', $s)", {
        $s: maxId,
      });
    }
  }

  if (result.imported > 0 || result.replaced > 0) markDirty();
  return result;
}

export async function rewriteSidecarsForCollection(collectionId: number): Promise<void> {
  const rows = allRows<{ local_path: string; title: string | null; site: string | null; page_url: string }>(
    getDb().exec(
      'SELECT local_path, title, site, page_url FROM videos WHERE collection_id = $cid AND local_path IS NOT NULL',
      { $cid: collectionId },
    ),
  );
  const collection = collectionsRepo.findById(collectionId);
  const collectionName = collection?.name ?? null;
  await Promise.all(
    rows.map(row =>
      writeSidecar(row.local_path, {
        title: row.title,
        site: row.site,
        collection: collectionName,
        page_url: row.page_url,
      }),
    ),
  );
}
