import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);

// Register all API routes (async but Vercel handles top-level await)
await registerRoutes(httpServer, app);

export default app;
