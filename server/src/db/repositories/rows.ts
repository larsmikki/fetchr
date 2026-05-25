import type { QueryExecResult } from 'sql.js';

export function firstRow<T = unknown>(result: QueryExecResult[]): T | null {
  if (!result.length || !result[0].values.length) return null;
  const row = result[0].values[0];
  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj as T;
}

export function allRows<T = unknown>(result: QueryExecResult[]): T[] {
  if (!result.length) return [];
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as T;
  });
}

export function scalar<T = unknown>(result: QueryExecResult[]): T | null {
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0] as T;
}
