import { useEffect, useRef } from "react";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws";

/**
 * Opens a WebSocket to the backend and calls onChange whenever the server
 * broadcasts a replenishment_changed event (from the Postgres NOTIFY
 * bridge). Auto-reconnects with backoff so a flaky shop-floor wifi
 * connection doesn't need a manual refresh.
 */
export function useRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closedByUs = false;
    let retryDelay = 1000;

    function connect() {
      socket = new WebSocket(WS_URL);
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "replenishment_changed") {
            onChangeRef.current();
          }
        } catch {
          // ignore malformed messages
        }
      };
      socket.onclose = () => {
        if (closedByUs) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
      socket.onopen = () => {
        retryDelay = 1000;
      };
    }

    connect();
    return () => {
      closedByUs = true;
      socket?.close();
    };
  }, []);
}
