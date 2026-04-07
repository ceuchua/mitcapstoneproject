// pages/admin/QuestionnairePage.jsx
// Questionnaire editor designed for non-technical admins

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { Spinner } from "../../components/UI";

// ── Question type definitions — plain English for admins ──────────────────────
const QUESTION_TYPES = [
  {
    id:          "text",
    label:       "Open Text",
    description: "Student types a free-form written answer",
    example:     "e.g. \"Briefly describe your job responsibilities\"",
  },
  {
    id:          "single_choice",
    label:       "Single Choice",
    description: "Student picks exactly one option from a list",
    example:     "e.g. \"Employed / Unemployed / Further Studies\"",
  },
  {
    id:          "multi_choice",
    label:       "Multiple Choice",
    description: "Student can select several options at once",
    example:     "e.g. \"Which skills do you use? (select all that apply)\"",
  },
  {
    id:          "scale",
    label:       "Rating Scale",
    description: "Student rates something on a numbered scale (e.g. 1–5)",
    example:     "e.g. \"How satisfied are you? (1 = Very low, 5 = Very high)\"",
  },
  {
    id:          "number",
    label:       "Number",
    description: "Student enters a whole number",
    example:     "e.g. \"How many months until you found a job?\"",
  },
];

const SECTIONS = ["Employment", "Skills", "Satisfaction", "Further Studies", "General"];

const BLANK_FORM = {
  section:  "Employment",
  text:     "",
  type:     "single_choice",
  options:  [{ id: "opt_a", label: "" }, { id: "opt_b", label: "" }],
  required: true,
};

// ── Answer preview — shows what students will actually see ────────────────────
function AnswerPreview({ type, options }) {
  const previewStyle = {
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    marginTop: 12,
    fontSize: 13,
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: T.inkMuted,
    textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8,
  };

  if (type === "text") return (
    <div style={previewStyle}>
      <div style={labelStyle}>Student will see:</div>
      <div style={{ background: "#fff", border: `1px solid ${T.border}`,
        borderRadius: 6, padding: "8px 10px", color: T.inkMuted, fontSize: 12,
        minHeight: 52, fontStyle: "italic" }}>
        Student types their answer here…
      </div>
    </div>
  );

  if (type === "number") return (
    <div style={previewStyle}>
      <div style={labelStyle}>Student will see:</div>
      <input readOnly value=""
        style={{ background: "#fff", border: `1px solid ${T.border}`,
          borderRadius: 6, padding: "8px 10px", width: 120, fontSize: 13 }}
        placeholder="0" />
    </div>
  );

  if (type === "scale") {
    const scaleOptions = options?.length >= 2 ? options : [
      {id:"1",label:"1"},{id:"2",label:"2"},{id:"3",label:"3"},
      {id:"4",label:"4"},{id:"5",label:"5"},
    ];
    return (
      <div style={previewStyle}>
        <div style={labelStyle}>Student will see:</div>
        <div style={{ display: "flex", gap: 8 }}>
          {scaleOptions.map(opt => (
            <div key={opt.id} style={{ width: 40, height: 40, borderRadius: 8,
              border: `1.5px solid ${T.border}`, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 600, background: "#fff", color: T.inkMuted }}>
              {opt.label || opt.id}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "single_choice" || type === "multi_choice") {
    const filled = (options || []).filter(o => o.label.trim());
    if (!filled.length) return (
      <div style={previewStyle}>
        <div style={labelStyle}>Student will see:</div>
        <div style={{ color: T.inkMuted, fontSize: 12, fontStyle: "italic" }}>
          Add options below to see a preview.
        </div>
      </div>
    );
    return (
      <div style={previewStyle}>
        <div style={labelStyle}>Student will see:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {filled.map((opt, i) => (
            <div key={opt.id} style={{
              padding: "7px 14px", borderRadius: 8,
              border: `1.5px solid ${i === 0 ? T.accent : T.border}`,
              background: i === 0 ? T.accentSoft : "#fff",
              color: i === 0 ? T.accent : T.ink,
              fontSize: 13, fontWeight: i === 0 ? 600 : 400,
            }}>
              {opt.label}
            </div>
          ))}
        </div>
        {type === "multi_choice" && (
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 8 }}>
            Students can select multiple options.
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function QuestionnairePage() {
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [mode,      setMode]      = useState("list");   // "list" | "create" | "edit"
  const [editingQ,  setEditingQ]  = useState(null);
  const [form,      setForm]      = useState(BLANK_FORM);
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState(null);
  const [success,   setSuccess]   = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setQuestions(await api.getQuestions()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  function openCreate() {
    setMode("create");
    setEditingQ(null);
    setErr(null);
    setSuccess(null);
    setForm({ ...BLANK_FORM, order: questions.length + 1 });
  }

  function openEdit(q) {
    setMode("edit");
    setEditingQ(q);
    setErr(null);
    setSuccess(null);
    setForm({
      section:  q.section,
      text:     q.text,
      type:     q.type,
      options:  q.options ? [...q.options] : [],
      required: q.required,
      order:    q.order,
    });
  }

  function closeForm() {
    setMode("list");
    setEditingQ(null);
    setErr(null);
  }

  async function saveQuestion() {
    if (!form.text.trim()) { setErr("Please enter the question text."); return; }
    setBusy(true); setErr(null);
    try {
      const hasOptions = ["single_choice", "multi_choice", "scale"].includes(form.type);
      const payload = {
        ...form,
        options: hasOptions ? form.options.filter(o => o.label.trim()) : null,
      };
      if (mode === "create") {
        await api.createQuestion(payload);
        setSuccess("Question added successfully.");
      } else {
        await api.updateQuestion(editingQ.question_id, payload);
        setSuccess("Question saved.");
      }
      closeForm();
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function deleteQuestion(q) {
    if (q.protected) {
      setErr(`This question is locked because the system uses it for data analysis. You can edit its text but not delete it.`);
      return;
    }
    if (!window.confirm(`Delete "${q.text.slice(0, 60)}"? This cannot be undone.`)) return;
    try {
      await api.deleteQuestion(q.question_id);
      setSuccess("Question deleted.");
      await load();
    } catch (e) { setErr(e.message); }
  }

  // Option helpers
  async function toggleQuestion(q) {
    try {
      await api.toggleQuestion(q.question_id);
      const action = q.enabled === false ? "enabled" : "disabled";
      setSuccess(`Question ${action} successfully.${q.enabled !== false ? " It will no longer appear in the tracer study." : ""}`);
      await load();
    } catch (e) { setErr(e.message); }
  }

  const addOption    = () => setForm(f => ({ ...f, options: [...(f.options||[]), { id:`opt_${Date.now()}`, label:"" }] }));
  const removeOption = (id) => setForm(f => ({ ...f, options: f.options.filter(o => o.id !== id) }));
  const updateOption = (id, label) => setForm(f => ({ ...f, options: f.options.map(o => o.id === id ? {...o,label} : o) }));

  const sections    = [...new Set(questions.map(q => q.section))];
  const hasOptions  = ["single_choice", "multi_choice", "scale"].includes(form.type);
  const selectedTypeDef = QUESTION_TYPES.find(t => t.id === form.type);
  const isProtected = editingQ?.protected;

  // ── List view ──────────────────────────────────────────────────────────────
  if (mode === "list") return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 className="page-title">Tracer Study Questions</h1>
          <p className="page-sub">Manage the questions students answer in the tracer study</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Question</button>
      </div>

      {err     && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Legend */}
      <div className="card section" style={{ padding:"14px 18px" }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:16, fontSize:12, color:T.inkMuted }}>
          <span>🔒 <strong>Locked questions</strong> — text can be edited but cannot be deleted (used by analytics)</span>
          <span>🔴 <strong>Required</strong> — students must answer before submitting</span>
        </div>
      </div>

      {loading ? (
        <div className="empty"><Spinner dark /><div style={{ marginTop:10 }}>Loading…</div></div>
      ) : questions.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon"></div>
          No questions yet. Click <strong>Add Question</strong> to get started.
        </div>
      ) : (
        sections.map(section => (
          <div key={section} className="section">
            <div style={{ fontSize:12, fontWeight:700, color:T.inkMuted,
              textTransform:"uppercase", letterSpacing:".8px", marginBottom:10 }}>
              {section}
            </div>

            {questions.filter(q => q.section === section).map((q, idx) => {
              const typeDef = QUESTION_TYPES.find(t => t.id === q.type);
              return (
                <div key={q.question_id} className="card"
                  style={{ marginBottom:10, padding:"14px 18px",
                    opacity: q.enabled === false ? 0.55 : 1,
                    borderLeft: q.protected ? `3px solid ${T.yellow}` : q.enabled === false ? `3px solid ${T.border}` : `3px solid transparent` }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", gap:12 }}>
                    <div style={{ flex:1 }}>
                      {/* Tags row */}
                      <div style={{ display:"flex", gap:6, marginBottom:7, flexWrap:"wrap", alignItems:"center" }}>
                        {q.protected && (
                          <span style={{ fontSize:12, color:T.yellow, fontWeight:600 }}>
                            🔒 Locked
                          </span>
                        )}
                        <span className="pill pill-neutral" style={{ fontSize:11 }}>
                          {typeDef?.icon} {typeDef?.label || q.type}
                        </span>
                        {q.enabled === false && (
                          <span className="pill" style={{ fontSize:11, background:"#EDE9E3", color:T.inkMuted }}>
                            Hidden from students
                          </span>
                        )}
                        {q.required && (
                          <span className="pill pill-gap" style={{ fontSize:11 }}>Required</span>
                        )}
                      </div>

                      {/* Question text */}
                      <div style={{ fontWeight:500, fontSize:14, marginBottom: q.options ? 8 : 0 }}>
                        {q.text}
                      </div>

                      {/* Options preview */}
                      {q.options && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                          {q.options.map(opt => (
                            <span key={opt.id} style={{ fontSize:11, background:T.bg,
                              border:`1px solid ${T.border}`, borderRadius:4,
                              padding:"2px 8px", color:T.inkMuted }}>
                              {opt.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
                      {/* Enable/Disable toggle */}
                      <button
                        className={`btn btn-sm ${q.enabled === false ? "btn-secondary" : "btn-secondary"}`}
                        onClick={() => toggleQuestion(q)}
                        title={q.enabled === false ? "Question is hidden from students — click to show" : "Question is visible to students — click to hide"}
                        style={{
                          background: q.enabled === false ? "#EDE9E3" : T.greenSoft,
                          color:      q.enabled === false ? T.inkMuted  : T.green,
                          border:     `1px solid ${q.enabled === false ? T.border : "#b8e0cc"}`,
                          minWidth:   64,
                        }}>
                        {q.enabled === false ? "⊘ Off" : "✓ On"}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(q)}>
                        ✏ Edit
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => deleteQuestion(q)}
                        disabled={q.protected}
                        style={q.protected ? { opacity:.3, cursor:"not-allowed" } : {}}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );

  // ── Create / Edit form ─────────────────────────────────────────────────────
  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={closeForm}
            style={{ marginBottom:8 }}>
            ← Back to questions
          </button>
          <h1 className="page-title" style={{ marginBottom:2 }}>
            {mode === "create" ? "Add New Question" : "Edit Question"}
          </h1>
          <p className="page-sub" style={{ marginBottom:0 }}>
            {mode === "create"
              ? "Create a new question for the tracer study"
              : `Editing: "${editingQ?.text?.slice(0, 60)}${editingQ?.text?.length > 60 ? "…" : ""}"`
            }
          </p>
        </div>
      </div>

      {err     && <div className="alert alert-error">{err}</div>}

      {/* Protected warning */}
      {isProtected && (
        <div className="alert" style={{ background:T.yellowSoft, color:T.yellow,
          border:`1px solid #e8d5a0`, marginBottom:20 }}>
          🔒 <strong>Locked question.</strong> You can change the question text and answer options,
          but the question type and section cannot be changed because the system relies on this
          question for data analysis.
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>

        {/* ── Left: Form ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Section */}
          <div className="card">
            <div className="card-title" style={{ fontSize:15 }}>Question Settings</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Section</label>
                <select className="form-select" value={form.section}
                  disabled={isProtected}
                  onChange={e => setForm(f => ({...f, section: e.target.value}))}>
                  {SECTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
                <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>
                  Groups this question with others under the same heading in the form.
                </div>
              </div>
              <div className="form-group" style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:22 }}>
                <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                  padding:"9px 12px", borderRadius:8, border:`1.5px solid ${form.required ? T.accent : T.border}`,
                  background: form.required ? T.accentSoft : T.bg, transition:"all .15s" }}>
                  <input type="checkbox" checked={form.required}
                    onChange={e => setForm(f => ({...f, required: e.target.checked}))} />
                  <span style={{ fontSize:13, fontWeight:600, color: form.required ? T.accent : T.inkMuted }}>
                    Required question
                  </span>
                </label>
                <div style={{ fontSize:11, color:T.inkMuted, paddingLeft:2 }}>
                  Students must answer this before they can submit.
                </div>
              </div>
            </div>
          </div>

          {/* Question text */}
          <div className="card">
            <div className="card-title" style={{ fontSize:15 }}>Question Text</div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <textarea className="form-textarea"
                style={{ minHeight:80, fontSize:14 }}
                value={form.text}
                onChange={e => setForm(f => ({...f, text: e.target.value}))}
                placeholder="Type your question here, e.g. &quot;What is your current job title?&quot;" />
              <div style={{ fontSize:11, color:T.inkMuted, marginTop:6 }}>
                Write it as if you're speaking directly to the student.
              </div>
            </div>
          </div>

          {/* Answer type picker */}
          <div className="card">
            <div className="card-title" style={{ fontSize:15 }}>Answer Type</div>
            {isProtected ? (
              <div style={{ padding:"10px 12px", background:T.bg, borderRadius:8,
                border:`1px solid ${T.border}`, fontSize:13 }}>
                {selectedTypeDef?.icon} <strong>{selectedTypeDef?.label}</strong>
                <span style={{ color:T.inkMuted, marginLeft:8 }}>— locked for this question</span>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {QUESTION_TYPES.map(t => (
                  <label key={t.id} style={{
                    display:"flex", alignItems:"flex-start", gap:12, padding:"10px 12px",
                    borderRadius:8, cursor:"pointer",
                    border:`1.5px solid ${form.type === t.id ? T.accent : T.border}`,
                    background: form.type === t.id ? T.accentSoft : T.bg,
                    transition:"all .15s",
                  }}>
                    <input type="radio" name="qtype" value={t.id}
                      checked={form.type === t.id}
                      onChange={() => setForm(f => ({...f, type: t.id,
                        options: (["single_choice","multi_choice"].includes(t.id) && !f.options?.length)
                          ? [{id:"opt_a",label:""},{id:"opt_b",label:""}]
                          : f.options
                      }))} />
                    <div>
                      <div style={{ fontWeight:600, fontSize:13,
                        color: form.type === t.id ? T.accent : T.ink }}>
                        {t.icon} {t.label}
                      </div>
                      <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>
                        {t.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Options editor — only for choice types */}
          {hasOptions && (
            <div className="card">
              <div className="card-title" style={{ fontSize:15 }}>
                Answer Options
                {form.type === "scale" && (
                  <span style={{ fontSize:12, fontWeight:400, color:T.inkMuted, marginLeft:8 }}>
                    — these are the scale values students can choose
                  </span>
                )}
              </div>
              {(form.options || []).map((opt, i) => (
                <div key={opt.id} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
                  <span style={{ color:T.inkMuted, fontSize:12, minWidth:20,
                    fontWeight:600 }}>{i + 1}.</span>
                  <input className="form-input" value={opt.label}
                    onChange={e => updateOption(opt.id, e.target.value)}
                    placeholder={form.type === "scale" ? `Value ${i+1} (e.g. "${i+1}")` : `Option ${i+1} text`} />
                  {(form.options||[]).length > 2 && (
                    <button className="btn btn-danger btn-sm"
                      onClick={() => removeOption(opt.id)}
                      style={{ flexShrink:0 }}>✕</button>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addOption}
                style={{ marginTop:4 }}>
                + Add {form.type === "scale" ? "value" : "option"}
              </button>
            </div>
          )}

          {/* Save buttons */}
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-primary" onClick={saveQuestion} disabled={busy}>
              {busy
                ? <><div className="spinner" />Saving…</>
                : mode === "create" ? "Add Question" : "Save Changes"
              }
            </button>
            <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
          </div>
        </div>

        {/* ── Right: Live preview ── */}
        <div style={{ position:"sticky", top:24 }}>
          <div className="card">
            <div className="card-title" style={{ fontSize:15 }}>👁 Student Preview</div>
            <p style={{ fontSize:12, color:T.inkMuted, marginBottom:16 }}>
              This is what students will see when answering the tracer study.
            </p>

            <div style={{ padding:"16px", background:T.bg, borderRadius:10,
              border:`1px solid ${T.border}` }}>
              {/* Question text preview */}
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4, color:T.ink }}>
                {form.text || <span style={{ color:T.inkMuted, fontStyle:"italic" }}>Your question text will appear here…</span>}
                {form.required && <span style={{ color:T.red, marginLeft:4 }}>*</span>}
              </div>

              {/* Answer preview */}
              <AnswerPreview type={form.type} options={form.options} />
            </div>

            {/* Type hint */}
            {selectedTypeDef && (
              <div style={{ marginTop:14, padding:"10px 12px", background:T.accentSoft,
                borderRadius:8, fontSize:12, color:T.accent }}>
                <strong>{selectedTypeDef.icon}{selectedTypeDef.label}:</strong>{" "}
                {selectedTypeDef.example}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
