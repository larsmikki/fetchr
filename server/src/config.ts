import path from 'path';
import { fileURLToPath } from 'url';
import ffmpegStatic from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

export const config = {
  port: Number(process.env.PORT) || 3031,
  prodPort: 3030,
  dataDir,
  videosDir: path.join(dataDir, 'videos'),
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ffmpegPath: (process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg') as string,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientDistDir: path.join(__dirname, '..', '..', 'client', 'dist'),
};
