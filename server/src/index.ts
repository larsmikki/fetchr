import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { initDb, startDbFlusher, stopDbFlusher } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { startJobWorker, stopJobWorker } from './services/jobs.service.js';

async function main() {
  mkdirSync(config.videosDir, { recursive: true });

  for (const file of readdirSync(config.videosDir).filter(f => f.endsWith('.part'))) {
    unlinkSync(`${config.videosDir}/${file}`);
    console.log(`Removed partial download: ${file}`);
  }

  await initDb();
  runMigrations();
  startDbFlusher();
  console.log('Database initialized');

  startJobWorker();
  console.log('Job worker started');

  const app = createApp();
  const port = config.nodeEnv === 'production' ? config.prodPort : config.port;

  app.listen(port, () => {
    console.log(`Fetchr server running on http://localhost:${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      await stopJobWorker();
    } finally {
      stopDbFlusher();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
