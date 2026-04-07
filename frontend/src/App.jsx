// App.jsx — Auth gate + inactivity session management + routing

import { useState, useEffect, useRef, useCallback } from "react";
import { globalCss, T } from "./tokens";
import { api, setUnauthorizedHandler } from "./api";

import AuthPage          from "./pages/auth/AuthPage";
import Sidebar           from "./components/Sidebar";
import PortfolioPage     from "./pages/student/PortfolioPage";
import TracerStudyPage   from "./pages/student/TracerStudyPage";
import DashboardPage     from "./pages/admin/DashboardPage";
import SkillTrendsPage   from "./pages/admin/SkillTrendsPage";
import QuestionnairePage from "./pages/admin/QuestionnairePage";
import GraduatesPage     from "./pages/admin/GraduatesPage";
import AccountsPage    from "./pages/superadmin/AccountsPage";

// Google Fonts
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";
document.head.appendChild(fontLink);

// ── Session config (must match backend SESSION_TIMEOUT_MINUTES) ───────────────
const INACTIVITY_MS     = 30 * 60 * 1000;  // 30 minutes
const WARNING_BEFORE_MS =  2 * 60 * 1000;  // warn 2 min before expiry
const CHECK_INTERVAL_MS = 15 * 1000;        // check every 15 s

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

const KEYS = {
  token:      "tracer_token",
  user:       "tracer_user",
  lastActive: "tracer_last_active",
};

// ── Session warning modal ─────────────────────────────────────────────────────
const warningCss = `
  .session-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(26,23,20,.55); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
  }
  .session-modal {
    background: ${T.surface}; border: 1px solid ${T.border};
    border-radius: 16px; padding: 36px 40px; max-width: 400px; width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,.18); text-align: center;
  }
  .session-modal h3 { font-family:'DM Serif Display',serif; font-size:22px; margin-bottom:10px; }
  .session-modal p  { color:${T.inkMuted}; font-size:13px; line-height:1.7; margin-bottom:24px; }
  .session-countdown { font-family:'DM Serif Display',serif; font-size:40px; color:${T.accent}; margin-bottom:20px; }
  .session-btns { display:flex; gap:10px; justify-content:center; }
  .session-expired-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
    background: ${T.red}; color: #fff; text-align: center;
    padding: 10px 16px; font-size: 13px; font-weight: 600;
  }
`;

function SessionWarning({ secondsLeft, onStay, onLogout }) {
  const mins    = Math.floor(secondsLeft / 60);
  const secs    = secondsLeft % 60;
  const display = mins > 0 ? `${mins}:${String(secs).padStart(2,"0")}` : `${secs}s`;
  return (
    <div className="session-overlay">
      <div className="session-modal fade-up">
        <div style={{ fontSize:36, marginBottom:12 }}>⏱</div>
        <h3>Still there?</h3>
        <p>Your session will expire due to inactivity in:</p>
        <div className="session-countdown">{display}</div>
        <p>Click <strong>Stay Logged In</strong> to continue, or you'll be signed out automatically.</p>
        <div className="session-btns">
          <button className="btn btn-primary"   onClick={onStay}>Stay Logged In</button>
          <button className="btn btn-secondary" onClick={onLogout}>Sign Out Now</button>
        </div>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,        setUser]        = useState(null);
  const [healthy,     setHealthy]     = useState(null);
  const [page,        setPage]        = useState(null);
  const [booting,     setBooting]     = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown,   setCountdown]   = useState(0);
  const [expiredMsg,  setExpiredMsg]  = useState(false);

  const checkRef     = useRef(null);
  const cdRef        = useRef(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const defaultPage = (role) => (role === "admin" || role === "super_admin") ? "dashboard" : "portfolio";

  const stampActivity = () =>
    localStorage.setItem(KEYS.lastActive, Date.now().toString());

  const getLastActive = () =>
    parseInt(localStorage.getItem(KEYS.lastActive) || "0", 10);

  const msUntilExpiry = () =>
    Math.max(0, INACTIVITY_MS - (Date.now() - getLastActive()));

  const clearLocalSession = () => {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.user);
    localStorage.removeItem(KEYS.lastActive);
  };

  // ── Logout ────────────────────────────────────────────────────────────────────
  // reason: "manual" | "expired" | "server"
  // "server" = 401 from backend (token invalidated by server restart)

  const handleLogout = useCallback(async (reason = "manual") => {
    clearInterval(checkRef.current);
    clearInterval(cdRef.current);

    // Best-effort server-side invalidation (may fail if server is down)
    try { await api.logout(); } catch (_) {}

    clearLocalSession();
    setUser(null);
    setPage(null);
    setShowWarning(false);

    if (reason === "expired" || reason === "server") {
      setExpiredMsg(true);
      setTimeout(() => setExpiredMsg(false), 5000);
    }
  }, []);

  // ── Register global 401 handler ───────────────────────────────────────────────
  // Any API call that returns 401 (including after server restart) triggers this.

  useEffect(() => {
    setUnauthorizedHandler((reason) => handleLogout(reason || "server"));
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  // ── Stay logged in ────────────────────────────────────────────────────────────

  const handleStayLoggedIn = () => {
    stampActivity();
    setShowWarning(false);
    clearInterval(cdRef.current);
  };

  // ── Session check loop ────────────────────────────────────────────────────────

  const startSessionCheck = useCallback(() => {
    clearInterval(checkRef.current);
    checkRef.current = setInterval(() => {
      const remaining = msUntilExpiry();

      if (remaining <= 0) {
        clearInterval(checkRef.current);
        clearInterval(cdRef.current);
        handleLogout("expired");
        return;
      }

      if (remaining <= WARNING_BEFORE_MS) {
        setShowWarning(prev => {
          if (prev) return prev; // already showing
          // Start countdown
          let secs = Math.ceil(remaining / 1000);
          setCountdown(secs);
          clearInterval(cdRef.current);
          cdRef.current = setInterval(() => {
            secs -= 1;
            setCountdown(secs);
            if (secs <= 0) {
              clearInterval(cdRef.current);
              handleLogout("expired");
            }
          }, 1000);
          return true;
        });
      }
    }, CHECK_INTERVAL_MS);
  }, [handleLogout]);

  // ── Activity listeners ────────────────────────────────────────────────────────

  const handleActivity = useCallback(() => {
    if (!user) return;
    stampActivity();
    if (showWarning) {
      setShowWarning(false);
      clearInterval(cdRef.current);
    }
  }, [user, showWarning]);

  // ── Mount: restore + validate session ─────────────────────────────────────────
  // Three-step process:
  //   1. Check localStorage — if no saved user, go straight to login
  //   2. Check local expiry — if stale, clear and go to login
  //   3. Validate token with backend (GET /api/users/me) — handles server restart

  useEffect(() => {
    async function restoreSession() {
      const savedUser  = localStorage.getItem(KEYS.user);
      const lastActive = getLastActive();

      // Step 1: nothing saved
      if (!savedUser) {
        setBooting(false);
        api.health().then(h => setHealthy(h.status === "ok")).catch(() => setHealthy(false));
        return;
      }

      // Step 2: locally expired
      const locallyExpired = lastActive > 0 && (Date.now() - lastActive) > INACTIVITY_MS;
      if (locallyExpired) {
        clearLocalSession();
        setBooting(false);
        api.health().then(h => setHealthy(h.status === "ok")).catch(() => setHealthy(false));
        return;
      }

      // Step 3: validate against backend
      // If the server restarted, GET /api/users/me returns 401.
      // The global 401 handler fires → handleLogout("server") → clears session.
      // We temporarily suppress the handler here so we can control the flow ourselves.
      try {
        await api.getMe(); // will throw on 401

        // Token is valid — restore the session
        const u = JSON.parse(savedUser);
        setUser(u);
        setPage(defaultPage(u.role));
        stampActivity();
      } catch (e) {
        // 401 or parse error — clear session
        clearLocalSession();
        setUser(null);
        setPage(null);
      }

      api.health().then(h => setHealthy(h.status === "ok")).catch(() => setHealthy(false));
      setBooting(false);
    }

    restoreSession();
  }, []);

  // ── Start/stop session monitoring ─────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      clearInterval(checkRef.current);
      clearInterval(cdRef.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
      return;
    }
    stampActivity();
    startSessionCheck();
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      clearInterval(checkRef.current);
      clearInterval(cdRef.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [user, handleActivity, startSessionCheck]);

  // ── Login ─────────────────────────────────────────────────────────────────────

  function handleLogin(userData) {
    setUser(userData);
    setPage(defaultPage(userData.role));
    setExpiredMsg(false);
    localStorage.setItem(KEYS.token, userData.token);
    localStorage.setItem(KEYS.user,  JSON.stringify(userData));
    stampActivity();
  }

  // ── Page renderer ─────────────────────────────────────────────────────────────

  function renderPage() {
    if (user?.role === "student") {
      if (page === "portfolio") return <PortfolioPage user={user} />;
      if (page === "tracer")    return <TracerStudyPage user={user} />;
    }
    if (user?.role === "admin") {
      if (page === "dashboard")     return <DashboardPage />;
      if (page === "skill-trends")  return <SkillTrendsPage />;
      if (page === "questionnaire") return <QuestionnairePage />;
      if (page === "graduates")     return <GraduatesPage />;
    }
    if (user?.role === "super_admin") {
      if (page === "dashboard")     return <DashboardPage />;
      if (page === "skill-trends")  return <SkillTrendsPage />;
      if (page === "questionnaire") return <QuestionnairePage />;
      if (page === "graduates")     return <GraduatesPage />;
      if (page === "accounts")      return <AccountsPage currentUser={user} />;
    }
    return <div className="empty">Page not found.</div>;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (booting) return (
    <>
      <style>{globalCss}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
        <div className="spinner spinner-dark" style={{ width:32, height:32 }} />
      </div>
    </>
  );

  if (!user) return (
    <>
      <style>{globalCss}</style>
      <style>{warningCss}</style>
      {expiredMsg && (
        <div className="session-expired-banner">
          Your session has expired. Please sign in again.
        </div>
      )}
      <AuthPage onLogin={handleLogin} />
    </>
  );

  return (
    <>
      <style>{globalCss}</style>
      <style>{warningCss}</style>

      {showWarning && (
        <SessionWarning
          secondsLeft={countdown}
          onStay={handleStayLoggedIn}
          onLogout={() => handleLogout("manual")}
        />
      )}

      <div className="app">
        <Sidebar
          page={page}
          setPage={setPage}
          user={user}
          healthy={healthy}
          onLogout={() => handleLogout("manual")}
        />
        <main className="main">
          {healthy === false && (
            <div className="alert alert-error" style={{ marginBottom:20 }}>
              ⚠ Cannot reach API at <b>localhost:8000</b>. Make sure the FastAPI server is running.
            </div>
          )}
          {renderPage()}
        </main>
      </div>
    </>
  );
}
