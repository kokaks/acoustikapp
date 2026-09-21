import { useCallback, useEffect, useState } from "react";
import type { ActiveItem } from "../api/client";
import { api } from "../api/client";
import { useRealtime } from "../hooks/useRealtime";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function Warehouse() {
  const [items, setItems] = useState<ActiveItem[]>([]);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getActive();
      setItems(res.items);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime(refresh);

  async function markBrought(id: string) {
    setCompleting((s) => new Set(s).add(id));
    // optimistic removal — the item disappears immediately for this
    // employee; the realtime broadcast will confirm it for everyone else.
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.complete(id);
    } catch {
      // if it failed, bring it back and let the next refresh reconcile
      refresh();
    } finally {
      setCompleting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="screen warehouse-screen">
      <header className="warehouse-header">
        <h1>Bring from warehouse</h1>
        <span className="count-badge">{items.length}</span>
      </header>

      {loaded && items.length === 0 && (
        <div className="empty-state">
          <p>Nothing outstanding right now.</p>
        </div>
      )}

      <ul className="warehouse-list">
        {items.map((item) => (
          <li key={item.id} className="warehouse-item">
            <div className="warehouse-item-main">
              <div className="warehouse-item-name">{item.name}</div>
              <div className="warehouse-item-meta">
                {item.brand && <span>{item.brand}</span>}
                <span>Requested {timeAgo(item.lastRequestedAt)}</span>
              </div>
            </div>
            <div className="warehouse-item-qty">×{item.quantity}</div>
            <button
              className="brought-btn"
              onClick={() => markBrought(item.id)}
              disabled={completing.has(item.id)}
              aria-label={`Mark ${item.name} as brought`}
            >
              ✓
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
