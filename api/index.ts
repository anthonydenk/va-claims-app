import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();

app.use(
  express.json({
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);

// Register all API routes
const init = registerRoutes(httpServer, app);

// Vercel handles the promise resolution before serving requests
export default app;
