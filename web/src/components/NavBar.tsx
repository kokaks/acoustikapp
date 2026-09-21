import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function NavBar() {
  const { logout, employee } = useAuth();

  return (
    <nav className="navbar">
      <NavLink to="/add" className={({ isActive }) => `nav-tab ${isActive ? "nav-tab-active" : ""}`}>
        Add
      </NavLink>
      <NavLink to="/warehouse" className={({ isActive }) => `nav-tab ${isActive ? "nav-tab-active" : ""}`}>
        Warehouse
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => `nav-tab ${isActive ? "nav-tab-active" : ""}`}>
        History
      </NavLink>
      <button
        className="nav-tab nav-logout"
        onClick={logout}
        aria-label={`Sign out (${employee?.fullName ?? ""})`}
      >
        Sign out
      </button>
    </nav>
  );
}
