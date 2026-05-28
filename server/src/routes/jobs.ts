import { Router, Request, Response } from 'express';
import { jobsRepo } from '../db/repositories/jobs.js';
import { onJobChange } from '../services/jobs.service.js';

const router = Router();

// GET /api/jobs — active jobs by default; ?video_id= for a video's history;
// ?status=error for the most recent permanently-failed jobs.
router.get('/', (req: Request, res: Response) => {
  const videoId = req.query.video_id ? Number(req.query.video_id) : null;
  if (videoId) {
    res.json({ items: jobsRepo.listForVideo(videoId) });
    return;
  }
  if (req.query.status === 'error') {
    res.json({ items: jobsRepo.listRecentFailed() });
    return;
  }
  res.json({ items: jobsRepo.listActive() });
});

// GET /api/jobs/stream — Server-Sent Events feed
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`: connected\n\n`);
  for (const job of jobsRepo.listActive()) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);
  }

  const unsubscribe = onJobChange(event => {
    res.write(`event: change\ndata: ${JSON.stringify(event.job)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch { /* connection closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// POST /api/jobs/:id/cancel
router.post('/:id/cancel', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ok = jobsRepo.cancel(id);
  if (!ok) {
    res.status(404).json({ error: 'Job not found or already finished' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/jobs/:id/retry — requeue a failed job
router.post('/:id/retry', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const job = jobsRepo.findById(id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'error' && job.status !== 'cancelled') {
    res.status(409).json({ error: 'Job is not in a retryable state' });
    return;
  }
  jobsRepo.enqueue({
    videoId: job.video_id,
    kind: job.kind,
    payload: job.payload ? JSON.parse(job.payload) : undefined,
  });
  res.json({ ok: true });
});

export default router;
