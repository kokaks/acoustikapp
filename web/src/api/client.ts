const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setSession(token: string, employee: Employee) {
  localStorage.setItem("token", token);
  localStorage.setItem("employee", JSON.stringify(employee));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("employee");
}

export function getEmployee(): Employee | null {
  const raw = localStorage.getItem("employee");
  return raw ? JSON.parse(raw) : null;
}

export type Employee = { id: string; fullName: string; role: "employee" | "admin" };

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export type ProductResult = { id: string; name: string; brand: string | null };

export type ActiveItem = {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  quantity: number;
  firstRequestedAt: string;
  lastRequestedAt: string;
};

export type HistoryItem = {
  id: string;
  name: string;
  brand: string | null;
  quantity: number;
  completedAt: string;
  requestedBy: string | null;
  completedBy: string | null;
};

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; employee: Employee }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  searchProducts: (q: string) =>
    request<{ results: ProductResult[] }>(`/api/products/search?q=${encodeURIComponent(q)}`),

  addToList: (productId: string, quantity: number) =>
    request<{ id: string; totalQuantity: number }>("/api/replenishment/items", {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    }),

  getActive: () => request<{ items: ActiveItem[] }>("/api/replenishment/active"),

  complete: (itemId: string) =>
    request<{ id: string; status: string }>(`/api/replenishment/items/${itemId}/complete`, {
      method: "POST",
    }),

  getHistory: (before?: string) =>
    request<{ items: HistoryItem[] }>(
      `/api/replenishment/history${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
};
