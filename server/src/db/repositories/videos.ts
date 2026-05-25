import type { BindParams } from 'sql.js';
import { getDb, markDirty } from '../connection.js';
import { firstRow, allRows, scalar } from './rows.js';
import type { Video } from '../../types/index.js';

export interface VideoListFilter {
  desktopId: 1 | 2;
  collectionId?: number | 'null';
  q?: string;
  page: number;
  limit: number;
}

export interface VideoCreate {
  pageUrl: string;
  collectionId: number | null;
  notes: string | null;
  desktopId: 1 | 2;
}

export interface VideoPatch {
  pageUrl?: string;
  title?: string | null;
  description?: string | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  site?: string | null;
  notes?: string | null;
  collectionId?: number | null;
  localPath?: string | null;
  fetchStatus?: 'pending' | 'ok' | 'error';
  fetchError?: string | null;
  resetMetadata?: boolean;
}

const COL_MAP: Record<keyof Omit<VideoPatch, 'resetMetadata'>, string> = {
  pageUrl: 'page_url',
  title: 'title',
  description: 'description',
  duration: 'duration',
  thumbnailUrl: 'thumbnail_url',
  site: 'site',
  notes: 'notes',
  collectionId: 'collection_id',
  localPath: 'local_path',
  fetchStatus: 'fetch_status',
  fetchError: 'fetch_error',
};

export const videosRepo = {
  list(filter: VideoListFilter): { items: Video[]; total: number } {
    const db = getDb();
    const conditions = ['desktop_id = $desktop_id'];
    const params: BindParams = { $desktop_id: filter.desktopId };

    if (filter.collectionId !== undefined) {
      if (filter.collectionId === 'null') {
        conditions.push('collection_id IS NULL');
      } else {
        conditions.push('collection_id = $collection_id');
        params.$collection_id = filter.collectionId;
      }
    }
    if (filter.q) {
      conditions.push('(title LIKE $q OR notes LIKE $q OR page_url LIKE $q)');
      params.$q = `%${filter.q}%`;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = scalar<number>(db.exec(`SELECT COUNT(*) FROM videos ${where}`, params)) ?? 0;

    const offset = (filter.page - 1) * filter.limit;
    const items = allRows<Video>(
      db.exec(
        `SELECT * FROM videos ${where} ORDER BY added_at DESC LIMIT $limit OFFSET $offset`,
        { ...params, $limit: filter.limit, $offset: offset },
      ),
    );
    return { items, total };
  },

  findById(id: number): Video | null {
    return firstRow<Video>(getDb().exec('SELECT * FROM videos WHERE id = $id', { $id: id }));
  },

  existsByUrl(pageUrl: string, desktopId: 1 | 2): boolean {
    return !!firstRow(
      getDb().exec('SELECT id FROM videos WHERE page_url = $url AND desktop_id = $d', {
        $url: pageUrl,
        $d: desktopId,
      }),
    );
  },

  create(input: VideoCreate): Video {
    const db = getDb();
    db.run(
      `INSERT INTO videos (page_url, collection_id, notes, fetch_status, desktop_id)
       VALUES ($url, $cid, $notes, 'pending', $d)`,
      {
        $url: input.pageUrl,
        $cid: input.collectionId,
        $notes: input.notes,
        $d: input.desktopId,
      },
    );
    const id = scalar<number>(db.exec('SELECT last_insert_rowid()'))!;
    markDirty();
    return this.findById(id)!;
  },

  update(id: number, patch: VideoPatch): Video | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = ["updated_at = datetime('now')"];
    const params: BindParams = { $id: id };

    if (patch.resetMetadata) {
      updates.push(
        "fetch_status = 'pending'",
        'fetch_error = NULL',
        'title = NULL',
        'description = NULL',
        'duration = NULL',
        'thumbnail_url = NULL',
        'site = NULL',
        'local_path = NULL',
      );
    }

    for (const [key, col] of Object.entries(COL_MAP) as Array<[keyof typeof COL_MAP, string]>) {
      const value = patch[key];
      if (value === undefined) continue;
      if (patch.resetMetadata && key !== 'pageUrl' && key !== 'collectionId' && key !== 'notes') continue;
      const placeholder = `$${col}`;
      updates.push(`${col} = ${placeholder}`);
      params[placeholder] = value as never;
    }

    db.run(`UPDATE videos SET ${updates.join(', ')} WHERE id = $id`, params);
    markDirty();
    return this.findById(id);
  },

  delete(id: number): boolean {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return false;
    db.run('DELETE FROM videos WHERE id = $id', { $id: id });
    markDirty();
    return true;
  },

  countInCollection(collectionId: number): number {
    return scalar<number>(
      getDb().exec('SELECT COUNT(*) FROM videos WHERE collection_id = $cid', { $cid: collectionId }),
    ) ?? 0;
  },
};
