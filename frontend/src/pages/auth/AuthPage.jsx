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
  const [fieldErrors, setFieldErrors] = useState({});

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    student_id: "", program: "", major: "",
    graduation_year: new Date().getFullYear(),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Validation ────────────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const NAME_RE  = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-\.]{2,}$/;
  const CUR_YEAR = new Date().getFullYear();

  function validate() {
    const errs = {};

    // ── Email (both modes) ──────────────────────────────────────────────────
    if (!form.email.trim()) {
      errs.email = "Email is required.";
    } else if (mode === "register" && !EMAIL_RE.test(form.email.trim())) {
      errs.email = "Enter a valid email address (e.g. juan@email.com).";
    }

    // ── Password (both modes) ───────────────────────────────────────────────
    if (!form.password) {
      errs.password = "Password is required.";
    } else if (mode === "register" && form.password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }

    // ── Registration-only fields ────────────────────────────────────────────
    if (mode === "register") {
      if (!form.first_name.trim()) {
        errs.first_name = "First name is required.";
      } else if (form.first_name.trim().length < 2) {
        errs.first_name = "First name must be at least 2 characters.";
      } else if (!NAME_RE.test(form.first_name.trim())) {
        errs.first_name = "First name should contain letters only.";
      }

      if (!form.last_name.trim()) {
        errs.last_name = "Last name is required.";
      } else if (form.last_name.trim().length < 2) {
        errs.last_name = "Last name must be at least 2 characters.";
      } else if (!NAME_RE.test(form.last_name.trim())) {
        errs.last_name = "Last name should contain letters only.";
      }

      if (!form.program.trim()) {
        errs.program = "Degree program is required.";
      } else if (form.program.trim().length < 3) {
        errs.program = "Please enter your full degree program name.";
      }

      const yr = Number(form.graduation_year);
      if (form.graduation_year && (isNaN(yr) || yr < 1950 || yr > CUR_YEAR + 1)) {
        errs.graduation_year = `Enter a valid graduation year between 1950 and ${CUR_YEAR + 1}.`;
      }

      if (form.student_id && form.student_id.trim().length > 0 && form.student_id.trim().length < 4) {
        errs.student_id = "Student ID seems too short. Please double-check.";
      }
    }

    return errs;
  }

  function FieldError({ field }) {
    if (!fieldErrors[field]) return null;
    return (
      <div style={{ fontSize:11, color:T.red, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
        <span>⚠</span> {fieldErrors[field]}
      </div>
    );
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true); setErr(null);
    try {
      let data;
      if (mode === "login") {
        data = await api.login({ email: form.email.trim(), password: form.password });
      } else {
        data = await api.register({
          ...form,
          email:           form.email.trim(),
          first_name:      form.first_name.trim(),
          last_name:       form.last_name.trim(),
          program:         form.program.trim(),
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
                    style={fieldErrors.first_name ? {borderColor:T.red} : {}}
                    onChange={e => { set("first_name", e.target.value); setFieldErrors(fe => ({...fe, first_name:null})); }} />
                  <FieldError field="first_name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="form-input" value={form.last_name}
                    style={fieldErrors.last_name ? {borderColor:T.red} : {}}
                    onChange={e => { set("last_name", e.target.value); setFieldErrors(fe => ({...fe, last_name:null})); }} />
                  <FieldError field="last_name" />
                </div>
              </div>

              <div className="section-divider">Academic Information</div>

              <div className="form-group">
                <label className="form-label">Degree Program *</label>
                <input className="form-input" placeholder="e.g. BS Computer Science"
                  style={fieldErrors.program ? {borderColor:T.red} : {}}
                  value={form.program}
                  onChange={e => { set("program", e.target.value); setFieldErrors(fe => ({...fe, program:null})); }} />
                <FieldError field="program" />
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
                    style={fieldErrors.student_id ? {borderColor:T.red} : {}}
                    onChange={e => { set("student_id", e.target.value); setFieldErrors(fe => ({...fe, student_id:null})); }} />
                  <FieldError field="student_id" />
                </div>
                <div className="form-group">
                  <label className="form-label">Graduation Year</label>
                  <input className="form-input" type="number" value={form.graduation_year}
                    style={fieldErrors.graduation_year ? {borderColor:T.red} : {}}
                    onChange={e => { set("graduation_year", e.target.value); setFieldErrors(fe => ({...fe, graduation_year:null})); }} />
                  <FieldError field="graduation_year" />
                </div>
              </div>

              <div className="section-divider">Account Credentials</div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email}
              style={fieldErrors.email ? {borderColor:T.red} : {}}
              onChange={e => { set("email", e.target.value); setFieldErrors(fe => ({...fe, email:null})); }} />
            <FieldError field="email" />
          </div>
          <div className="form-group">
            <label className="form-label">
              Password *
              {mode === "register" && (
                <span style={{color:T.inkMuted, fontWeight:400, marginLeft:4, fontSize:11}}>
                  (min. 8 characters)
                </span>
              )}
            </label>
            <input className="form-input" type="password" value={form.password}
              style={fieldErrors.password ? {borderColor:T.red} : {}}
              onChange={e => { set("password", e.target.value); setFieldErrors(fe => ({...fe, password:null})); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            <FieldError field="password" />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy
              ? <><div className="spinner" />{mode === "login" ? "Signing in…" : "Creating account…"}</>
              : mode === "login" ? "Sign In" : "Create Student Account"
            }
          </button>

          <div className="auth-switch">
            {mode === "login" ? (
              <>Don't have an account? <a onClick={() => { setMode("register"); setErr(null); setFieldErrors({}); }}>Register here</a></>
            ) : (
              <>Already have an account? <a onClick={() => { setMode("login"); setErr(null); setFieldErrors({}); }}>Sign in</a></>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
