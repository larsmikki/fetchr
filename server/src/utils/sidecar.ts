import { writeFile, unlink } from 'node:fs/promises';
import { getDb } from '../db/connection.js';
import { allRows } from '../db/repositories/rows.js';
import { collectionsRepo } from '../db/repositories/collections.js';
import { videosRepo } from '../db/repositories/videos.js';

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
