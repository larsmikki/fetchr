import { getDb, markDirty } from '../connection.js';
import { firstRow, allRows, scalar } from './rows.js';

export type JobKind = 'extract_metadata' | 'download_video' | 'download_mp3' | 'copy_to_output';
export type JobStatus = 'pending' | 'running' | 'ok' | 'error' | 'cancelled';

export interface Job {
  id: number;
  video_id: number | null;
  kind: JobKind;
  payload: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface JobEnqueue {
  videoId: number | null;
  kind: JobKind;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export const jobsRepo = {
  enqueue(input: JobEnqueue): Job {
    const db = getDb();
    db.run(
      `INSERT INTO jobs (video_id, kind, payload, status, max_attempts)
       VALUES ($vid, $kind, $payload, 'pending', $max)`,
      {
        $vid: input.videoId,
        $kind: input.kind,
        $payload: input.payload ? JSON.stringify(input.payload) : null,
        $max: input.maxAttempts ?? 3,
      },
    );
    const id = scalar<number>(db.exec('SELECT last_insert_rowid()'))!;
    markDirty();
    return this.findById(id)!;
  },

  findById(id: number): Job | null {
    return firstRow<Job>(getDb().exec('SELECT * FROM jobs WHERE id = $id', { $id: id }));
  },

  claimNext(): Job | null {
    const db = getDb();
    const row = firstRow<Job>(
      db.exec(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1`),
    );
    if (!row) return null;
    db.run(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now')
       WHERE id = $id`,
      { $id: row.id },
    );
    markDirty();
    return this.findById(row.id);
  },

  setProgress(id: number, progress: number): void {
    getDb().run(
      `UPDATE jobs SET progress = $p, updated_at = datetime('now') WHERE id = $id`,
      { $p: Math.max(0, Math.min(1, progress)), $id: id },
    );
  },

  markComplete(id: number): void {
    getDb().run(
      `UPDATE jobs SET status = 'ok', progress = 1, updated_at = datetime('now') WHERE id = $id`,
      { $id: id },
    );
    markDirty();
  },

  markFailed(id: number, error: string, retry: boolean): void {
    const db = getDb();
    if (retry) {
      db.run(
        `UPDATE jobs SET status = 'pending', error = $e, updated_at = datetime('now') WHERE id = $id`,
        { $id: id, $e: error },
      );
    } else {
      db.run(
        `UPDATE jobs SET status = 'error', error = $e, updated_at = datetime('now') WHERE id = $id`,
        { $id: id, $e: error },
      );
    }
    markDirty();
  },

  cancel(id: number): boolean {
    const db = getDb();
    const job = this.findById(id);
    if (!job || job.status === 'ok' || job.status === 'cancelled') return false;
    db.run(
      `UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = $id`,
      { $id: id },
    );
    markDirty();
    return true;
  },

  resetRunningToPending(): void {
    getDb().run(
      `UPDATE jobs SET status = 'pending', updated_at = datetime('now') WHERE status = 'running'`,
    );
    markDirty();
  },

  listActive(): Job[] {
    return allRows<Job>(
      getDb().exec(
        `SELECT * FROM jobs WHERE status IN ('pending', 'running') ORDER BY id ASC`,
      ),
    );
  },

  listRecentFailed(limit = 20): Job[] {
    // Skip failures that a later run resolved: a newer successful job of the
    // same kind for the same video supersedes the error.
    return allRows<Job>(
      getDb().exec(
        `SELECT * FROM jobs j
         WHERE j.status = 'error'
           AND NOT EXISTS (
             SELECT 1 FROM jobs s
             WHERE s.video_id = j.video_id
               AND s.kind = j.kind
               AND s.status = 'ok'
               AND s.id > j.id
           )
         ORDER BY j.updated_at DESC, j.id DESC
         LIMIT $lim`,
        { $lim: limit },
      ),
    );
  },

  listForVideo(videoId: number): Job[] {
    return allRows<Job>(
      getDb().exec(
        `SELECT * FROM jobs WHERE video_id = $vid ORDER BY id DESC LIMIT 20`,
        { $vid: videoId },
      ),
    );
  },

  cancelPendingForVideo(videoId: number): void {
    getDb().run(
      `UPDATE jobs SET status = 'cancelled', updated_at = datetime('now')
       WHERE video_id = $vid AND status IN ('pending', 'running')`,
      { $vid: videoId },
    );
    markDirty();
  },
};
