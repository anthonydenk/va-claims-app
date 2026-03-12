/**
 * Vercel serverless function handler.
 * This exports the Express app as a request handler without starting a server.
 */
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";

const app = express();
const httpServer = createServer(app);

app.use(
  express.json({
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// Register routes (async, but esbuild handles top-level await)
await registerRoutes(httpServer, app);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Server error:", err);
  if (!res.headersSent) {
    res.status(status).json({ message });
  }
});

export default app;
