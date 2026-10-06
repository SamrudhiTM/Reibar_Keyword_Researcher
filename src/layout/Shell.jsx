import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { readStoredDomain } from "../lib/domain.js";

function KrLink({ to, children }) {
  const navigate = useNavigate();
  return (
    <NavLink
      className="nav-link nav-sub"
      to={to}
      onClick={(e) => {
        e.preventDefault();
        const id = readStoredDomain();
        navigate(id ? `${to}?domain_id=${encodeURIComponent(id)}` : to);
      }}
    >
      {children}
    </NavLink>
  );
}

export default function Shell() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RM</div>
          Reibar Marketing
        </div>
        <div className="nav-label">Marketing</div>
        <div className="nav-btn nav-parent">Keyword Researcher</div>
        <KrLink to="/research">Keyword Research</KrLink>
        <KrLink to="/library">Keyword Library</KrLink>
        <div className="side-foot">
          <div className="avatar">S</div>
          <div>
            <div>Local demo</div>
            <div className="muted">Keyword research</div>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
