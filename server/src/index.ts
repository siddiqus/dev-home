import dotenv from 'dotenv';
import path from 'path';

// Load the shared .env from the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { validateEnv } from './config';
import jiraRoutes from './routes/jira';
import githubRoutes from './routes/github';
import configRoutes from './routes/config';

export function createServer() {
  const app = express();

  // CORS — allow Vite dev server and Electron app origins
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (Electron, curl, etc.)
        if (!origin) return callback(null, true);

        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith('file://') ||
          origin === 'app://-'
        ) {
          return callback(null, true);
        }

        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    })
  );

  // JSON body parser
  app.use(express.json());

  // Routes
  app.use('/api/jira', jiraRoutes);
  app.use('/api/github', githubRoutes);
  app.use('/api/config', configRoutes);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

export function startServer() {
  // Validate env vars
  const missingVars = validateEnv();
  if (missingVars.length > 0) {
    console.warn(
      `\n⚠  WARNING: Missing environment variables: ${missingVars.join(', ')}`
    );
    console.warn(
      '   Copy .env.example to .env and fill in the required values.\n'
    );
  }

  const app = createServer();
  const PORT = parseInt(process.env.VITE_API_PORT || '3001', 10);

  const server = app.listen(PORT, () => {
    console.log(`[dev-home] server listening on http://localhost:${PORT}`);
  });

  return server;
}

// Run directly (e.g. `tsx server/src/index.ts` or `yarn dev:server`)
if (require.main === module) {
  startServer();
}
