import cors from "cors";
import express, { Request, Response } from "express";
import "express-async-errors";
import { configFromHeaders, runWithConfig } from "./config";
import { closeDb } from "./db";
import focusRoutes from "./routes/focus";
import githubRoutes from "./routes/github";
import jiraRoutes from "./routes/jira";
import kanbanRoutes from "./routes/kanban";
import filtersRoutes from "./routes/filters";
import jiraFiltersRoutes from "./routes/jiraFilters";
import notesRoutes from "./routes/notes";
import teamsRoutes from "./routes/teams";
import teamsJiraRoutes from "./routes/teamsJira";
import { errorHandler } from "./utils/errors";
import { version } from "../package.json";

export function createServer() {
  const app = express();

  // CORS — allow Vite dev server and Electron app origins
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (Electron, curl, etc.)
        if (!origin) return callback(null, true);

        if (
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.startsWith("file://") ||
          origin === "app://-"
        ) {
          return callback(null, true);
        }

        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );

  // JSON body parser
  app.use(express.json());

  // Bind the caller's credentials (sent as headers) to this request's async context.
  app.use((req, _res, next) => {
    runWithConfig(configFromHeaders((name) => req.header(name)), next);
  });

  // Routes
  app.use("/api/jira", jiraRoutes);
  app.use("/api/github", githubRoutes);
  app.use("/api/focus", focusRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/kanban", kanbanRoutes);
  app.use("/api/filters", filtersRoutes);
  app.use("/api/jira-filters", jiraFiltersRoutes);
  app.use("/api/teams", teamsRoutes);
  app.use("/api/teams-jira", teamsJiraRoutes);

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version, timestamp: new Date().toISOString() });
  });

  // Error handling middleware — catches thrown errors from async routes
  app.use(errorHandler);

  return app;
}

export function startServer() {
  const app = createServer();
  const PORT = parseInt(process.env.VITE_API_PORT || "3571", 10);

  const server = app.listen(PORT, () => {
    console.log(`[dev-home] server listening on http://localhost:${PORT}`);
  });

  return server;
}

// Graceful shutdown — close SQLite connection
process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
