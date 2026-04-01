// components/Sidebar.jsx

import { T } from "../tokens";

const STUDENT_PAGES = [
  { id: "portfolio",    label: "My Portfolio",    icon: "👤" },
  { id: "tracer",       label: "Tracer Study",    icon: "📋" },
];

const ADMIN_PAGES = [
  { id: "dashboard",    label: "Dashboard",       icon: "◉" },
  { id: "skill-trends", label: "Skill Trends",    icon: "📈" },
  { id: "questionnaire",label: "Questionnaire",   icon: "📝" },
  { id: "graduates",    label: "Graduates",        icon: "🎓" },
];

const css = `
  .sidebar {
    width: 220px; min-width: 220px; background: ${T.sidebar};
    display: flex; flex-direction: column; padding: 28px 0;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .sidebar-logo {
    font-family: 'DM Serif Display', serif; font-size: 18px;
    color: #fff; padding: 0 22px 28px; line-height: 1.3;
    border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px;
  }
  .sidebar-logo span { color: ${T.accent}; }
  .sidebar-role {
    font-size: 10px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: ${T.accent};
    padding: 0 22px; margin-bottom: 8px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 22px; cursor: pointer; color: rgba(255,255,255,0.55);
    font-size: 13px; font-weight: 500; transition: all .15s;
    border-left: 3px solid transparent; user-select: none;
  }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .nav-item.active { color: #fff; border-left-color: ${T.accent}; background: rgba(200,82,10,0.12); }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .sidebar-footer { margin-top: auto; padding: 20px 22px 0; border-top: 1px solid rgba(255,255,255,0.08); }
  .sidebar-user { color: rgba(255,255,255,.7); font-size: 12px; margin-bottom: 10px; }
  .sidebar-user strong { display: block; color: #fff; font-size: 13px; margin-bottom: 2px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; }
`;

export default function Sidebar({ page, setPage, user, healthy, onLogout }) {
  const pages = user?.role === "admin" ? ADMIN_PAGES : STUDENT_PAGES;

  return (
    <>
      <style>{css}</style>
      <nav className="sidebar">
        <div className="sidebar-logo">
          Graduate<br /><span>Tracer</span><br />System
        </div>
        <div className="sidebar-role">{user?.role === "admin" ? "Administrator" : "Student"}</div>

        {pages.map(p => (
          <div key={p.id} className={`nav-item ${page === p.id ? "active" : ""}`} onClick={() => setPage(p.id)}>
            <span className="nav-icon">{p.icon}</span> {p.label}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user?.first_name} {user?.last_name}</strong>
            {user?.email}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginBottom: 10 }}>
            <span className="status-dot" style={{ background: healthy ? "#3ecf6b" : "#e05a5a" }} />
            {healthy ? "API Connected" : "API Offline"}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}
            style={{ color: "rgba(255,255,255,.5)", borderColor: "rgba(255,255,255,.15)", width: "100%" }}>
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}
