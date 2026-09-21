import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Employee } from "../api/client";
import { getEmployee, setSession, clearSession, api } from "../api/client";

type AuthContextValue = {
  employee: Employee | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(getEmployee());

  async function login(username: string, password: string) {
    const res = await api.login(username, password);
    setSession(res.token, res.employee);
    setEmployee(res.employee);
  }

  function logout() {
    clearSession();
    setEmployee(null);
  }

  return <AuthContext.Provider value={{ employee, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
