# Reely — Improvement Proposals

A prioritized set of nine improvements across three categories, derived from a walkthrough of the current monorepo (React 19 client + Express/sql.js server).

---

## 1. Codebase Improvements

### 1.1 Extract a `VideoIngestion` service to fix the SRP/DRY violations in `server/src/routes/videos.ts`
The `POST /api/videos` and `PUT /api/videos/:id` handlers in `server/src/routes/videos.ts` each duplicate the entire metadata-fetch → DB-update → download → optional mp3/mp4 copy pipeline (see lines 152–219 and 494–541). The route file is ~590 lines and mixes HTTP concerns, DB access, settings lookup, filesystem work, and background orchestration.

**Proposal:** introduce `server/src/services/videoIngestion.service.ts` exposing `ingestNewVideo(id, url, opts)` and `reingestVideo(id, url, opts)`. Routes become thin: validate input, call the service, return. This removes the duplicated `extractVideoInfo → UPDATE → downloadToPath → copyFile → downloadMp3ToPath` block and isolates background-job logic so it can later be moved to a real queue.

### 1.2 Centralize DB access behind a typed repository instead of raw `db.exec` everywhere
Every route hand-rolls `db.exec(...)` + `rowToVideos` + `saveDb()` calls, and column lists are repeated as SQL strings. This is brittle (a schema change requires touching many files), leaks the `sql.js` shape into the HTTP layer, and the manual `rowToVideos` cast is unsafe.

**Proposal:** add `server/src/db/repositories/{videos,collections,settings}.ts` with typed methods (`findById`, `list`, `insert`, `update`, `delete`). Routes import the repo; sql.js stays an implementation detail. Bonus: makes a future swap to `better-sqlite3` (synchronous, faster, native prepared statements) a one-file change.

### 1.3 Harden the streaming/thumbnail proxy and yt-dlp invocation
Two concrete concerns:
- **SSRF / open proxy.** `GET /api/videos/:id/thumbnail` (`videos.ts:422`) and the stream proxy (`videos.ts:281`) `fetch()` whatever URL is stored in the row, without validating scheme or host. If a row's `thumbnail_url` or resolved stream URL is ever attacker-controlled (e.g. via import), the server will happily fetch internal addresses and pipe them to the client.
- **Cache key collision across desktops.** `streamUrlCache` is keyed by `video.id` only, which is fine today but the TTL (4h) plus the cross-process restart means stale URLs can survive. The 403/410 retry path is good — generalize it into a small `ResolvedStreamUrl` helper with explicit invalidation.

**Proposal:** add an allowlist (`https:` only, reject RFC1918 / loopback / link-local hosts) for outbound proxy fetches, and move stream-URL resolution + invalidation into a dedicated helper with unit tests. Also pass yt-dlp arguments via `execFile` argv (already done) but audit `extractor.service.ts` to ensure no string concatenation creeps in.

---

## 2. New Features

### 2.1 (Big) Background job queue with progress + retry, surfaced in the UI
Today, downloads run as fire-and-forget Promises inside route handlers (`videos.ts:187`, `videos.ts:514`). There is no progress reporting, no retry on failure, no cancellation, and a server restart loses everything in flight. The client polls `/api/videos` every 3s when any row is `pending` (`FrontPage.tsx:59`) — wasteful and coarse.

**Proposal:** introduce a persisted `jobs` table (`id, video_id, kind, status, progress, error, attempts, created_at, updated_at`) and a small worker loop that pulls pending jobs. Stream progress to the client via SSE (`GET /api/jobs/stream`) so the front page and video cards can show a real progress bar, pause/resume/cancel buttons, and surface errors with a retry action. This also unlocks bulk operations (e.g. "re-download all failed").

### 2.2 (Smaller) Tags on videos, in addition to single-collection membership
Collections are currently 1:N (a video belongs to one collection). Users frequently want orthogonal slicing — e.g. "favorites", "to-watch", "workout". Add a `tags` table + `video_tags` join, expose `POST/DELETE /api/videos/:id/tags/:tag`, and add a tag-chip row under the search bar that AND-filters with the collection pill row.

### 2.3 (Smaller) Keyboard shortcuts + command palette
Power users will use this app heavily. Add a Cmd/Ctrl-K palette (jump to collection, add video, toggle theme, switch desktop) and a small set of global shortcuts: `/` focus search, `n` new video, `j/k` move selection in the grid, `space` play. The mini-player already has play/pause UI — wire `space`/`←/→` to it when the palette is closed.

---

## 3. UI/UX Improvements

### 3.1 Standardize the design system — stop inline-styling the brand gradient and theme tokens
The crimson gradient `linear-gradient(135deg, #e11d48 0%, #9f1239 100%)` is hardcoded as an inline style in at least four spots (`FrontPage.tsx:119,238,471,519`, plus identical literals in `CollectionPage.tsx` and modals), and `theme.accent` / `theme.surface` are wired by hand into every button and input. This produces drift (the empty-state button uses the gradient without the shadow; the primary button has a shadow; the modal CTA has neither variant aligned).

**Proposal:** create `components/ui/{Button,Input,Select,Modal,Pill,Card}.tsx` with `variant` props (`primary | secondary | ghost`) consuming theme tokens, and a single `--brand-gradient` CSS variable. Replace inline styles incrementally. This also fixes the inconsistent border-radius (`rounded-lg` vs `rounded-xl` vs `rounded-2xl` chosen ad-hoc) and the inconsistent control heights between the search input (py-2.5) and pills (py-1.5).

### 3.2 Restructure the Settings page into clear sections with sticky save state
`SettingsPage.tsx` currently has two near-identical `<form>` blocks for `download_path` and `ffmpeg_path` with their own loading/saved state, plus Import/Export and Theme controls scattered down the page. The "Saved" affordance is a 2-second flash that's easy to miss, and there's no overview of what's configured.

**Proposal:** group settings into a left-rail layout (Library / Downloads / Tools / Data / Appearance), use a single shared "row" component (`label · value · inline editor · status`), and replace the timed flash with a persistent state ("Synced" / "Unsaved changes — Save" / "Error") next to each field. Move Import/Export into a dedicated Data section with explicit "what gets exported" copy.

### 3.3 Promote the mini-player and make the Front page filter row coherent
Two related issues:
- **Mini-player discoverability.** The bottom bar (`Layout.tsx:58`) collapses to 40px tall when idle and only shows the music-mode toggle, which reads as visual noise. When active it shows thumbnail/title/play/expand/close — fine, but the progress bar is a 3px strip that's easy to miss and the seek hit-target is tiny.
- **Front page filter bar.** Search, "All", "Uncategorized", and N collection pills all wrap into one flex row that can grow several lines tall with many collections (`FrontPage.tsx:163–207`). The grouped-mode header style (uppercase tracking-widest, lines 252–254) doesn't match anything else in the app.

**Proposal:** (a) Hide the idle mini-bar entirely until a video is playing, and grow the active bar to 64px with a 6–8px progress bar and clearer hit targets. Add elapsed/total time. (b) Collapse the collection pill row into a "Filter ▾" dropdown when there are >6 collections, keeping pills inline below that threshold. Reuse the same pill component on the Collection page header to remove the bespoke uppercase section labels.

---

## Suggested ordering

1. **1.1 + 1.2** first — the routes file is the biggest source of future bugs; refactoring it unlocks everything else.
2. **3.1** next — the design-system extraction is a prerequisite for 3.2/3.3 not introducing more drift.
3. **2.1** as the next big feature once routes are thin enough to drop in a worker.
4. **1.3, 2.2, 2.3, 3.2, 3.3** can be sequenced based on user feedback.
