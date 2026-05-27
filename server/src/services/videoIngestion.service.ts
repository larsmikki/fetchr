import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { videosRepo } from '../db/repositories/videos.js';
import { collectionsRepo } from '../db/repositories/collections.js';
import { jobsRepo } from '../db/repositories/jobs.js';
import { config } from '../config.js';
import { deleteSidecar } from '../utils/sidecar.js';
import type { Video } from '../types/index.js';

async function removeVideoArtifacts(videoId: number, localPath: string | null): Promise<void> {
  if (localPath) {
    await unlink(localPath).catch(err => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[cleanup] failed to remove ${localPath}:`, (err as Error).message);
      }
    });
    await deleteSidecar(localPath);
  }
  // yt-dlp may leave .part / fragment files named `${videoId}.*` in the videos dir
  try {
    const entries = await readdir(config.videosDir);
    await Promise.all(
      entries
        .filter(name => name.startsWith(`${videoId}.`))
        .map(name => unlink(path.join(config.videosDir, name)).catch(() => {})),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[cleanup] failed to scan videosDir:', (err as Error).message);
    }
  }
}

export interface IngestionOptions {
  outputMp4?: boolean;
  downloadMp3?: boolean;
}

export function ingestNewVideo(
  input: { url: string; collectionId: number | null; notes: string | null; desktopId: 1 | 2 },
  options: IngestionOptions = {},
): Video {
  const video = videosRepo.create({
    pageUrl: input.url,
    collectionId: input.collectionId,
    notes: input.notes,
    desktopId: input.desktopId,
  });

  jobsRepo.enqueue({
    videoId: video.id,
    kind: 'extract_metadata',
    payload: {
      url: input.url,
      outputMp4: options.outputMp4,
      downloadMp3: options.downloadMp3,
    },
  });

  return video;
}

export function reingestVideo(
  videoId: number,
  newUrl: string,
  options: IngestionOptions = {},
): Video | null {
  jobsRepo.cancelPendingForVideo(videoId);
  const updated = videosRepo.update(videoId, { pageUrl: newUrl, resetMetadata: true });
  if (!updated) return null;

  jobsRepo.enqueue({
    videoId,
    kind: 'extract_metadata',
    payload: {
      url: newUrl,
      outputMp4: options.outputMp4,
      downloadMp3: options.downloadMp3,
    },
  });

  return updated;
}

export function enqueueDownload(videoId: number): boolean {
  const video = videosRepo.findById(videoId);
  if (!video) return false;
  jobsRepo.enqueue({
    videoId,
    kind: 'download_video',
    payload: { url: video.page_url, title: video.title },
  });
  return true;
}

export function enqueueMp3Export(videoId: number): boolean {
  const video = videosRepo.findById(videoId);
  if (!video) return false;
  jobsRepo.enqueue({
    videoId,
    kind: 'download_mp3',
    payload: { url: video.page_url },
  });
  return true;
}

export function enqueueOutputCopy(videoId: number): boolean {
  const video = videosRepo.findById(videoId);
  if (!video || !video.local_path) return false;
  jobsRepo.enqueue({
    videoId,
    kind: 'copy_to_output',
    payload: { localPath: video.local_path, title: video.title },
  });
  return true;
}

export async function cleanupAndRetryVideo(videoId: number): Promise<Video | null> {
  const video = videosRepo.findById(videoId);
  if (!video) return null;

  jobsRepo.cancelPendingForVideo(videoId);
  await removeVideoArtifacts(videoId, video.local_path);

  const updated = videosRepo.update(videoId, {
    localPath: null,
    fetchStatus: 'pending',
    fetchError: null,
  });

  jobsRepo.enqueue({
    videoId,
    kind: 'extract_metadata',
    payload: { url: video.page_url },
  });

  return updated;
}

export function deleteVideoCascade(videoId: number): boolean {
  const video = videosRepo.findById(videoId);
  if (!video) return false;
  jobsRepo.cancelPendingForVideo(videoId);
  const collectionId = video.collection_id;
  videosRepo.delete(videoId);
  collectionsRepo.pruneIfEmpty(collectionId);
  return true;
}
