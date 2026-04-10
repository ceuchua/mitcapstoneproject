// components/Sidebar.jsx

import { T } from "../tokens";

const STUDENT_PAGES = [
  { id: "portfolio",    label: "My Portfolio", },
  { id: "tracer",       label: "Tracer Study", },
];

const ADMIN_PAGES = [
  { id: "dashboard",    label: "Dashboard",     },
  { id: "skill-trends", label: "Skill Trends",  },
  { id: "questionnaire",label: "Questionnaire", },
  { id: "graduates",    label: "Graduates",     },
];

// Super admin gets all admin pages + account management
const SUPER_ADMIN_PAGES = [
  { id: "dashboard",    label: "Dashboard",},
  { id: "skill-trends", label: "Skill Trends",},
  { id: "questionnaire",label: "Questionnaire",},
  { id: "graduates",    label: "Graduates",},
  { id: "divider",      label: "",},  // visual separator
  { id: "accounts",     label: "Account Management",},
];

const ROLE_LABEL = {
  admin:       "Administrator",
  super_admin: "Super Administrator",
  student:     "Student",
};

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
    text-transform: uppercase; color: #fff;
    padding: 0 22px; margin-bottom: 8px;
  }
  .sidebar-role.super { color: #f0c040; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 22px; cursor: pointer; color: rgba(255,255,255,0.55);
    font-size: 13px; font-weight: 500; transition: all .15s;
    border-left: 3px solid transparent; user-select: none;
  }
  .nav-item:hover { color: #fff; background: #0000; }
  .nav-item.active { color: #fff; border-left-color: ${T.accentSoft}; background: #0000; }
  .nav-item.super-active { color: #fff; border-left-color: #fff; background: rgba(240,192,64,0.12); }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .nav-divider { border-top: 1px solid rgba(255,255,255,0.08); margin: 8px 22px; }
  .sidebar-footer { margin-top: auto; padding: 20px 22px 0; border-top: 1px solid rgba(255,255,255,0.08); }
  .sidebar-user { color: rgba(255,255,255,.7); font-size: 12px; margin-bottom: 10px; }
  .sidebar-user strong { display: block; color: #fff; font-size: 13px; margin-bottom: 2px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .btn-signout { background: transparent; color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,0.08); }
  .btn-signout:hover { background: transparent; color: ${T.bg}; border: 1px solid ${T.bg}; }
`;

export default function Sidebar({ page, setPage, user, healthy, onLogout }) {
  const role = user?.role;

  const pages = role === "super_admin" ? SUPER_ADMIN_PAGES
    : role === "admin"   ? ADMIN_PAGES
    : STUDENT_PAGES;

  const isSuperAdmin = role === "super_admin";

  return (
    <>
      <style>{css}</style>
      <nav className="sidebar">
        <div className="sidebar-logo">
          Graduate<br />Tracer<br />System
        </div>

        <div className={`sidebar-role ${isSuperAdmin ? "super" : ""}`}>
          {isSuperAdmin && "⭐ "}{ROLE_LABEL[role] || role}
        </div>

        {pages.map(p => {
          if (p.id === "divider") return <div key="divider" className="nav-divider" />;
          const isActive = page === p.id;
          return (
            <div key={p.id}
              className={`nav-item ${isActive ? (isSuperAdmin && p.id === "accounts" ? "super-active" : "active") : ""}`}
              onClick={() => setPage(p.id)}>
              <span className="nav-icon">{p.icon}</span> {p.label}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user?.first_name} {user?.last_name}</strong>
            {user?.email}
          </div>
          <div style={{ fontSize: 11, color: "#fff", marginBottom: 10 }}>
            <span className="status-dot" style={{ background: healthy ? "#3ecf6b" : "#e05a5a" }} />
            {healthy ? "API Connected" : "API Offline"}
          </div>
          <button className="btn btn-signout btn-sm" onClick={onLogout}
            style={{width: "100%" }}>
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}
