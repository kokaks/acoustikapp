import { useEffect, useState } from "react";
import type { HistoryItem } from "../api/client";
import { api } from "../api/client";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .getHistory()
      .then((res) => setItems(res.items))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="screen history-screen">
      <header className="history-header">
        <h1>History</h1>
      </header>

      {loaded && items.length === 0 && (
        <div className="empty-state">
          <p>Nothing completed yet.</p>
        </div>
      )}

      <ul className="history-list">
        {items.map((item) => (
          <li key={item.id} className="history-item">
            <div className="history-item-main">
              <div className="history-item-name">
                {item.name} <span className="history-item-qty">×{item.quantity}</span>
              </div>
              <div className="history-item-meta">
                Brought by {item.completedBy ?? "—"} · {formatDateTime(item.completedAt)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
