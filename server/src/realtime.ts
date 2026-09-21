import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { Client } from "pg";

/**
 * Real-time sync strategy:
 * Postgres triggers (see db/migrations/0002) fire pg_notify on every
 * replenishment_items insert/update/delete. A single dedicated LISTEN
 * connection picks these up and rebroadcasts them to every connected
 * WebSocket client. This works correctly even if the backend later scales
 * to multiple instances (each instance LISTENs independently and
 * rebroadcasts to its own clients) — no in-memory-only pub/sub to outgrow.
 */
export function attachRealtime(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  function broadcast(message: unknown) {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "connected" }));
  });

  const listenClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
  });

  listenClient.connect().then(() => {
    listenClient.query("listen replenishment_changes");
    // eslint-disable-next-line no-console
    console.log("Realtime: listening on replenishment_changes");
  });

  listenClient.on("notification", (msg) => {
    if (!msg.payload) return;
    try {
      const parsed = JSON.parse(msg.payload);
      broadcast({ type: "replenishment_changed", ...parsed });
    } catch {
      // ignore malformed payloads
    }
  });

  listenClient.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("Postgres LISTEN connection error:", err);
  });

  return { broadcast };
}
