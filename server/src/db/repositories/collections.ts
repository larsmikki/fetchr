import type { BindParams } from 'sql.js';
import { getDb, markDirty } from '../connection.js';
import { firstRow, allRows, scalar } from './rows.js';
import type { Collection } from '../../types/index.js';

export interface CollectionCreate {
  name: string;
  description: string | null;
  color: string;
  desktopId: 1 | 2;
}

export interface CollectionPatch {
  name?: string;
  description?: string | null;
  color?: string;
  sortOrder?: number;
}

const SELECT_WITH_COUNT = `
  SELECT c.id, c.name, c.description, c.color, c.sort_order, c.created_at,
         COUNT(v.id) AS video_count
  FROM collections c
  LEFT JOIN videos v ON v.collection_id = c.id
`;

export const collectionsRepo = {
  list(desktopId: 1 | 2): Collection[] {
    return allRows<Collection>(
      getDb().exec(
        `${SELECT_WITH_COUNT}
         WHERE c.desktop_id = $d
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.created_at ASC`,
        { $d: desktopId },
      ),
    );
  },

  findById(id: number): Collection | null {
    return firstRow<Collection>(
      getDb().exec(`${SELECT_WITH_COUNT} WHERE c.id = $id GROUP BY c.id`, { $id: id }),
    );
  },

  findByNameAndDesktop(name: string, desktopId: 1 | 2): Collection | null {
    return firstRow<Collection>(
      getDb().exec(
        `${SELECT_WITH_COUNT} WHERE c.name = $name AND c.desktop_id = $d GROUP BY c.id`,
        { $name: name, $d: desktopId },
      ),
    );
  },

  create(input: CollectionCreate): Collection {
    const db = getDb();
    const maxOrder = scalar<number>(
      db.exec('SELECT COALESCE(MAX(sort_order), -1) FROM collections WHERE desktop_id = $d', {
        $d: input.desktopId,
      }),
    ) ?? -1;

    db.run(
      `INSERT INTO collections (name, description, color, sort_order, desktop_id)
       VALUES ($name, $desc, $color, $sort, $d)`,
      {
        $name: input.name,
        $desc: input.description,
        $color: input.color,
        $sort: maxOrder + 1,
        $d: input.desktopId,
      },
    );
    const id = scalar<number>(db.exec('SELECT last_insert_rowid()'))!;
    markDirty();
    return this.findById(id)!;
  },

  update(id: number, patch: CollectionPatch): Collection | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: BindParams = { $id: id };
    if (patch.name !== undefined) { updates.push('name = $name'); params.$name = patch.name.trim(); }
    if (patch.description !== undefined) { updates.push('description = $description'); params.$description = patch.description; }
    if (patch.color !== undefined) { updates.push('color = $color'); params.$color = patch.color; }
    if (patch.sortOrder !== undefined) { updates.push('sort_order = $sort_order'); params.$sort_order = patch.sortOrder; }

    if (updates.length === 0) return existing;

    db.run(`UPDATE collections SET ${updates.join(', ')} WHERE id = $id`, params);
    markDirty();
    return this.findById(id);
  },

  delete(id: number): boolean {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return false;
    db.run('DELETE FROM collections WHERE id = $id', { $id: id });
    markDirty();
    return true;
  },

  reorder(ids: number[]): void {
    const db = getDb();
    ids.forEach((id, index) => {
      db.run('UPDATE collections SET sort_order = $o WHERE id = $id', { $o: index, $id: id });
    });
    markDirty();
  },

  pruneIfEmpty(id: number | null): void {
    if (id == null) return;
    const db = getDb();
    const count = scalar<number>(
      db.exec('SELECT COUNT(*) FROM videos WHERE collection_id = $id', { $id: id }),
    ) ?? 0;
    if (count === 0) {
      db.run('DELETE FROM collections WHERE id = $id', { $id: id });
    }
  },

  countTotalVideos(desktopId: 1 | 2): number {
    return scalar<number>(
      getDb().exec('SELECT COUNT(*) FROM videos WHERE desktop_id = $d', { $d: desktopId }),
    ) ?? 0;
  },

  countUncategorized(desktopId: 1 | 2): number {
    return scalar<number>(
      getDb().exec(
        'SELECT COUNT(*) FROM videos WHERE collection_id IS NULL AND desktop_id = $d',
        { $d: desktopId },
      ),
    ) ?? 0;
  },
};
