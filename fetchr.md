# Rename: Reely → Fetchr

A structured to-do plan for renaming the project from **Reely** to **Fetchr**.

**Status (2026-05-28):** All in-repo work is complete. Build passes, 92/92 tests pass,
`grep -ri reely` returns only this doc + binary-noise matches inside `data/videos/*.mp4`
and the orphaned `data/reely.db` (expected; will be ignored, new code uses `data.db`).
Remaining work is **external/manual**: rename the GitHub repo, update the local `origin`,
and `docker push larsmikki/fetchr:latest` (the Docker Hub repo auto-creates as public on first push).

Throughout: GitHub owner stays `larsmikki`, new repo/image slug is `fetchr`,
Docker image becomes `larsmikki/fetchr`.

---

## ⚠️ Read first — three categories of change

**Guiding principle for this rename: stop baking the app name into things that don't need it.**
Internal identifiers (db filename, storage keys, cache names, temp dirs) should become
**brand-neutral**, not `reely`→`fetchr`. That way the name never has to be touched again on
the next rename. We **accept that this orphans existing data** (empty library, lost preferences,
lost offline cache on upgrade) as a deliberate one-time cost for a clean codebase.

Occurrences fall into three groups:

1. **Brand display** — where the product name *should* appear: window title, header/footer, manifest, docs, image name, app stores. → `Fetchr`.
2. **Build/infra identifiers** — package names, image/container names. → rename to `fetchr-*`; must be consistent and require regenerating `package-lock.json`.
3. **Internal identifiers** — db filename, `localStorage` keys, IndexedDB name, SW cache, temp dirs. → **make brand-neutral** (see §5). Orphans data on upgrade — accepted.

---

## 1. External services (manual, outside the codebase)

- [ ] **GitHub repo** — rename `larsmikki/reely` → `larsmikki/fetchr` (Settings → Rename). GitHub auto-redirects the old URL, but update the local remote:
  - `git remote set-url origin https://github.com/larsmikki/fetchr.git`
- [ ] **Docker Hub** — Docker Hub cannot rename a repo, but `docker push larsmikki/fetchr:latest` against a non-existent repo **auto-creates it (public by default)** — no need to pre-create via the UI. Optionally keep the old `larsmikki/reely` repo with a deprecation note in its description.
- [ ] **ghcr.io (GitHub Container Registry)** — package follows the repo; the new image path becomes `ghcr.io/larsmikki/fetchr`. Old `reely` package can be deleted or left as deprecated.
- [ ] **Buy Me a Coffee / PayPal** — handles (`larsmikki`) are personal, not project-named; no change needed (`.github/FUNDING.yml`).
- [ ] Update any pinned/published image tags consumers rely on; announce the image-name change so existing users repoint their compose files.

## 2. Build & package metadata

- [ ] `package.json` (root) — `"name": "reely"` → `"fetchr"`
- [ ] `server/package.json` — `"name": "reely-server"` → `"fetchr-server"`
- [ ] `client/package.json` — `"name": "reely-client"` → `"fetchr-client"`
- [ ] `package-lock.json` — contains `reely`, `reely-server`, `reely-client` and workspace nodes (`node_modules/reely-client`, `node_modules/reely-server`). **Do not hand-edit** — it regenerates from the `package.json` names.
- [ ] **`node_modules/` (generated, not committed)** — workspace symlinks `node_modules/reely-client` → `client/` and `node_modules/reely-server` → `server/`, plus npm's cached `node_modules/.package-lock.json`, are all derived from the `name` fields above. ⚠️ A plain `npm install` creates the new `fetchr-*` symlinks but **leaves the stale `reely-*` symlinks as orphans**. After renaming the three `package.json` names, do a **clean reinstall** to clear them: `rm -rf node_modules && npm install` (PowerShell: `Remove-Item -Recurse -Force node_modules; npm install`). This also regenerates `package-lock.json` and `.package-lock.json` cleanly.

## 3. Container / deployment config

- [ ] `docker-compose.yml`:
  - service key `reely:` → `fetchr:`
  - `image: larsmikki/reely:latest` → `larsmikki/fetchr:latest`
  - `container_name: reely` → `fetchr`
  - volume `reely-data` (both the mount ref and the `volumes:` declaration) → `fetchr-data` *(note: renaming the volume orphans existing data on running deployments — see §5)*
- [ ] `Dockerfile` — no literal "reely" strings; no change required (verify after).

## 4. User-facing display text (cosmetic, safe)

- [ ] `client/index.html` — `<title>Reely</title>` and `<meta name="apple-mobile-web-app-title" content="Reely" />`
- [ ] `client/public/manifest.json` — `"name"` and `"short_name"`
- [ ] `client/src/components/Layout.tsx` — header brand text `Reely` (line ~185) and the logo `alt="Reely"` (line ~143)
- [ ] `client/src/components/Footer.tsx` — `© {year} Reely`
- [ ] `client/src/pages/SettingsPage.tsx` — "Customize your Reely experience."
- [ ] `client/src/pages/DonatePage.tsx` — multiple "Reely" mentions (Support Reely, body copy, "Why support Reely?", thank-you line)
- [ ] `server/src/index.ts` — startup log `Reely server running on ...`

## 5. Internal identifiers → make brand-neutral (accepts data orphaning)

Strip the app name out of these entirely. **We accept that upgrading installs lose this state**
(empty library, reset preferences, cleared offline cache) — a one-time cost so the name is never
baked in again. No migration code.

- [ ] **SQLite DB filename** — `server/src/db/connection.ts` `reely.db` → **`data.db`**. Also update the `data/reely.db` reference in `AGENTS.md` and the README data-layout section.
  - ⚠️ Existing self-hosted installs start with an empty library (the old `reely.db` is simply ignored). Document this in the upgrade note.
- [ ] **Browser `localStorage` keys** — drop the prefix:
  - `client/src/api.ts` — `reely_desktop` → **`desktop`**
  - `client/src/contexts/ThemeContext.tsx` — `reely-theme` → **`theme`**
  - `client/src/contexts/PlayerContext.tsx` — `reely_music_mode` → **`music_mode`**; `reely_player_d${desktop}` → **`player_d${desktop}`**
  - ⚠️ Users' saved theme / desktop / music-mode / player preferences reset to defaults once.
- [ ] **IndexedDB database** — `reely-offline` → **`offline`**, in `client/src/offline/db.ts` *and* `client/public/sw.js` (the two **must stay in sync**).
  - ⚠️ Previously downloaded offline videos are orphaned (re-download needed).
- [ ] **Service worker cache version** — `reely-v1` → **`v1`** (or `app-v1`) in `client/public/sw.js`. Caches are disposable; this just forces a one-time re-cache.
- [ ] **Temp-dir prefixes** (internal, never user-visible):
  - `server/src/services/extractor.service.ts` — `reely-mp3-` → **`mp3-`**
  - `server/vitest.config.ts` + the test mocks — `reely-test` → **`test-data`** (see §8)

### Stays brand-named (the name belongs here)

- [ ] **Capacitor `appId`** — `client/capacitor.config.ts` `app.reely.client` → **`app.fetchr.client`**. Reverse-domain IDs are inherently namespaced; brand-neutral isn't an option.
  - 🔴 Still note: changing `appId` makes app stores treat it as a *new app* (no update path for installed users). Only an issue if mobile builds have been published. `appName: 'Reely'` → `'Fetchr'`.
- [ ] **User-facing download filenames** — **keep branded** → **`fetchr-backup.json`**, **`fetchr-videos.zip`** (see §7). Decided: these land in the user's Downloads folder alongside exports from the other 11 apps in the suite, so a brand prefix prevents collisions / overwrites (a neutral `backup.json` would clash across apps).

## 6. Branding assets

- [ ] `client/public/favicon.svg` — `aria-label="reely"` and gradient `id="bg-reely"` (+ `fill="url(#bg-reely)"`). Rename the id consistently or leave it (internal SVG id, cosmetic). Update label.
- [ ] `client/public/apple-touch-icon.source.svg` — same: `aria-label="Reely"`, `id="bg-reely"`, `fill="url(#bg-reely)"`.
- [ ] Regenerate `client/public/apple-touch-icon.png` (referenced by manifest) if the artwork/initial changes.
- [ ] `screenshot.png` (README) — update if it shows the old name in-app.
- [ ] Consider whether the logo glyph itself should change (currently a play/triangle — neutral, likely fine for "Fetchr").

## 7. User-facing download filenames (keep branded — see §5)

- [ ] `client/src/api.ts` — `reely-backup.json` → `fetchr-backup.json`, `reely-videos.zip` → `fetchr-videos.zip`
- [ ] `server/src/routes/data.ts` — `Content-Disposition` filenames, same two renames (client and server must match)
- [ ] *(Internal temp-dir prefix `reely-mp3-` is handled in §5 as a brand-neutral rename.)*

## 8. Tests

Rename `reely-test` → `test-data` (brand-neutral, per §5). Self-contained fixtures — keep them internally consistent.

- [ ] `server/vitest.config.ts` — `DATA_DIR` temp path `reely-test`
- [ ] `server/tests/jobs.test.ts` — `/tmp/reely-test/videos/...` mock paths (2 places)
- [ ] `server/tests/videos.test.ts` — `/tmp/reely-test/videos/1.mp4`
- [ ] `server/tests/data.test.ts` — `/tmp/reely-test/videos/1.mp4`
- [ ] `server/tests/settings.test.ts` — listed by search; confirm/replace any name reference during the edit pass.

## 9. Documentation

- [ ] `README.md` — title `# Reely`, prose mentions, badges (Docker Hub / ghcr.io URLs + slugs), all `git clone https://github.com/larsmikki/reely.git` / `cd reely`, the `docker run --name reely ... -v reely-data ... larsmikki/reely:latest` example, the compose snippet, and `reely.db` reference in the data-layout section.
- [ ] `AGENTS.md` — `data/reely.db` reference (align with the §5 db-filename decision).

## 10. Local working directory (REQUIRED — not optional)

- [ ] Rename project folder `C:\java\reely` → `C:\java\fetchr`. **This is required, not optional**, because:
  - `C:\java\shared\.icon-build\*.mjs` scripts (12 of them — see §11) use the app key as a folder name in `${ROOT}/${app}/client/...`. After renaming their `reely` keys to `fetchr`, the script can only find the app if the folder is `fetchr`.
  - `C:\java\shared\APPS.md` and `design-system/textarea-primitive.md` document `C:\java\fetchr\client` paths and a relative `<img src="../fetchr/...">` reference — these break until the folder matches.
- Steps: close the IDE / this Claude session, rename the folder in Explorer or via `Rename-Item C:\java\reely C:\java\fetchr` from a parent shell, then reopen Claude Code with cwd `C:\java\fetchr`. Update any IDE launch configs and shell aliases.

## 11. Shared fleet resources (`C:\java\shared\`)

This rename touches three shared docs and **ten** icon-build scripts because the app key is used as a folder name across the fleet:

- [ ] `C:\java\shared\APPS.md` — name + path + relative `<img src>` in three tables (Overview, Descriptions, Ports, Per-App Details) + a reference to "fetchr's `Dockerfile`".
- [ ] `C:\java\shared\STRUCTURE.md` — three mentions: reference apps list, `.gitignore` baseline, and Dockerfile reference.
- [ ] `C:\java\shared\design-system\README.md` — fleet list (top), brand palette table row, primitives reference-app line.
- [ ] `C:\java\shared\design-system\tokens.css` — fleet list in the header comment.
- [ ] `C:\java\shared\design-system\icons.md` — symbol table row, spectrum order line, palette table row.
- [ ] `C:\java\shared\design-system\textarea-primitive.md` — two PowerShell scan commands + the "Not Migration Targets" table row (paths + name).
- [ ] `C:\java\shared\.icon-build\` — the app key in **ten** scripts: `apply-accents.mjs`, `apply-grounded.mjs`, `apply.mjs` (key + 2 comments), `checkpng.mjs`, `corners.mjs`, `migrate.mjs`, `plot.mjs` (DIR map, LIGHTS array, ACCENTS map, prose paragraph), `revert.mjs`, `sync-touch.mjs`, `verify-grounded.mjs`. These keys are used as `${ROOT}/${app}/client/...` folder paths — they **must** change in lockstep with the folder rename.
- [ ] After the folder rename, run `node verify-grounded.mjs` from `C:\java\shared\.icon-build\` to confirm the palette tooling still finds the renamed app.

---

## Suggested order of execution

1. §5 names confirmed: neutral internals (`data.db`, `desktop`/`theme`/`music_mode`/`player_d*`, `offline`, `v1`, `test-data`, `mp3-`); branded download filenames (`fetchr-backup.json` / `fetchr-videos.zip`) to avoid collisions across the app suite.
2. Code + config + docs edits (§2–9) in one branch.
3. `npm install` to regenerate `package-lock.json`; run the test suite.
4. Build & smoke-test the Docker image locally under the new `larsmikki/fetchr` tag.
5. Rename the GitHub repo, update `origin`, push the branch.
6. Create the Docker Hub repo / push image; verify ghcr.io path.
7. Publish a note for existing users about the new image name (and volume, if renamed).

## Verification checklist

- [ ] After the clean reinstall (§2), `grep -ri reely .` returns **zero** matches — including no leftover `node_modules/reely-*` symlinks or stale entries in `node_modules/.package-lock.json`.
- [ ] `grep -ri fetchr .` shows the name **only** where a brand belongs: display text, docs, `package.json` names, image/container names, Capacitor `appId`/`appName`, and (if kept branded) download filenames. Internal identifiers (`data.db`, `desktop`/`theme`/`music_mode`/`player_d*`, `offline`, `v1`, `test-data`, `mp3-`) must contain **no** brand name.
- [ ] App builds, server starts, tests pass.
- [ ] Fresh `docker compose up` works. Upgrade from an old install confirmed to start cleanly with an empty library (data orphaning is expected and documented — not a bug).
- [ ] PWA installs with the new name/icon; offline download + playback works against the fresh `offline` IndexedDB.

---

## Lessons for the next rename (captured during execution)

Things that bit (or nearly bit) on this pass — worth pre-empting next time:

- **Internal SVG `id`s count as internal identifiers too.** `favicon.svg` and `apple-touch-icon.source.svg` had `id="bg-reely"` + matching `fill="url(#bg-reely)"`. Renamed to `bg-logo` (brand-neutral). SVG IDs are scoped to the file but follow the same "don't bake the name in" principle.
- **Service worker comment header.** `client/public/sw.js` started with `// Reely service worker.` — generic-fy these (just `// Service worker.`).
- **Stale `dist/` output trips `grep` verification.** A `grep -ri <oldname>` before rebuilding lights up old build artifacts in `client/dist/` and `server/dist/`. Always rebuild before the final verification sweep, or exclude `dist/` from the grep.
- **`data/` is gitignored but lives in the working dir.** Local dev `data/reely.db` and downloaded `.mp4` files contain coincidental byte-sequence matches for the old name. Exclude `data/` from the verification grep, or `--exclude-dir=data`.
- **npm workspace symlinks orphan on plain `npm install`.** Confirmed: a clean `rm -rf node_modules && npm install` is required to clear `node_modules/<oldname>-*` symlinks and rewrite `node_modules/.package-lock.json`. Plain `npm install` leaves them.
- **The PNG `apple-touch-icon.png` does not auto-regenerate** from the `.source.svg` — if the logo glyph changes (not just the name), regenerate the PNG by hand.
- **External Docker Hub repo:** confirmed `docker push` to a non-existent repo auto-creates it (public default). No pre-creation UI step needed.
- **Shared fleet scripts use the app key as a folder name.** `C:\java\shared\.icon-build\*.mjs` builds paths as `${ROOT}/${app}/client/...`. That means the rename has to touch **ten scripts + three shared docs + the folder itself + the app code** atomically — or the palette tooling stops finding the app. Forgetting any one of those four surfaces leaves the fleet in a broken state. Sweep all of `C:\java\shared\` (APPS.md, STRUCTURE.md, design-system/, .icon-build/) before considering a rename done.
- **The folder name is load-bearing across the fleet** — it's not just a local convenience. If the app participates in any cross-fleet script keyed by folder name, the local folder rename becomes mandatory, not optional.

### Pre-flight grep that excludes the noise

```bash
grep -ri <oldname> . \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=data --exclude-dir=dist \
  --exclude=<rename-plan>.md
```
