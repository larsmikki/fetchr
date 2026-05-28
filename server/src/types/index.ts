export interface Collection {
  id: number;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  video_count: number;
  created_at: string;
}

export interface Video {
  id: number;
  collection_id: number | null;
  page_url: string;
  title: string | null;
  description: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  site: string | null;
  added_at: string;
  updated_at: string;
  fetch_status: 'pending' | 'ok' | 'error';
  fetch_error: string | null;
  notes: string | null;
  local_path: string | null;
  desktop_id: 1 | 2;
}

export interface ExtractedInfo {
  title: string | null;
  description: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  stream_url: string | null;
}
