// pages/auth/AuthPage.jsx — Login + Register

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
    border-radius: 18px; padding: 40px; width: 100%; max-width: 420px;
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
  .role-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; }
  .role-btn {
    padding: 10px; border-radius: 8px; border: 1.5px solid ${T.border};
    background: ${T.bg}; cursor: pointer; font-family: 'DM Sans', sans-serif;
    font-size: 13px; font-weight: 600; color: ${T.inkMuted}; transition: all .15s; text-align: center;
  }
  .role-btn.active { border-color: ${T.accent}; background: ${T.accentSoft}; color: ${T.accent}; }
`;

export default function AuthPage({ onLogin }) {
  const [mode, setMode]   = useState("login");   // "login" | "register"
  const [role, setRole]   = useState("student");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    student_id: "", program: "", graduation_year: new Date().getFullYear(),
    sex: "", contact_number: "",
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
          role,
          graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
        });
      }
      localStorage.setItem("tracer_token", data.token);
      localStorage.setItem("tracer_user", JSON.stringify(data));
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
          <div className="auth-logo">Graduate <span>Tracer</span> System</div>
          <div className="auth-sub">
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </div>

          {err && <div className="alert alert-error">{err}</div>}

          {mode === "register" && (
            <>
              <div className="form-label" style={{ marginBottom: 8 }}>I am a:</div>
              <div className="role-toggle">
                <div className={`role-btn ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}>🎓 Student</div>
                <div className={`role-btn ${role === "admin" ? "active" : ""}`} onClick={() => setRole("admin")}>🏫 Administrator</div>
              </div>

              <div className="form-row">
                <div className="form-group"><label className="form-label">First Name *</label>
                  <input className="form-input" value={form.first_name} onChange={e => set("first_name", e.target.value)} />
                </div>
                <div className="form-group"><label className="form-label">Last Name *</label>
                  <input className="form-input" value={form.last_name} onChange={e => set("last_name", e.target.value)} />
                </div>
              </div>

              {role === "student" && (
                <>
                  <div className="form-group"><label className="form-label">Program / Degree *</label>
                    <input className="form-input" placeholder="e.g. BS Computer Science" value={form.program} onChange={e => set("program", e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Student ID</label>
                      <input className="form-input" value={form.student_id} onChange={e => set("student_id", e.target.value)} />
                    </div>
                    <div className="form-group"><label className="form-label">Graduation Year</label>
                      <input className="form-input" type="number" value={form.graduation_year} onChange={e => set("graduation_year", e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="form-group"><label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
          <div className="form-group"><label className="form-label">Password *</label>
            <input className="form-input" type="password" value={form.password} onChange={e => set("password", e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
            onClick={handleSubmit}
            disabled={busy || !form.email || !form.password || (mode === "register" && (!form.first_name || !form.last_name))}>
            {busy ? <><div className="spinner" />{mode === "login" ? "Signing in…" : "Creating account…"}</> :
              mode === "login" ? "Sign In" : "Create Account"}
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
