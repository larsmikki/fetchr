# Reely

![screenshot](screenshot.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-larsmikki%2Freely-blue?logo=docker)](https://hub.docker.com/r/larsmikki/reely)
[![ghcr.io](https://img.shields.io/badge/ghcr.io-larsmikki%2Freely-blue?logo=github)](https://github.com/larsmikki/reely/pkgs/container/reely)
[![Node 20](https://img.shields.io/badge/Node-20-brightgreen?logo=node.js)](https://nodejs.org/)

**Reely** is a self-hosted video collection manager. Paste any video URL, and Reely saves it to your library — ready to stream in-browser or download. Organize your videos into collections, search across your library, and keep everything on your own machine.

## Features

- Paste any URL and Reely fetches the title, thumbnail, and metadata via yt-dlp
- **Stream in-browser** with a persistent bottom player — keep watching while you browse your library
- **Download** videos or extract MP3 audio directly to a folder on your server
- Organize into **collections** with custom colors
- Multiple **desktops** — separate workspaces for different libraries
- Full-text search across your video library
- Export and import your full library as a backup
- 10 built-in themes (light and dark)
- No tracking, no accounts, no cloud — your data stays on your machine

## Requirements

- Docker and Docker Compose

yt-dlp and ffmpeg are included in the Docker image — nothing else to install.

## Docker setup

### Quick start

```bash
docker run -d \
  --name reely \
  -p 3030:3030 \
  -v reely-data:/app/data \
  --restart unless-stopped \
  larsmikki/reely:latest
```

Then open [http://localhost:3030](http://localhost:3030).

### Docker Compose (recommended)

```yaml
services:
  reely:
    image: larsmikki/reely:latest
    container_name: reely
    ports:
      - "3030:3030"
    volumes:
      - reely-data:/app/data
      # - /path/to/your/output:/output  # optional: mount a host folder for downloads
    restart: unless-stopped

volumes:
  reely-data:
```

To download videos to a folder on your host machine, uncomment the second volume line, set the host path, and configure the download path to `/output` in **Settings**.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3030` | Port the server listens on |
| `DATA_DIR` | `/app/data` | Directory for the database and downloaded videos |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` | Path to ffmpeg binary (pre-installed in Docker) |

## Usage

| Action | How |
|--------|-----|
| Add a video | Click **Add Video** and paste any URL |
| Play a video | Click the thumbnail — player appears at the bottom |
| Download video | Open a video's menu → **Download** |
| Extract MP3 | Open a video's menu → **Download MP3** |
| Organize | Create a collection and drag videos into it |
| Switch desktop | Use the desktop switcher in the header |
| Backup | **Settings → Export** |
| Restore | **Settings → Import** |

## Data and runtime folders

```
/app/data/
  reely.db     # SQLite database (videos, collections, settings)
  videos/      # downloaded video files (if download path is inside /app/data)
```

## Troubleshooting

**Video fails to fetch metadata**
Some sites are not supported by yt-dlp or may require cookies. Check that the URL is publicly accessible and try updating to the latest Docker image (yt-dlp is updated with each release).

**Streaming doesn't work**
Reely streams directly from the source URL via yt-dlp. If the source site throttles or blocks server-side requests, playback may fail. Downloading the video first is a reliable alternative.

**Download path not working**
Make sure you have mounted a host folder into the container and set the path in **Settings → Download path** to match the container-side mount point (e.g. `/output`).

## License

[MIT](LICENSE)

## Support

If Reely saves you time, consider [buying me a coffee](https://buymeacoffee.com/larsmikki) or [donating via PayPal](https://paypal.me/larsmikki). It helps keep the project free and maintained.
