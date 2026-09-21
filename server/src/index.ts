import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import rateLimit from "express-rate-limit";

import { authRouter } from "./routes/auth";
import { productsRouter } from "./routes/products";
import { replenishmentRouter } from "./routes/replenishment";
import { attachRealtime } from "./realtime";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "100kb" }));

// Generous but real limits: protects against runaway clients/bots without
// getting in the way of a busy shop floor.
app.use(
  "/api",
  rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false })
);
app.use(
  "/api/auth/login",
  rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/replenishment", replenishmentRouter);

// central error handler — never leak internals to the client
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const port = Number(process.env.PORT ?? 4000);
const httpServer = createServer(app);
attachRealtime(httpServer);

httpServer.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
