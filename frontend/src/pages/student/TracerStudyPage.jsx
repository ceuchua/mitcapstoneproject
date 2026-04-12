// pages/student/TracerStudyPage.jsx
// Dynamic questionnaire with CHED-standard conditional branching (skip logic)

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { Spinner } from "../../components/UI";

// ── CHED Branching Rules ──────────────────────────────────────────────────────
//
// Maps question_id → function(answers) → boolean
// If the function returns false, the question is hidden AND its stored
// answer is cleared so orphaned data never reaches the backend.
//
// Branch points from the official CHED GTS routing instructions:
//
//   Q16 (q_emp_status):
//     employed       → show Employment Data + First Job sections
//     unemployed /
//     never_employed → show q_unemployment_reason only, skip to Curriculum
//
//   Q22 (q_is_first_job):
//     yes → show q_stay_reason (why staying)
//     no  → show q_change_reason (why changing), skip q_stay_reason
//
//   Q24 (q_first_job_related):
//     yes → skip q_accept_reason
//     no  → show q_accept_reason
//
//   Q32 (q_curriculum_relevant):
//     yes → show q_competencies (useful college skills)
//     no  → skip q_competencies, go to q_curriculum_suggest

const VISIBILITY_RULES = {
  // ── Only visible when NOT employed ───────────────────────────────────────
  q_unemployment_reason: a =>
    a.q_emp_status === "unemployed" || a.q_emp_status === "never_employed",

  // ── Employment Data — only when employed ──────────────────────────────────
  q_emp_type:        a => a.q_emp_status === "employed",
  q_occupation:      a => a.q_emp_status === "employed",
  q_employer_name:   a => a.q_emp_status === "employed",
  q_employer_sector: a => a.q_emp_status === "employed",
  q_work_location:   a => a.q_emp_status === "employed",

  // ── First Job — only when employed ───────────────────────────────────────
  q_is_first_job:       a => a.q_emp_status === "employed",
  q_first_job_related:  a => a.q_emp_status === "employed",
  q_first_job_duration: a => a.q_emp_status === "employed",
  q_job_search_method:  a => a.q_emp_status === "employed",
  q_time_to_job:        a => a.q_emp_status === "employed",
  q_job_level_first:    a => a.q_emp_status === "employed",
  q_job_level:          a => a.q_emp_status === "employed",
  q_monthly_income:     a => a.q_emp_status === "employed",

  // ── Stay reason — only if this IS their first job ─────────────────────────
  q_stay_reason: a =>
    a.q_emp_status === "employed" && a.q_is_first_job === "yes",

  // ── Accept reason — only if first job NOT related to course ───────────────
  q_accept_reason: a =>
    a.q_emp_status === "employed" && a.q_first_job_related === "no",

  // ── Change reason — only if this is NOT their first job ──────────────────
  q_change_reason: a =>
    a.q_emp_status === "employed" && a.q_is_first_job === "no",

  // ── Curriculum Assessment — only when employed ────────────────────────────
  q_curriculum_relevant: a => a.q_emp_status === "employed",

  // ── Competencies — only if curriculum WAS relevant ────────────────────────
  q_competencies: a =>
    a.q_emp_status === "employed" && a.q_curriculum_relevant === "yes",

  // ── Training details — only if has_training = yes ─────────────────────────
  // Null answer treated as visible (backward compat for existing responses)
  q_training_title:      a => a.q_has_training !== "no",
  q_training_duration:   a => a.q_has_training !== "no",
  q_training_institution:a => a.q_has_training !== "no",
  q_advance_reason:      a => a.q_has_training !== "no",

  // ── Exam details — only if has_certifications = yes ──────────────────────
  // Null answer treated as visible (backward compat for existing responses)
  q_prof_exam_name:   a => a.q_has_certifications !== "no",
  q_prof_exam_date:   a => a.q_has_certifications !== "no",
  q_prof_exam_rating: a => a.q_has_certifications !== "no",
};

// Returns true if a question should be visible given the current answers.
// Questions with no rule are always visible.
function isVisible(questionId, answers) {
  const rule = VISIBILITY_RULES[questionId];
  return rule ? rule(answers) : true;
}

// When a branching answer changes, clear any answers for questions that
// are now hidden — prevents orphaned data reaching the backend.
const DEPENDENT_QUESTIONS = {
  q_emp_status: [
    "q_unemployment_reason",
    "q_emp_type", "q_occupation", "q_employer_name",
    "q_employer_sector", "q_work_location",
    "q_is_first_job", "q_stay_reason", "q_first_job_related",
    "q_accept_reason", "q_change_reason", "q_first_job_duration",
    "q_job_search_method", "q_time_to_job", "q_job_level_first",
    "q_job_level", "q_monthly_income",
    "q_curriculum_relevant", "q_competencies",
  ],
  q_is_first_job:      ["q_stay_reason", "q_change_reason"],
  q_first_job_related: ["q_accept_reason"],
  q_curriculum_relevant: ["q_competencies"],
  q_has_training:      ["q_training_title", "q_training_duration",
                         "q_training_institution", "q_advance_reason"],
  q_has_certifications:["q_prof_exam_name", "q_prof_exam_date", "q_prof_exam_rating"],
};


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TracerStudyPage({ user, onNavigate, onTracerComplete }) {
  const [questions, setQuestions] = useState([]);
  const [existing,  setExisting]  = useState(null);
  const [answers,   setAnswers]   = useState({});
  const [busy,      setBusy]      = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [err,       setErr]       = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [qs, ex] = await Promise.allSettled([
          api.getQuestions(),
          api.getMyResponse(),
        ]);
        if (qs.status === "fulfilled") setQuestions(qs.value);
        if (ex.status === "fulfilled") {
          setExisting(ex.value);
          setAnswers(ex.value.answers || {});
        }
      } finally { setLoading(false); }
    }
    load();
  }, []);

  // Set an answer and cascade-clear any dependent hidden questions
  function setAnswer(qid, value) {
    setAnswers(prev => {
      const next = { ...prev, [qid]: value };

      // If this question controls others, clear answers for any that are
      // now hidden under the new answer value
      const deps = DEPENDENT_QUESTIONS[qid] || [];
      for (const dep of deps) {
        const rule = VISIBILITY_RULES[dep];
        if (rule && !rule(next)) {
          delete next[dep];
        }
      }
      return next;
    });
  }

  async function handleSubmit() {
    // Only validate required questions that are currently visible
    const visibleRequired = questions.filter(
      q => q.required && isVisible(q.question_id, answers) && !answers[q.question_id]
    );
    if (visibleRequired.length > 0) {
      setErr(
        `Please answer all required questions: ${
          visibleRequired.map(q => q.text.slice(0, 40)).join(", ")
        }`
      );
      return;
    }

    // Strip answers for hidden questions before submitting
    const cleanAnswers = {};
    for (const q of questions) {
      if (isVisible(q.question_id, answers) && answers[q.question_id] != null) {
        cleanAnswers[q.question_id] = answers[q.question_id];
      }
    }

    setBusy(true); setErr(null);
    try {
      await api.submitResponse({ user_id: user.user_id, answers: cleanAnswers });
      setSubmitted(true);
      if (onTracerComplete) onTracerComplete();
    } catch (e) { setErr(e.message); }
    finally    { setBusy(false); }
  }

  if (loading) return (
    <div className="fade-up" style={{ display:"flex", justifyContent:"center", padding:60 }}>
      <Spinner dark />
    </div>
  );

  if (submitted) return (
    <div className="fade-up">
      <div className="card" style={{ maxWidth:560, margin:"60px auto", textAlign:"center", padding:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <h2 style={{ marginBottom:8 }}>Thank you!</h2>
        <p style={{ color:T.inkMuted, fontSize:13, lineHeight:1.7, marginBottom:28 }}>
          Your tracer study response has been submitted. The system has automatically run
          a skills-gap analysis on your employment data. Your portfolio and skill
          recommendations are now unlocked.
        </p>
        <button className="btn btn-primary" style={{ fontSize:14, padding:"10px 28px" }}
          onClick={() => onNavigate && onNavigate("portfolio")}>
          View My Portfolio →
        </button>
      </div>
    </div>
  );

  // Group questions by section, then filter by visibility within each section
  const sections = {};
  for (const q of questions) {
    if (!sections[q.section]) sections[q.section] = [];
    sections[q.section].push(q);
  }

  // Count total visible questions for progress display
  const allVisible  = questions.filter(q => isVisible(q.question_id, answers));
  const allAnswered = allVisible.filter(q => {
    const a = answers[q.question_id];
    return a != null && a !== "" && !(Array.isArray(a) && a.length === 0);
  });
  const progressPct = allVisible.length
    ? Math.round((allAnswered.length / allVisible.length) * 100)
    : 0;

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:4, flexWrap:"wrap", gap:8 }}>
        <h1 className="page-title">Tracer Study</h1>
        <span style={{ fontSize:12, color:T.inkMuted, paddingTop:8 }}>
          {allAnswered.length} of {allVisible.length} questions answered
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background:T.border, borderRadius:20, height:6,
        overflow:"hidden", marginBottom:16 }}>
        <div style={{
          width:`${progressPct}%`, height:"100%",
          background: progressPct === 100 ? T.green : T.accent,
          borderRadius:20, transition:"width .4s ease",
        }} />
      </div>

      <p className="page-sub">
        {existing
          ? "You have already submitted a response. You may update it below."
          : "Please answer all required questions honestly. Your responses help improve the university's programs."}
      </p>

      {existing && (
        <div className="alert alert-success" style={{ marginBottom:20 }}>
          ✓ You submitted a response on {new Date(existing.created_at).toLocaleDateString()}.
          Resubmitting will replace it.
        </div>
      )}

      {err && <div className="alert alert-error">{err}</div>}

      {Object.entries(sections).map(([section, qs]) => {
        // Only render the section card if at least one question in it is visible
        const visibleQs = qs.filter(q => isVisible(q.question_id, answers));
        if (visibleQs.length === 0) return null;

        return (
          <div key={section} className="card section">
            <div className="card-title">{section}</div>
            {visibleQs.map(q => (
              <QuestionField
                key={q.question_id}
                question={q}
                value={answers[q.question_id]}
                onChange={v => setAnswer(q.question_id, v)}
              />
            ))}
          </div>
        );
      })}

      {questions.length === 0 && (
        <div className="empty card">
          <div className="empty-icon"></div>
          No questions have been configured yet. Please check back later.
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ display:"flex", gap:12, alignItems:"center", marginTop:8 }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy
              ? <><div className="spinner" />Submitting…</>
              : existing ? "Update Response" : "Submit Response"}
          </button>
          <span style={{ fontSize:12, color:T.inkMuted }}>
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
    <label className="form-label" style={{ marginBottom:8 }}>
      {q.text} {req && <span style={{ color:T.red }}>*</span>}
    </label>
  );

  if (q.type === "text") return (
    <div className="form-group">
      {labelEl}
      <textarea className="form-textarea" style={{ minHeight:70 }} value={value || ""}
        onChange={e => onChange(e.target.value)} placeholder="Your answer…" />
    </div>
  );

  // Full date picker (YYYY-MM-DD) — used for q_birthday
  if (q.type === "date") return (
    <div className="form-group">
      {labelEl}
      <input className="form-input" type="date" value={value || ""}
        onChange={e => onChange(e.target.value)}
        style={{ maxWidth:220 }} />
    </div>
  );

  // Month + year picker (YYYY-MM) — used for q_prof_exam_date
  if (q.type === "month") return (
    <div className="form-group">
      {labelEl}
      <input className="form-input" type="month" value={value || ""}
        onChange={e => onChange(e.target.value)}
        style={{ maxWidth:220 }} />
      <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>
        Select the month and year only.
      </div>
    </div>
  );

  if (q.type === "number") return (
    <div className="form-group">
      {labelEl}
      <input className="form-input" type="number" min={0} value={value || ""}
        onChange={e => onChange(e.target.value)} style={{ maxWidth:160 }} />
    </div>
  );

  if (q.type === "single_choice") return (
    <div className="form-group">
      {labelEl}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {q.options?.map(opt => (
          <div key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              padding:"8px 16px", borderRadius:8, cursor:"pointer",
              border:`1.5px solid ${value === opt.id ? T.accent : T.border}`,
              background: value === opt.id ? T.accentSoft : T.bg,
              color:      value === opt.id ? T.accent : T.ink,
              fontSize:13, fontWeight: value === opt.id ? 600 : 400,
              transition:"all .15s",
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
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {q.options?.map(opt => {
          const selected = Array.isArray(value) && value.includes(opt.id);
          return (
            <div key={opt.id} onClick={() => {
              const arr = Array.isArray(value) ? value : [];
              onChange(selected ? arr.filter(x => x !== opt.id) : [...arr, opt.id]);
            }}
              style={{
                padding:"8px 16px", borderRadius:8, cursor:"pointer",
                border:`1.5px solid ${selected ? T.accent : T.border}`,
                background: selected ? T.accentSoft : T.bg,
                color:      selected ? T.accent : T.ink,
                fontSize:13, fontWeight: selected ? 600 : 400,
                transition:"all .15s",
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
      <div style={{ display:"flex", gap:8 }}>
        {q.options?.map(opt => (
          <div key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              width:44, height:44, borderRadius:8, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              border:`1.5px solid ${value === opt.id ? T.accent : T.border}`,
              background: value === opt.id ? T.accent : T.bg,
              color:      value === opt.id ? "#fff" : T.ink,
              fontWeight:600, fontSize:14, transition:"all .15s",
            }}>
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}
