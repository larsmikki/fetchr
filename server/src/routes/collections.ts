import { Router, Request, Response } from 'express';
import { collectionsRepo } from '../db/repositories/collections.js';
import { rewriteSidecarsForCollection } from '../util/sidecar.js';

const router = Router();

function pickDesktop(value: unknown): 1 | 2 {
  return value === 2 || value === '2' ? 2 : 1;
}

// GET /api/collections
router.get('/', (req: Request, res: Response) => {
  const desktopId = pickDesktop(req.query.desktop);
  res.json({
    items: collectionsRepo.list(desktopId),
    totalVideoCount: collectionsRepo.countTotalVideos(desktopId),
    uncategorizedCount: collectionsRepo.countUncategorized(desktopId),
  });
});

// POST /api/collections
router.post('/', (req: Request, res: Response) => {
  const { name, description, color, desktop_id } = req.body as {
    name: string;
    description?: string;
    color?: string;
    desktop_id?: number;
  };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const collection = collectionsRepo.create({
    name: name.trim(),
    description: description ?? null,
    color: color ?? '#e11d48',
    desktopId: pickDesktop(desktop_id),
  });
  res.status(201).json(collection);
});

// PUT /api/collections/reorder
router.put('/reorder', (req: Request, res: Response) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }
  collectionsRepo.reorder(ids);
  res.json({ status: 'ok' });
});

async function updateHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { name, description, color, sort_order } = req.body as {
    name?: string;
    description?: string;
    color?: string;
    sort_order?: number;
  };
  const existing = collectionsRepo.findById(id);
  const updated = collectionsRepo.update(id, {
    name,
    description,
    color,
    sortOrder: sort_order,
  });
  if (!updated) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  if (existing && name !== undefined && name.trim() !== existing.name) {
    await rewriteSidecarsForCollection(id);
  }
  res.json(updated);
}

router.put('/:id', updateHandler);
router.patch('/:id', updateHandler);

// DELETE /api/collections/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!collectionsRepo.delete(id)) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  res.json({ status: 'ok' });
});

export default router;
