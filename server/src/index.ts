import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { initDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { config } from './config.js';

async function main() {
  mkdirSync(config.videosDir, { recursive: true });

  for (const file of readdirSync(config.videosDir).filter(f => f.endsWith('.part'))) {
    unlinkSync(`${config.videosDir}/${file}`);
    console.log(`Removed partial download: ${file}`);
  }

  await initDb();
  runMigrations();
  console.log('Database initialized');

  const app = createApp();
  const port = config.nodeEnv === 'production' ? config.prodPort : config.port;

  app.listen(port, () => {
    console.log(`Reely server running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
