import { Router, Request, Response } from 'express';
import type { BindParams } from 'sql.js';
import { getDb, saveDb } from '../db/connection.js';
import type { Collection } from '../types/index.js';

const router = Router();

function rowToCollection(columns: string[], values: unknown[][]): Collection[] {
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as unknown as Collection;
  });
}

// GET /api/collections
router.get('/', (req: Request, res: Response) => {
  const desktopId = req.query.desktop === '2' ? 2 : 1;
  const db = getDb();
  const result = db.exec(`
    SELECT
      c.id, c.name, c.description, c.color, c.sort_order, c.created_at,
      COUNT(v.id) AS video_count
    FROM collections c
    LEFT JOIN videos v ON v.collection_id = c.id
    WHERE c.desktop_id = $desktop_id
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.created_at ASC
  `, { $desktop_id: desktopId });

  const collections = result.length ? rowToCollection(result[0].columns, result[0].values) : [];

  const totalResult = db.exec('SELECT COUNT(*) FROM videos WHERE desktop_id = $desktop_id', { $desktop_id: desktopId });
  const totalVideoCount = totalResult.length ? (totalResult[0].values[0][0] as number) : 0;

  const uncatResult = db.exec('SELECT COUNT(*) FROM videos WHERE collection_id IS NULL AND desktop_id = $desktop_id', { $desktop_id: desktopId });
  const uncategorizedCount = uncatResult.length ? (uncatResult[0].values[0][0] as number) : 0;

  res.json({ items: collections, totalVideoCount, uncategorizedCount });
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

  const desktopId = desktop_id === 2 ? 2 : 1;
  const db = getDb();

  const maxOrderResult = db.exec('SELECT COALESCE(MAX(sort_order), -1) FROM collections WHERE desktop_id = $desktop_id', { $desktop_id: desktopId });
  const maxOrder = maxOrderResult.length
    ? (maxOrderResult[0].values[0][0] as number)
    : -1;

  db.run(
    `INSERT INTO collections (name, description, color, sort_order, desktop_id) VALUES ($name, $description, $color, $sort_order, $desktop_id)`,
    {
      $name: name.trim(),
      $description: description ?? null,
      $color: color ?? '#e11d48',
      $sort_order: maxOrder + 1,
      $desktop_id: desktopId,
    },
  );

  const idResult = db.exec('SELECT last_insert_rowid()');
  const id = idResult[0].values[0][0] as number;
  saveDb();

  const collResult = db.exec(
    `SELECT c.id, c.name, c.description, c.color, c.sort_order, c.created_at, COUNT(v.id) AS video_count
     FROM collections c LEFT JOIN videos v ON v.collection_id = c.id
     WHERE c.id = $id GROUP BY c.id`,
    { $id: id },
  );

  const collection = rowToCollection(collResult[0].columns, collResult[0].values)[0];
  res.status(201).json(collection);
});

// PUT /api/collections/reorder  (must be before /:id)
router.put('/reorder', (req: Request, res: Response) => {
  const { ids } = req.body as { ids: number[] };

  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }

  const db = getDb();
  ids.forEach((id, index) => {
    db.run('UPDATE collections SET sort_order = $order WHERE id = $id', {
      $order: index,
      $id: id,
    });
  });
  saveDb();

  res.json({ status: 'ok' });
});

function updateCollectionHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, description, color, sort_order } = req.body as {
    name?: string;
    description?: string;
    color?: string;
    sort_order?: number;
  };

  const db = getDb();

  const existing = db.exec('SELECT id FROM collections WHERE id = $id', { $id: id });
  if (!existing.length || !existing[0].values.length) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  const updates: string[] = [];
  const params: BindParams = { $id: id };

  if (name !== undefined) { updates.push('name = $name'); params.$name = name.trim(); }
  if (description !== undefined) { updates.push('description = $description'); params.$description = description; }
  if (color !== undefined) { updates.push('color = $color'); params.$color = color; }
  if (sort_order !== undefined) { updates.push('sort_order = $sort_order'); params.$sort_order = sort_order; }

  if (updates.length > 0) {
    db.run(`UPDATE collections SET ${updates.join(', ')} WHERE id = $id`, params);
    saveDb();
  }

  const collResult = db.exec(
    `SELECT c.id, c.name, c.description, c.color, c.sort_order, c.created_at, COUNT(v.id) AS video_count
     FROM collections c LEFT JOIN videos v ON v.collection_id = c.id
     WHERE c.id = $id GROUP BY c.id`,
    { $id: id },
  );

  const collection = rowToCollection(collResult[0].columns, collResult[0].values)[0];
  res.json(collection);
}

// PUT/PATCH /api/collections/:id
router.put('/:id', updateCollectionHandler);
router.patch('/:id', updateCollectionHandler);

// DELETE /api/collections/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();

  const existing = db.exec('SELECT id FROM collections WHERE id = $id', { $id: id });
  if (!existing.length || !existing[0].values.length) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  db.run('DELETE FROM collections WHERE id = $id', { $id: id });
  saveDb();

  res.json({ status: 'ok' });
});

export default router;
