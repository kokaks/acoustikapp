import { useEffect, useRef, useState } from "react";
import type { ProductResult } from "../api/client";
import { api } from "../api/client";

export function AddProduct() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [selected, setSelected] = useState<ProductResult | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchProducts(query.trim());
        setResults(res.results);
      } catch {
        // a failed search shouldn't crash the screen — just show nothing
        setResults([]);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 1800);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function selectProduct(p: ProductResult) {
    setSelected(p);
    setQuantity(1);
    setResults([]);
    setQuery("");
  }

  async function confirmAdd() {
    if (!selected) return;
    setAdding(true);
    try {
      await api.addToList(selected.id, quantity);
      setToast(`Added ${selected.name} ×${quantity}`);
      setSelected(null);
      setQuantity(1);
      inputRef.current?.focus();
    } catch {
      setToast("Couldn't add that — try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="screen add-screen">
      <header className="add-header">
        <h1>What just sold?</h1>
      </header>

      {!selected && (
        <>
          <input
            ref={inputRef}
            autoFocus
            className="search-input"
            placeholder="Search by name, brand, or model…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="result-list">
              {results.map((r) => (
                <li key={r.id}>
                  <button className="result-item" onClick={() => selectProduct(r)}>
                    <span className="result-name">{r.name}</span>
                    {r.brand && <span className="result-brand">{r.brand}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selected && (
        <div className="confirm-card">
          <div className="confirm-name">{selected.name}</div>
          <div className="qty-row">
            <button
              className="qty-btn"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="qty-value">{quantity}</span>
            <button
              className="qty-btn"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmAdd} disabled={adding}>
              {adding ? "Adding…" : "Add to warehouse list"}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
