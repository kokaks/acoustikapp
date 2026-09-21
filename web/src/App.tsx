import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { AddProduct } from "./pages/AddProduct";
import { Warehouse } from "./pages/Warehouse";
import { History } from "./pages/History";
import { NavBar } from "./components/NavBar";
import type { ReactNode } from "react";

function ProtectedLayout({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  if (!employee) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <NavBar />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/add"
        element={
          <ProtectedLayout>
            <AddProduct />
          </ProtectedLayout>
        }
      />
      <Route
        path="/warehouse"
        element={
          <ProtectedLayout>
            <Warehouse />
          </ProtectedLayout>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedLayout>
            <History />
          </ProtectedLayout>
        }
      />
      <Route path="*" element={<Navigate to="/add" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
