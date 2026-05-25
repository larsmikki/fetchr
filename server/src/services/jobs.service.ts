import { EventEmitter } from 'node:events';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { jobsRepo, type Job, type JobKind } from '../db/repositories/jobs.js';
import { videosRepo } from '../db/repositories/videos.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { config } from '../config.js';
import { errorMessage, isRecoverableDbError, reloadDb } from '../db/connection.js';
import { extractVideoInfo, downloadToPath, downloadMp3ToPath } from './extractor.service.js';
import { writeSidecarForVideo } from '../util/sidecar.js';

export interface JobEvent {
  job: Job;
}

const bus = new EventEmitter();
bus.setMaxListeners(50);

export function onJobChange(listener: (event: JobEvent) => void): () => void {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}

function emit(jobId: number): void {
  const job = jobsRepo.findById(jobId);
  if (job) bus.emit('change', { job });
}

interface IngestPayload {
  outputMp4?: boolean;
  downloadMp3?: boolean;
  url: string;
}

function sanitizeForFilename(name: string): string {
  return name
    .replace(/[<>:"|?*\x00-\x1f\\/]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
}

function outputFilename(localPath: string, title: string | null | undefined): string {
  const sanitized = title ? sanitizeForFilename(title) : '';
  return sanitized ? `${sanitized}${path.extname(localPath)}` : path.basename(localPath);
}

async function runExtractMetadata(job: Job): Promise<void> {
  const videoId = job.video_id!;
  const payload = JSON.parse(job.payload ?? '{}') as IngestPayload;

  jobsRepo.setProgress(job.id, 0.1);
  emit(job.id);

  const info = await extractVideoInfo(payload.url);

  videosRepo.update(videoId, {
    title: info.title,
    description: info.description,
    duration: info.duration,
    thumbnailUrl: info.thumbnail_url,
    site: info.site,
    fetchStatus: 'ok',
    fetchError: null,
  });

  jobsRepo.setProgress(job.id, 1);
  jobsRepo.markComplete(job.id);
  emit(job.id);

  // Chain a download job
  jobsRepo.enqueue({
    videoId,
    kind: 'download_video',
    payload: { url: payload.url, outputMp4: payload.outputMp4, downloadMp3: payload.downloadMp3, title: info.title },
  });

  if (payload.downloadMp3) {
    jobsRepo.enqueue({
      videoId,
      kind: 'download_mp3',
      payload: { url: payload.url },
    });
  }
}

async function runDownloadVideo(job: Job): Promise<void> {
  const videoId = job.video_id!;
  const payload = JSON.parse(job.payload ?? '{}') as IngestPayload & { title?: string | null };

  jobsRepo.setProgress(job.id, 0.2);
  emit(job.id);

  const settings = settingsRepo.getMany(['download_path', 'ffmpeg_path']);
  const ffmpegPath = settings['ffmpeg_path'] || config.ffmpegPath;

  const localPath = await downloadToPath(videoId, payload.url, config.videosDir, ffmpegPath);

  videosRepo.update(videoId, { localPath });
  await writeSidecarForVideo(videoId);
  jobsRepo.setProgress(job.id, 1);
  jobsRepo.markComplete(job.id);
  emit(job.id);

  if (payload.outputMp4 && settings['download_path']) {
    jobsRepo.enqueue({
      videoId,
      kind: 'copy_to_output',
      payload: { localPath, title: payload.title, outputDir: settings['download_path'] },
    });
  }
}

async function runDownloadMp3(job: Job): Promise<void> {
  const payload = JSON.parse(job.payload ?? '{}') as IngestPayload;
  const settings = settingsRepo.getMany(['download_path', 'ffmpeg_path']);
  const outputPath = settings['download_path'];
  if (!outputPath) {
    throw new Error('download_path setting is not configured');
  }
  const ffmpegPath = settings['ffmpeg_path'] || config.ffmpegPath;

  jobsRepo.setProgress(job.id, 0.2);
  emit(job.id);

  await downloadMp3ToPath(payload.url, outputPath, ffmpegPath);

  jobsRepo.markComplete(job.id);
  emit(job.id);
}

async function runCopyToOutput(job: Job): Promise<void> {
  const payload = JSON.parse(job.payload ?? '{}') as {
    localPath: string;
    title: string | null;
    outputDir: string;
  };
  const dest = path.join(payload.outputDir, outputFilename(payload.localPath, payload.title));
  await copyFile(payload.localPath, dest);
  jobsRepo.markComplete(job.id);
  emit(job.id);
}

const HANDLERS: Record<JobKind, (job: Job) => Promise<void>> = {
  extract_metadata: runExtractMetadata,
  download_video: runDownloadVideo,
  download_mp3: runDownloadMp3,
  copy_to_output: runCopyToOutput,
};

let running = false;
let stopRequested = false;
let stepPromise: Promise<void> | null = null;

async function step(): Promise<void> {
  const job = jobsRepo.claimNext();
  if (!job) return;
  emit(job.id);

  try {
    const handler = HANDLERS[job.kind];
    if (!handler) throw new Error(`unknown job kind: ${job.kind}`);
    await handler(job);
  } catch (err) {
    // A closed/poisoned DB handle surfaces here too; rethrow so the worker loop
    // can reload it instead of trying (and failing) to write the failure back.
    if (isRecoverableDbError(err)) throw err;
    const message = errorMessage(err);
    const fresh = jobsRepo.findById(job.id);
    const attempts = fresh?.attempts ?? job.attempts;
    const maxAttempts = fresh?.max_attempts ?? job.max_attempts;
    const retry = attempts < maxAttempts;
    jobsRepo.markFailed(job.id, message, retry);
    emit(job.id);

    if (!retry && job.video_id != null && job.kind === 'extract_metadata') {
      videosRepo.update(job.video_id, { fetchStatus: 'error', fetchError: message });
    }
  }
}

async function loop(intervalMs: number): Promise<void> {
  while (!stopRequested) {
    try {
      await step();
    } catch (err) {
      console.error('[jobs] worker step crashed:', errorMessage(err));
      if (isRecoverableDbError(err)) {
        try {
          await reloadDb();
          console.warn('[jobs] recoverable DB error — handle reloaded from disk');
        } catch (recoverErr) {
          console.error('[jobs] DB reload failed:', errorMessage(recoverErr));
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  running = false;
}

export function startJobWorker(intervalMs = 300): void {
  if (running) return;
  jobsRepo.resetRunningToPending();
  running = true;
  stopRequested = false;
  stepPromise = loop(intervalMs);
}

export async function stopJobWorker(): Promise<void> {
  stopRequested = true;
  if (stepPromise) await stepPromise;
}

// Exposed for tests — drains the queue synchronously, one step at a time.
export async function drainJobsForTest(maxSteps = 100): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const pending = jobsRepo.listActive().find(j => j.status === 'pending');
    if (!pending) return;
    await step();
  }
}
