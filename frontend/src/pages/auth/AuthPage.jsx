// pages/auth/AuthPage.jsx — Login + Student Registration only
// Admin accounts are created by the Super Administrator via Account Management.

import { useState } from "react";
import { api } from "../../api";
import { T } from "../../tokens";

const css = `
  .auth-wrap {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: ${T.bg};
  }
  .auth-box {
    background: ${T.surface}; border: 1px solid ${T.border};
    border-radius: 18px; padding: 40px; width: 100%; max-width: 440px;
    box-shadow: 0 4px 40px rgba(0,0,0,.06);
  }
  .auth-logo {
    font-family: 'DM Serif Display', serif; font-size: 22px;
    margin-bottom: 6px; color: ${T.ink};
  }
  .auth-logo span { color: ${T.accent}; }
  .auth-sub { color: ${T.inkMuted}; font-size: 13px; margin-bottom: 28px; }
  .auth-switch { text-align: center; margin-top: 18px; font-size: 13px; color: ${T.inkMuted}; }
  .auth-switch a { color: ${T.accent}; cursor: pointer; font-weight: 600; text-decoration: none; }
  .auth-switch a:hover { text-decoration: underline; }
  .section-divider {
    font-size: 11px; font-weight: 700; color: ${T.inkMuted}; text-transform: uppercase;
    letter-spacing: .8px; margin: 16px 0 12px; padding-bottom: 6px;
    border-bottom: 1px solid ${T.border};
  }
`;

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    student_id: "", program: "", major: "",
    graduation_year: new Date().getFullYear(),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    setBusy(true); setErr(null);
    try {
      let data;
      if (mode === "login") {
        data = await api.login({ email: form.email, password: form.password });
      } else {
        data = await api.register({
          ...form,
          role:            "student",
          graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
          major:           form.major.trim() || null,
        });
      }
      localStorage.setItem("tracer_token", data.token);
      localStorage.setItem("tracer_user",  JSON.stringify(data));
      onLogin(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{css}</style>
      <div className="auth-wrap">
        <div className="auth-box fade-up">
          <div className="auth-logo">Graduate Tracer System</div>
          <div className="auth-sub">
            {mode === "login" ? "Sign in to your account" : "Create a student account"}
          </div>

          {err && <div className="alert alert-error">{err}</div>}

          {mode === "register" && (
            <>
              <div className="section-divider">Personal Information</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input className="form-input" value={form.first_name}
                    onChange={e => set("first_name", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="form-input" value={form.last_name}
                    onChange={e => set("last_name", e.target.value)} />
                </div>
              </div>

              <div className="section-divider">Academic Information</div>

              <div className="form-group">
                <label className="form-label">Degree Program *</label>
                <input className="form-input" placeholder="e.g. BS Computer Science"
                  value={form.program} onChange={e => set("program", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Major / Specialization
                  <span style={{ color: T.inkMuted, fontWeight: 400, marginLeft: 4 }}>(optional)</span>
                </label>
                <input className="form-input"
                  placeholder="e.g. Data Science, Network Security…"
                  value={form.major} onChange={e => set("major", e.target.value)} />
                <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 4 }}>
                  Adding your specialization improves skill recommendations.
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Student ID</label>
                  <input className="form-input" value={form.student_id}
                    onChange={e => set("student_id", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Graduation Year</label>
                  <input className="form-input" type="number" value={form.graduation_year}
                    onChange={e => set("graduation_year", e.target.value)} />
                </div>
              </div>

              <div className="section-divider">Account Credentials</div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => set("email", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password *</label>
            <input className="form-input" type="password" value={form.password}
              onChange={e => set("password", e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleSubmit}
            disabled={
              busy ||
              !form.email ||
              !form.password ||
              (mode === "register" && (!form.first_name || !form.last_name || !form.program))
            }
          >
            {busy
              ? <><div className="spinner" />{mode === "login" ? "Signing in…" : "Creating account…"}</>
              : mode === "login" ? "Sign In" : "Create Student Account"
            }
          </button>

          <div className="auth-switch">
            {mode === "login" ? (
              <>Don't have an account? <a onClick={() => { setMode("register"); setErr(null); }}>Register here</a></>
            ) : (
              <>Already have an account? <a onClick={() => { setMode("login"); setErr(null); }}>Sign in</a></>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
