// pages/student/TracerStudyPage.jsx
// Dynamic questionnaire driven by admin-configured questions

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { Spinner } from "../../components/UI";

export default function TracerStudyPage({ user, onNavigate, onTracerComplete }) {
  const [questions, setQuestions] = useState([]);
  const [existing, setExisting]   = useState(null);   // prior submission
  const [answers, setAnswers]     = useState({});
  const [busy, setBusy]           = useState(false);
  const [loading, setLoading]     = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr]             = useState(null);

  // Group questions by section
  const sections = questions.reduce((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [qs, existing] = await Promise.allSettled([
          api.getQuestions(),
          api.getMyResponse(),
        ]);
        if (qs.status === "fulfilled") setQuestions(qs.value);
        if (existing.status === "fulfilled") {
          setExisting(existing.value);
          setAnswers(existing.value.answers || {});
        }
      } finally { setLoading(false); }
    }
    load();
  }, []);

  function setAnswer(qid, value) {
    setAnswers(a => ({ ...a, [qid]: value }));
  }

  async function handleSubmit() {
    // Check required questions
    const missing = questions.filter(q => q.required && !answers[q.question_id]);
    if (missing.length > 0) {
      setErr(`Please answer all required questions: ${missing.map(q => q.text.slice(0, 40)).join(", ")}`);
      return;
    }
    setBusy(true); setErr(null);
    try {
      await api.submitResponse({ user_id: user.user_id, answers });
      setSubmitted(true);
      if (onTracerComplete) onTracerComplete();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return (
    <div className="fade-up" style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Spinner dark />
    </div>
  );

  if (submitted) return (
    <div className="fade-up">
      <div className="card" style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ marginBottom: 8 }}>Thank you!</h2>
        <p style={{ color: T.inkMuted, fontSize: 13, lineHeight: 1.7, marginBottom: 28 }}>
          Your tracer study response has been submitted. The system has automatically run
          a skills-gap analysis on your employment data. Your portfolio and skill
          recommendations are now unlocked.
        </p>
        <button className="btn btn-primary" style={{ fontSize: 14, padding: "10px 28px" }}
          onClick={() => onNavigate && onNavigate("portfolio")}>
          View My Portfolio →
        </button>
      </div>
    </div>
  );

  return (
    <div className="fade-up">
      <h1 className="page-title">Tracer Study</h1>
      <p className="page-sub">
        {existing ? "You have already submitted a response. You may update it below." : "Please answer all required questions honestly. Your responses help improve the university's programs."}
      </p>

      {existing && (
        <div className="alert alert-success" style={{ marginBottom: 20 }}>
          ✓ You submitted a response on {new Date(existing.created_at).toLocaleDateString()}. Resubmitting will replace it.
        </div>
      )}

      {err && <div className="alert alert-error">{err}</div>}

      {Object.entries(sections).map(([section, qs]) => (
        <div key={section} className="card section">
          <div className="card-title">{section}</div>
          {qs.map(q => (
            <QuestionField key={q.question_id} question={q} value={answers[q.question_id]} onChange={v => setAnswer(q.question_id, v)} />
          ))}
        </div>
      ))}

      {questions.length === 0 && (
        <div className="empty card">
          <div className="empty-icon"></div>
          No questions have been configured yet. Please check back later.
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? <><div className="spinner" />Submitting…</> : existing ? "Update Response" : "Submit Response"}
          </button>
          <span style={{ fontSize: 12, color: T.inkMuted }}>
            ⚡ Skills analysis runs automatically on submission
          </span>
        </div>
      )}
    </div>
  );
}

// ── Individual question renderer ──────────────────────────────────────────────

function QuestionField({ question: q, value, onChange }) {
  const req = q.required;

  const labelEl = (
    <label className="form-label" style={{ marginBottom: 8 }}>
      {q.text} {req && <span style={{ color: T.red }}>*</span>}
    </label>
  );

  if (q.type === "text") return (
    <div className="form-group">
      {labelEl}
      <textarea className="form-textarea" style={{ minHeight: 70 }} value={value || ""}
        onChange={e => onChange(e.target.value)} placeholder="Your answer…" />
    </div>
  );

  if (q.type === "number") return (
    <div className="form-group">
      {labelEl}
      <input className="form-input" type="number" min={0} value={value || ""}
        onChange={e => onChange(e.target.value)} style={{ maxWidth: 160 }} />
    </div>
  );

  if (q.type === "single_choice") return (
    <div className="form-group">
      {labelEl}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {q.options?.map(opt => (
          <div key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              border: `1.5px solid ${value === opt.id ? T.accent : T.border}`,
              background: value === opt.id ? T.accentSoft : T.bg,
              color: value === opt.id ? T.accent : T.ink,
              fontSize: 13, fontWeight: value === opt.id ? 600 : 400,
              transition: "all .15s",
            }}>
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  if (q.type === "multi_choice") return (
    <div className="form-group">
      {labelEl}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {q.options?.map(opt => {
          const selected = Array.isArray(value) && value.includes(opt.id);
          return (
            <div key={opt.id} onClick={() => {
              const arr = Array.isArray(value) ? value : [];
              onChange(selected ? arr.filter(x => x !== opt.id) : [...arr, opt.id]);
            }}
              style={{
                padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                border: `1.5px solid ${selected ? T.accent : T.border}`,
                background: selected ? T.accentSoft : T.bg,
                color: selected ? T.accent : T.ink,
                fontSize: 13, fontWeight: selected ? 600 : 400,
                transition: "all .15s",
              }}>
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (q.type === "scale") return (
    <div className="form-group">
      {labelEl}
      <div style={{ display: "flex", gap: 8 }}>
        {q.options?.map(opt => (
          <div key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              width: 44, height: 44, borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1.5px solid ${value === opt.id ? T.accent : T.border}`,
              background: value === opt.id ? T.accent : T.bg,
              color: value === opt.id ? "#fff" : T.ink,
              fontWeight: 600, fontSize: 14, transition: "all .15s",
            }}>
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}
