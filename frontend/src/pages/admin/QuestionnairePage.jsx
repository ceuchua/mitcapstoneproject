// pages/admin/QuestionnairePage.jsx
// Admin can add, edit, delete, and reorder questionnaire questions

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { Spinner } from "../../components/UI";

const TYPES = ["text", "single_choice", "multi_choice", "scale", "number"];
const SECTIONS = ["Employment", "Skills", "Satisfaction", "Further Studies", "General"];

const BLANK_FORM = {
  section: "Employment", text: "", type: "single_choice",
  options: [{ id: "opt_a", label: "" }, { id: "opt_b", label: "" }],
  required: true, order: 0,
};

export default function QuestionnairePage() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null);  // question_id being edited
  const [creating, setCreating]   = useState(false);
  const [form, setForm]           = useState(BLANK_FORM);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState(null);
  const [success, setSuccess]     = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setQuestions(await api.getQuestions()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  function startEdit(q) {
    setEditing(q.question_id);
    setCreating(false);
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

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setErr(null);
    setSuccess(null);
    setForm({ ...BLANK_FORM, order: questions.length + 1 });
  }

  function cancelForm() {
    setEditing(null); setCreating(false); setErr(null);
  }

  async function saveQuestion() {
    if (!form.text.trim()) { setErr("Question text is required."); return; }
    setBusy(true); setErr(null);
    try {
      const hasOptions = ["single_choice", "multi_choice", "scale"].includes(form.type);
      const payload = {
        ...form,
        options: hasOptions ? form.options.filter(o => o.label.trim()) : null,
      };
      if (creating) {
        await api.createQuestion(payload);
        setSuccess("Question created.");
      } else {
        await api.updateQuestion(editing, payload);
        setSuccess("Question updated.");
      }
      cancelForm();
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function deleteQuestion(id) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      await api.deleteQuestion(id);
      await load();
      setSuccess("Question deleted.");
    } catch (e) { setErr(e.message); }
  }

  // Option helpers
  function addOption() {
    const id = `opt_${Date.now()}`;
    setForm(f => ({ ...f, options: [...(f.options || []), { id, label: "" }] }));
  }
  function removeOption(id) {
    setForm(f => ({ ...f, options: f.options.filter(o => o.id !== id) }));
  }
  function updateOption(id, label) {
    setForm(f => ({ ...f, options: f.options.map(o => o.id === id ? { ...o, label } : o) }));
  }

  const sections = [...new Set(questions.map(q => q.section))];
  const hasOptions = ["single_choice", "multi_choice", "scale"].includes(form.type);

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Questionnaire Editor</h1>
          <p className="page-sub">Configure the tracer study questions students will answer</p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>+ Add Question</button>
      </div>

      {err     && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Form panel */}
      {(creating || editing) && (
        <div className="card section fade-up" style={{ borderColor: T.accent }}>
          <div className="card-title">{creating ? "New Question" : "Edit Question"}</div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">Section</label>
              <select className="form-select" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}>
                {SECTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Question Type</label>
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group"><label className="form-label">Question Text *</label>
            <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder="Enter the question to ask graduates…" />
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">Order (position)</label>
              <input className="form-input" type="number" min={0} value={form.order}
                onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
                Required question
              </label>
            </div>
          </div>

          {/* Options editor */}
          {hasOptions && (
            <div className="form-group">
              <label className="form-label">Answer Options</label>
              {(form.options || []).map((opt, i) => (
                <div key={opt.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: T.inkMuted, fontSize: 12, lineHeight: "34px", minWidth: 20 }}>{i + 1}.</span>
                  <input className="form-input" value={opt.label}
                    onChange={e => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${i + 1}`} />
                  <button className="btn btn-danger btn-sm" onClick={() => removeOption(opt.id)}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addOption} style={{ marginTop: 4 }}>+ Add Option</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={saveQuestion} disabled={busy}>
              {busy ? <><div className="spinner" />Saving…</> : creating ? "Create Question" : "Save Changes"}
            </button>
            <button className="btn btn-secondary" onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Questions list */}
      {loading ? (
        <div className="empty"><Spinner dark /><div style={{ marginTop: 10 }}>Loading questions…</div></div>
      ) : questions.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">📋</div>
          No questions yet. Click <strong>Add Question</strong> to get started.
        </div>
      ) : (
        sections.map(section => (
          <div key={section} className="section">
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMuted, textTransform: "uppercase",
              letterSpacing: ".8px", marginBottom: 10 }}>{section}</div>
            {questions.filter(q => q.section === section).map(q => (
              <div key={q.question_id} className="card" style={{ marginBottom: 10, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <span className="pill pill-neutral">{q.type.replace("_", " ")}</span>
                      <span className="pill pill-neutral">#{q.order}</span>
                      {q.required && <span className="pill pill-gap">Required</span>}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: q.options ? 8 : 0 }}>{q.text}</div>
                    {q.options && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {q.options.map(opt => (
                          <span key={opt.id} style={{ fontSize: 11, background: T.bg, border: `1px solid ${T.border}`,
                            borderRadius: 4, padding: "2px 8px", color: T.inkMuted }}>{opt.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(q)}>✏ Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.question_id)}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
