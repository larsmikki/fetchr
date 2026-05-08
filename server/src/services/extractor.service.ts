import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { tmpdir } from 'os';
import { mkdtemp, readdir, rename, copyFile, unlink, rm } from 'fs/promises';
import { config } from '../config.js';
import type { ExtractedInfo } from '../types/index.js';

const execFileAsync = promisify(execFile);

interface YtDlpFormat {
  ext: string;
  height?: number;
  url: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
}

interface YtDlpOutput {
  title?: string;
  description?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; preference?: number }>;
  formats?: YtDlpFormat[];
  url?: string;
  ext?: string;
  protocol?: string;
}

function extractSite(pageUrl: string): string | null {
  try {
    const hostname = new URL(pageUrl).hostname;
    // Strip www. prefix
    const parts = hostname.replace(/^www\./, '').split('.');
    // Return second-to-last part (e.g. "xhamster" from "xhamster.com")
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } catch {
    return null;
  }
}

function pickBestStreamUrl(output: YtDlpOutput): string | null {
  // If no formats array, fall back to top-level url
  if (!output.formats || output.formats.length === 0) {
    return output.url ?? null;
  }

  // Filter to direct MP4 formats with both video and audio (not HLS/DASH)
  const directMp4 = output.formats.filter(f => {
    const isMp4 = f.ext === 'mp4';
    const isDirect = f.protocol === 'https' || f.protocol === 'http' || !f.protocol;
    const notHlsDash = f.protocol !== 'm3u8' && f.protocol !== 'm3u8_native' && f.protocol !== 'dash';
    const hasUrl = !!f.url;
    const hasVideo = f.vcodec !== 'none' && f.vcodec !== undefined;
    const hasAudio = f.acodec !== 'none';
    return isMp4 && isDirect && notHlsDash && hasUrl && hasVideo && hasAudio;
  });

  if (directMp4.length > 0) {
    // Prefer H.264 (avc) for broadest browser compatibility; fall back to whatever is available
    const h264 = directMp4.filter(f => !f.vcodec || f.vcodec.startsWith('avc'));
    const candidates = h264.length > 0 ? h264 : directMp4;
    candidates.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    return candidates[0].url;
  }

  // Fallback: any format with a direct URL that has both video and audio
  const anyDirect = output.formats.filter(f => {
    const notHlsDash = f.protocol !== 'm3u8' && f.protocol !== 'm3u8_native' && f.protocol !== 'dash';
    const hasUrl = !!f.url;
    const hasVideo = f.vcodec !== 'none' && f.vcodec !== undefined;
    const hasAudio = f.acodec !== 'none';
    return notHlsDash && hasUrl && hasVideo && hasAudio;
  });

  if (anyDirect.length > 0) {
    // Again prefer H.264
    const h264 = anyDirect.filter(f => !f.vcodec || f.vcodec.startsWith('avc'));
    const candidates = h264.length > 0 ? h264 : anyDirect;
    candidates.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    return candidates[0].url;
  }

  // Last resort: top-level url
  return output.url ?? null;
}

function pickBestThumbnail(output: YtDlpOutput): string | null {
  if (output.thumbnail) return output.thumbnail;
  if (output.thumbnails && output.thumbnails.length > 0) {
    // Sort by preference descending if available
    const sorted = [...output.thumbnails].sort(
      (a, b) => (b.preference ?? 0) - (a.preference ?? 0),
    );
    return sorted[0].url ?? null;
  }
  return null;
}

export async function extractVideoInfo(pageUrl: string): Promise<ExtractedInfo & { site: string | null }> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      config.ytdlpPath,
      ['--dump-json', '--no-playlist', pageUrl],
      { maxBuffer: 10 * 1024 * 1024 }, // 10MB
    );
    stdout = result.stdout;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string; code?: string | number };
    if (error.code === 'ENOENT') {
      throw new Error('yt-dlp is not installed or not found in PATH');
    }
    const stderr = error.stderr ?? '';
    throw new Error(`yt-dlp failed: ${stderr || error.message}`);
  }

  let parsed: YtDlpOutput;
  try {
    parsed = JSON.parse(stdout) as YtDlpOutput;
  } catch {
    throw new Error('Failed to parse yt-dlp JSON output');
  }

  const description = parsed.description
    ? parsed.description.slice(0, 500)
    : null;

  return {
    title: parsed.title ?? null,
    description,
    duration: typeof parsed.duration === 'number' ? Math.round(parsed.duration) : null,
    thumbnail_url: pickBestThumbnail(parsed),
    stream_url: pickBestStreamUrl(parsed),
    site: extractSite(pageUrl),
  };
}

export async function getStreamUrl(pageUrl: string): Promise<string> {
  const info = await extractVideoInfo(pageUrl);
  if (!info.stream_url) {
    throw new Error('Could not extract a playable stream URL');
  }
  return info.stream_url;
}

export async function downloadToPath(videoId: number, pageUrl: string, outputDir: string, ffmpegPath: string): Promise<string> {
  // Use video ID as filename so we can find the file reliably after download
  const outputTemplate = path.join(outputDir, `${videoId}.%(ext)s`);
  try {
    await execFileAsync(
      config.ytdlpPath,
      [
        '--ffmpeg-location', ffmpegPath,
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '-o', outputTemplate,
        pageUrl,
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string };
    if (error.code === 'ENOENT') throw new Error('yt-dlp is not installed or not found in PATH');
    throw new Error(`yt-dlp download failed: ${error.stderr || (error as Error).message}`);
  }
  const files = await readdir(outputDir);
  const match = files.find(f => f.startsWith(`${videoId}.`));
  if (!match) throw new Error('Downloaded file not found after yt-dlp completed');
  return path.join(outputDir, match);
}

export async function downloadMp3ToPath(pageUrl: string, outputDir: string, ffmpegPath: string): Promise<void> {
  // Download and convert in a local temp dir to avoid hammering a network share
  // during ffmpeg conversion, then move the finished file in one shot.
  const tempDir = await mkdtemp(path.join(tmpdir(), 'reely-mp3-'));
  const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');
  const args = [
    '--ffmpeg-location', ffmpegPath,
    '--no-keep-video',
    '--windows-filenames',
    '--audio-quality', '0',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--output', outputTemplate,
    '--no-playlist',
    pageUrl,
  ];
  console.log(`[mp3] starting — output dir: ${outputDir}, ffmpeg: ${ffmpegPath}`);
  console.log(`[mp3] yt-dlp command: ${config.ytdlpPath} ${args.join(' ')}`);
  try {
    const { stdout, stderr } = await execFileAsync(config.ytdlpPath, args, { maxBuffer: 50 * 1024 * 1024 });
    console.log('[mp3] yt-dlp finished');
    if (stdout) console.log('[mp3] stdout:', stdout.trim());
    if (stderr) console.log('[mp3] stderr:', stderr.trim());

    const files = await readdir(tempDir);
    if (files.length === 0) {
      console.error('[mp3] yt-dlp produced no files in temp dir');
      return;
    }
    console.log(`[mp3] ${files.length} file(s) to move:`, files);

    await Promise.all(files.map(async file => {
      const src = path.join(tempDir, file);
      const dst = path.join(outputDir, file);
      try {
        await rename(src, dst);
        console.log(`[mp3] moved to: ${dst}`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EXDEV') {
          await copyFile(src, dst);
          await unlink(src);
          console.log(`[mp3] copied to: ${dst}`);
        } else {
          throw e;
        }
      }
    }));
    console.log('[mp3] done');
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    console.error('[mp3] failed:', error.stderr || error.stdout || (error as Error).message);
    if (error.code === 'ENOENT') throw new Error('yt-dlp is not installed or not found in PATH');
    throw new Error(`yt-dlp MP3 download failed: ${error.stderr || (error as Error).message}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
