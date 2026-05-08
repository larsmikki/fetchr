import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { config } from './config.js';
import collectionsRouter from './routes/collections.js';
import videosRouter from './routes/videos.js';
import settingsRouter from './routes/settings.js';
import dataRouter from './routes/data.js';
import browseRouter from './routes/browse.js';

export function createApp() {
  const app = express();

  app.use(compression({
    filter: (req, res) => {
      // Never compress video streams — it breaks byte-range delivery
      if (req.path.includes('/stream')) return false;
      return compression.filter(req, res);
    },
  }));
  if (config.nodeEnv !== 'test') app.use(morgan('dev'));
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // API routes
  app.use('/api/collections', collectionsRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/browse', browseRouter);

  // Serve client build in production
  if (config.nodeEnv === 'production') {
    app.use(express.static(config.clientDistDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.clientDistDir, 'index.html'));
    });
  }

  return app;
}
