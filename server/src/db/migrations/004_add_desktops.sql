ALTER TABLE collections ADD COLUMN desktop_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE videos ADD COLUMN desktop_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_collections_desktop ON collections(desktop_id);
CREATE INDEX idx_videos_desktop ON videos(desktop_id);
