import { Router, Request, Response } from 'express';
import { readdir } from 'fs/promises';
import path from 'path';
import os from 'os';

const router = Router();

function buildBreadcrumbs(p: string): Array<{ label: string; path: string }> {
  const crumbs: Array<{ label: string; path: string }> = [];
  let current = p;
  while (true) {
    const parent = path.dirname(current);
    crumbs.unshift({ label: path.basename(current) || current, path: current });
    if (parent === current) break;
    current = parent;
  }
  return crumbs;
}

router.get('/', async (req: Request, res: Response) => {
  const reqPath = (req.query.path as string | undefined) || os.homedir();

  let normalized: string;
  try {
    normalized = path.resolve(reqPath);
  } catch {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    const dirents = await readdir(normalized, { withFileTypes: true });
    const entries = dirents
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => ({ name: d.name, path: path.join(normalized, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(normalized);
    const parent = parentPath !== normalized ? parentPath : null;

    res.json({ path: normalized, parent, entries, breadcrumbs: buildBreadcrumbs(normalized) });
  } catch {
    res.status(400).json({ error: `Cannot read: ${normalized}` });
  }
});

export default router;
