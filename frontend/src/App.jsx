// App.jsx — Root component: auth gate + role-based page routing

import { useState, useEffect } from "react";
import { globalCss } from "./tokens";
import { api } from "./api";

import AuthPage        from "./pages/auth/AuthPage";
import Sidebar         from "./components/Sidebar";

// Student pages
import PortfolioPage   from "./pages/student/PortfolioPage";
import TracerStudyPage from "./pages/student/TracerStudyPage";

// Admin pages
import DashboardPage   from "./pages/admin/DashboardPage";
import SkillTrendsPage from "./pages/admin/SkillTrendsPage";
import QuestionnairePage from "./pages/admin/QuestionnairePage";
import GraduatesPage   from "./pages/admin/GraduatesPage";

// Google Fonts
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";
document.head.appendChild(fontLink);

export default function App() {
  const [user, setUser]       = useState(null);
  const [healthy, setHealthy] = useState(null);
  const [page, setPage]       = useState(null);   // null = auto-detect from role
  const [booting, setBooting] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem("tracer_user");
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setUser(u);
        setPage(defaultPage(u.role));
      } catch (_) {
        localStorage.removeItem("tracer_user");
        localStorage.removeItem("tracer_token");
      }
    }
    api.health()
      .then(h => setHealthy(h.status === "ok"))
      .catch(() => setHealthy(false))
      .finally(() => setBooting(false));
  }, []);

  function defaultPage(role) {
    return role === "admin" ? "dashboard" : "portfolio";
  }

  function handleLogin(userData) {
    setUser(userData);
    setPage(defaultPage(userData.role));
    localStorage.setItem("tracer_user", JSON.stringify(userData));
  }

  function handleLogout() {
    setUser(null);
    setPage(null);
    localStorage.removeItem("tracer_token");
    localStorage.removeItem("tracer_user");
  }

  if (booting) return (
    <>
      <style>{globalCss}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      </div>
    </>
  );

  if (!user) return (
    <>
      <style>{globalCss}</style>
      <AuthPage onLogin={handleLogin} />
    </>
  );

  function renderPage() {
    if (user.role === "student") {
      if (page === "portfolio")  return <PortfolioPage user={user} />;
      if (page === "tracer")     return <TracerStudyPage user={user} />;
    }
    if (user.role === "admin") {
      if (page === "dashboard")    return <DashboardPage />;
      if (page === "skill-trends") return <SkillTrendsPage />;
      if (page === "questionnaire")return <QuestionnairePage />;
      if (page === "graduates")    return <GraduatesPage />;
    }
    return <div className="empty">Page not found.</div>;
  }

  return (
    <>
      <style>{globalCss}</style>
      <div className="app">
        <Sidebar
          page={page}
          setPage={setPage}
          user={user}
          healthy={healthy}
          onLogout={handleLogout}
        />
        <main className="main">
          {healthy === false && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              ⚠ Cannot reach API at <b>localhost:8000</b>. Make sure the FastAPI server is running.
            </div>
          )}
          {renderPage()}
        </main>
      </div>
    </>
  );
}
