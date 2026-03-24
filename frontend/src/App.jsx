import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie, Legend
} from "recharts";

// ─── Google Font import via style tag ────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";
document.head.appendChild(fontLink);

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:        "#F7F4EF",
  surface:   "#FFFFFF",
  border:    "#E4DDD3",
  ink:       "#1A1714",
  inkMuted:  "#7A7168",
  accent:    "#C8520A",   // burnt sienna
  accentSoft:"#F5E8DE",
  green:     "#2D7A4F",
  greenSoft: "#DFF0E8",
  red:       "#B53A2F",
  redSoft:   "#FAE5E3",
  yellow:    "#B07D1A",
  yellowSoft:"#FBF2DC",
};

// ─── CSS ─────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.ink}; font-family: 'DM Sans', sans-serif; font-size: 14px; }
  h1,h2,h3,h4 { font-family: 'DM Serif Display', serif; font-weight: 400; }

  .app { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    width: 220px; min-width: 220px; background: ${T.ink};
    display: flex; flex-direction: column; padding: 28px 0;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .sidebar-logo {
    font-family: 'DM Serif Display', serif; font-size: 18px;
    color: #fff; padding: 0 22px 28px; line-height: 1.3;
    border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px;
  }
  .sidebar-logo span { color: ${T.accent}; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 22px; cursor: pointer; color: rgba(255,255,255,0.55);
    font-size: 13px; font-weight: 500; transition: all .15s;
    border-left: 3px solid transparent; user-select: none;
  }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .nav-item.active { color: #fff; border-left-color: ${T.accent}; background: rgba(200,82,10,0.12); }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .sidebar-footer { margin-top: auto; padding: 20px 22px 0; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #3ecf6b; display: inline-block; margin-right: 6px; }

  /* Main content */
  .main { flex: 1; padding: 32px 36px; overflow-x: hidden; }
  .page-title { font-size: 28px; margin-bottom: 4px; }
  .page-sub { color: ${T.inkMuted}; margin-bottom: 28px; font-size: 13px; }

  /* Cards */
  .card {
    background: ${T.surface}; border: 1px solid ${T.border};
    border-radius: 14px; padding: 22px 24px;
  }
  .card-title { font-family: 'DM Serif Display', serif; font-size: 17px; margin-bottom: 16px; }

  /* Grid layouts */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

  /* Stat tiles */
  .stat-tile {
    background: ${T.surface}; border: 1px solid ${T.border};
    border-radius: 12px; padding: 18px 20px;
  }
  .stat-value { font-size: 32px; font-family: 'DM Serif Display', serif; line-height: 1; }
  .stat-label { font-size: 12px; color: ${T.inkMuted}; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }

  /* Form elements */
  .form-group { margin-bottom: 14px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: ${T.inkMuted}; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .5px; }
  .form-input, .form-select, .form-textarea {
    width: 100%; padding: 9px 12px; border: 1px solid ${T.border};
    border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px;
    background: ${T.bg}; color: ${T.ink}; transition: border-color .15s;
    outline: none;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: ${T.accent}; background: #fff; }
  .form-textarea { resize: vertical; min-height: 90px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

  /* Buttons */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 8px; font-size: 13px;
    font-weight: 600; cursor: pointer; border: none;
    font-family: 'DM Sans', sans-serif; transition: all .15s;
  }
  .btn-primary { background: ${T.accent}; color: #fff; }
  .btn-primary:hover { background: #a84208; }
  .btn-primary:disabled { background: #c9b8ae; cursor: not-allowed; }
  .btn-secondary { background: transparent; color: ${T.ink}; border: 1px solid ${T.border}; }
  .btn-secondary:hover { background: ${T.bg}; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid ${T.border}; margin-bottom: 22px; }
  .tab {
    padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer;
    color: ${T.inkMuted}; border-bottom: 2px solid transparent;
    margin-bottom: -1px; transition: all .15s; user-select: none;
  }
  .tab.active { color: ${T.accent}; border-bottom-color: ${T.accent}; }
  .tab:hover:not(.active) { color: ${T.ink}; }

  /* Tags / pills */
  .pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  }
  .pill-gap    { background: ${T.redSoft};    color: ${T.red}; }
  .pill-match  { background: ${T.greenSoft};  color: ${T.green}; }
  .pill-surplus{ background: ${T.yellowSoft}; color: ${T.yellow}; }
  .pill-topic  { background: ${T.accentSoft}; color: ${T.accent}; }
  .pill-neutral{ background: #EEEAE5; color: ${T.inkMuted}; }

  /* Score bar */
  .score-bar-wrap { background: #EDE9E3; border-radius: 20px; height: 8px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 20px; transition: width .6s cubic-bezier(.4,0,.2,1); }

  /* Table */
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; font-size: 11px; font-weight: 600; color: ${T.inkMuted}; text-transform: uppercase; letter-spacing: .5px; padding: 8px 12px; border-bottom: 1px solid ${T.border}; }
  .table td { padding: 11px 12px; border-bottom: 1px solid ${T.border}; vertical-align: middle; }
  .table tr:last-child td { border-bottom: none; }
  .table tr:hover td { background: ${T.bg}; }

  /* Alert */
  .alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
  .alert-error { background: ${T.redSoft}; color: ${T.red}; border: 1px solid #f5c6c3; }
  .alert-success { background: ${T.greenSoft}; color: ${T.green}; border: 1px solid #b8e0cc; }

  /* Divider */
  .divider { border: none; border-top: 1px solid ${T.border}; margin: 20px 0; }

  /* Empty state */
  .empty { text-align: center; padding: 40px; color: ${T.inkMuted}; }
  .empty-icon { font-size: 32px; margin-bottom: 8px; }

  /* Alignment meter */
  .align-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .align-label { font-family: 'DM Serif Display', serif; font-size: 22px; }

  /* Loading spinner */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }

  /* Fade in */
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
  .fade-up { animation: fadeUp .3s ease both; }

  /* Section spacing */
  .section { margin-bottom: 24px; }

  /* Responsive */
  @media (max-width: 900px) {
    .sidebar { display: none; }
    .grid-2, .grid-4, .grid-3 { grid-template-columns: 1fr; }
  }
`;

// ─── API helpers ──────────────────────────────────────────────────────────────
const API = "http://localhost:8000";
const get  = (path)       => fetch(API + path).then(r => r.json());
const post = (path, body) => fetch(API + path, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.detail || "Error"); return d; });

// ─── Color helpers ───────────────────────────────────────────────────────────
function alignColor(score) {
  if (score >= 0.6) return T.green;
  if (score >= 0.35) return T.yellow;
  return T.red;
}

// ─── Components ──────────────────────────────────────────────────────────────

function ScoreBar({ value, color }) {
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-fill" style={{ width: `${Math.round(value * 100)}%`, background: color || T.accent }} />
    </div>
  );
}

function AlignmentGauge({ score }) {
  const pct  = Math.round(score * 100);
  const color = alignColor(score);
  const r = 36, circ = 2 * Math.PI * r;
  const dash = circ * score;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#EDE9E3" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.4,0,.2,1)" }}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, fill: color }}>
          {pct}%
        </text>
      </svg>
      <span style={{ fontSize: 11, color: T.inkMuted, fontWeight: 600 }}>Alignment Score</span>
    </div>
  );
}

function SkillPillGroup({ skills, variant, label }) {
  if (!skills?.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="form-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {skills.map(s => <span key={s} className={`pill pill-${variant}`}>{s}</span>)}
      </div>
    </div>
  );
}

// ─── PAGE: DASHBOARD ─────────────────────────────────────────────────────────
function DashboardPage({ stats, loading }) {
  const statusData = Object.entries(stats.employment_status_counts || {})
    .map(([k, v]) => ({ name: k, value: v }));

  const gapData = (stats.top_gap_skills || []).slice(0, 8)
    .map(x => ({ skill: x.skill.length > 18 ? x.skill.slice(0, 16) + "…" : x.skill, count: x.count }));

  const alignData = Object.entries(stats.avg_alignment_by_program || {})
    .map(([prog, score]) => ({
      program: prog.replace(/^(bs|bachelor|bachelor of science in|ba)\s*/i, ""),
      score: Math.round(score * 100),
    }));

  const PIE_COLORS = [T.accent, T.green, T.yellow, T.red, "#7C5CBF"];

  return (
    <div className="fade-up">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Overview of graduate employment outcomes and skills analysis</p>

      <div className="grid-4 section">
        {[
          { label: "Total Graduates",    value: stats.total_graduates ?? 0,           icon: "🎓" },
          { label: "Employment Records", value: stats.total_employment_records ?? 0,   icon: "💼" },
          { label: "Employed Rate",      value: (() => {
            const c = stats.employment_status_counts || {};
            const total = Object.values(c).reduce((a, b) => a + b, 0);
            const emp = (c["Employed"] || 0) + (c["Self-employed"] || 0);
            return total ? Math.round((emp / total) * 100) + "%" : "—";
          })(), icon: "📈" },
          { label: "Avg Alignment",      value: (() => {
            const vals = Object.values(stats.avg_alignment_by_program || {});
            return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)+"%" : "—";
          })(), icon: "🎯" },
        ].map(s => (
          <div className="stat-tile" key={s.label}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 section">
        <div className="card">
          <div className="card-title">Employment Status</div>
          {statusData.length === 0
            ? <div className="empty"><div className="empty-icon">📊</div>No data yet</div>
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${Math.round(percent*100)}%`}>
                    {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
          }
        </div>

        <div className="card">
          <div className="card-title">Top Skills Gap</div>
          {gapData.length === 0
            ? <div className="empty"><div className="empty-icon">🔍</div>No gap data yet</div>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gapData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="skill" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={T.accent} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {alignData.length > 0 && (
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-title">Average Alignment by Program</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={alignData} margin={{ left: 0 }}>
                <XAxis dataKey="program" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => v + "%"} />
                <Tooltip formatter={v => v + "%"} />
                <Bar dataKey="score" radius={[4,4,0,0]}>
                  {alignData.map((d, i) => <Cell key={i} fill={alignColor(d.score / 100)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PAGE: GRADUATES ─────────────────────────────────────────────────────────
function GraduatesPage() {
  const [graduates, setGraduates] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState(null);
  const [form, setForm]           = useState({
    first_name: "", last_name: "", student_id: "", program: "",
    graduation_year: new Date().getFullYear(), email: "", sex: "", contact_number: "",
  });

  const load = useCallback(() => get("/api/graduates?limit=100").then(setGraduates), []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await post("/api/graduates", { ...form, graduation_year: Number(form.graduation_year) });
      setShowForm(false);
      setForm({ first_name:"", last_name:"", student_id:"", program:"", graduation_year: new Date().getFullYear(), email:"", sex:"", contact_number:"" });
      await load();
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Graduates</h1>
          <p className="page-sub">Register and manage graduate records</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? "✕ Cancel" : "+ Register Graduate"}
        </button>
      </div>

      {showForm && (
        <div className="card section fade-up">
          <div className="card-title">Register New Graduate</div>
          {err && <div className="alert alert-error">{err}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">First Name *</label><input className="form-input" value={form.first_name} onChange={e=>set("first_name",e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Last Name *</label><input className="form-input" value={form.last_name} onChange={e=>set("last_name",e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Student ID *</label><input className="form-input" value={form.student_id} onChange={e=>set("student_id",e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Graduation Year *</label><input className="form-input" type="number" value={form.graduation_year} onChange={e=>set("graduation_year",e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Program / Degree *</label>
            <input className="form-input" placeholder="e.g. BS Computer Science" value={form.program} onChange={e=>set("program",e.target.value)} />
          </div>
          <div className="form-row-3">
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e=>set("email",e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Sex</label>
              <select className="form-select" value={form.sex} onChange={e=>set("sex",e.target.value)}>
                <option value="">— Select —</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Contact No.</label><input className="form-input" value={form.contact_number} onChange={e=>set("contact_number",e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.first_name || !form.last_name || !form.student_id || !form.program}>
            {busy ? <><div className="spinner" />Saving…</> : "Save Graduate"}
          </button>
        </div>
      )}

      <div className="card">
        {graduates.length === 0
          ? <div className="empty"><div className="empty-icon">🎓</div>No graduates registered yet.</div>
          : <table className="table">
              <thead><tr>
                <th>Name</th><th>Student ID</th><th>Program</th><th>Batch Year</th><th>Sex</th>
              </tr></thead>
              <tbody>
                {graduates.map(g => (
                  <tr key={g.graduate_id}>
                    <td style={{ fontWeight: 500 }}>{g.last_name}, {g.first_name}</td>
                    <td style={{ color: T.inkMuted }}>{g.student_id}</td>
                    <td>{g.program}</td>
                    <td>{g.graduation_year}</td>
                    <td>{g.sex || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}

// ─── PAGE: EMPLOYMENT ─────────────────────────────────────────────────────────
function EmploymentPage() {
  const [records, setRecords]   = useState([]);
  const [graduates, setGrads]   = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState(null);
  const [selected, setSelected] = useState(null);

  const [form, setForm] = useState({
    graduate_id: "", employment_status: "Employed", employer_name: "",
    employer_address: "", employer_sector: "", job_title: "",
    job_description: "", job_skills_required: "", is_related_to_course: "",
    year_started: "", months_to_employment: "",
    further_studies_school: "", further_studies_program: "",
  });

  const loadAll = useCallback(async () => {
    const [r, g] = await Promise.all([get("/api/employment?limit=100"), get("/api/graduates?limit=200")]);
    setRecords(r); setGrads(g);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const gradMap = Object.fromEntries(graduates.map(g => [g.graduate_id, g]));

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const payload = {
        ...form,
        year_started: form.year_started ? Number(form.year_started) : null,
        months_to_employment: form.months_to_employment ? Number(form.months_to_employment) : null,
        is_related_to_course: form.is_related_to_course === "" ? null : form.is_related_to_course === "true",
      };
      await post("/api/employment", payload);
      setShowForm(false);
      await loadAll();
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const isEmployed = ["Employed", "Self-employed"].includes(form.employment_status);

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Employment Records</h1>
          <p className="page-sub">Submit and review graduate employment outcomes</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setSelected(null); }}>
          {showForm ? "✕ Cancel" : "+ Add Record"}
        </button>
      </div>

      {showForm && (
        <div className="card section fade-up">
          <div className="card-title">New Employment Record</div>
          {err && <div className="alert alert-error">{err}</div>}

          <div className="form-row">
            <div className="form-group"><label className="form-label">Graduate *</label>
              <select className="form-select" value={form.graduate_id} onChange={e=>set("graduate_id",e.target.value)}>
                <option value="">— Select graduate —</option>
                {graduates.map(g => <option key={g.graduate_id} value={g.graduate_id}>{g.last_name}, {g.first_name} ({g.program})</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Employment Status *</label>
              <select className="form-select" value={form.employment_status} onChange={e=>set("employment_status",e.target.value)}>
                <option>Employed</option><option>Self-employed</option>
                <option>Unemployed</option><option>Further Studies</option>
              </select>
            </div>
          </div>

          {isEmployed && (<>
            <hr className="divider" />
            <div style={{ color: T.inkMuted, fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>Employer & Job Info</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Employer Name</label><input className="form-input" value={form.employer_name} onChange={e=>set("employer_name",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Sector</label>
                <select className="form-select" value={form.employer_sector} onChange={e=>set("employer_sector",e.target.value)}>
                  <option value="">— Select —</option>
                  <option>Private</option><option>Government</option><option>NGO</option><option>Self</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Employer Address</label><input className="form-input" value={form.employer_address} onChange={e=>set("employer_address",e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Job Title</label><input className="form-input" value={form.job_title} onChange={e=>set("job_title",e.target.value)} placeholder="e.g. Software Developer" /></div>
            <div className="form-group"><label className="form-label">Job Description / Duties</label>
              <textarea className="form-textarea" value={form.job_description} onChange={e=>set("job_description",e.target.value)} placeholder="Describe the main responsibilities and tasks…" />
            </div>
            <div className="form-group"><label className="form-label">Skills Required by Job</label>
              <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.job_skills_required} onChange={e=>set("job_skills_required",e.target.value)} placeholder="List skills the employer expects or the graduate uses on the job…" />
            </div>
            <div className="form-row-3">
              <div className="form-group"><label className="form-label">Related to Course?</label>
                <select className="form-select" value={form.is_related_to_course} onChange={e=>set("is_related_to_course",e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Year Started</label><input className="form-input" type="number" value={form.year_started} onChange={e=>set("year_started",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Months to Employment</label><input className="form-input" type="number" value={form.months_to_employment} onChange={e=>set("months_to_employment",e.target.value)} /></div>
            </div>
          </>)}

          {form.employment_status === "Further Studies" && (<>
            <hr className="divider" />
            <div className="form-row">
              <div className="form-group"><label className="form-label">School</label><input className="form-input" value={form.further_studies_school} onChange={e=>set("further_studies_school",e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Program</label><input className="form-input" value={form.further_studies_program} onChange={e=>set("further_studies_program",e.target.value)} /></div>
            </div>
          </>)}

          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.graduate_id}>
            {busy ? <><div className="spinner" />Analyzing & Saving…</> : "Submit Record"}
          </button>
          {isEmployed && <span style={{ fontSize:11, color: T.inkMuted, marginLeft: 10 }}>⚡ LDA skills-gap analysis runs automatically</span>}
        </div>
      )}

      {selected && (
        <div className="card section fade-up" style={{ borderColor: T.accent }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Skills Gap Report — {selected.job_title || "Untitled Role"}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕ Close</button>
          </div>

          <div className="grid-2" style={{ gap: 24 }}>
            <div>
              <AlignmentGauge score={selected.alignment_score ?? 0} />
            </div>
            <div>
              {selected.detected_skill_topics?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Skill Domains Detected</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap: 5 }}>
                    {selected.detected_skill_topics.map(t => <span key={t} className="pill pill-topic">{t}</span>)}
                  </div>
                </div>
              )}
              <SkillPillGroup skills={selected.gap_skills}      variant="gap"     label="⚠ Gap Skills (job needs, not in program)" />
              <SkillPillGroup skills={selected.skills_in_job}   variant="match"   label="✓ Skills Found in Job" />
              <SkillPillGroup skills={selected.skills_from_program?.slice(0,8)} variant="surplus" label="📚 Program Profile Skills" />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {records.length === 0
          ? <div className="empty"><div className="empty-icon">💼</div>No employment records yet.</div>
          : <table className="table">
              <thead><tr>
                <th>Graduate</th><th>Job Title</th><th>Employer</th>
                <th>Status</th><th>Alignment</th><th>Gap Skills</th><th></th>
              </tr></thead>
              <tbody>
                {records.map(r => {
                  const g = gradMap[r.graduate_id];
                  const score = r.alignment_score;
                  return (
                    <tr key={r.record_id}>
                      <td>
                        <div style={{ fontWeight:500 }}>{g ? `${g.last_name}, ${g.first_name}` : "—"}</div>
                        <div style={{ fontSize:11, color: T.inkMuted }}>{g?.program}</div>
                      </td>
                      <td>{r.job_title || "—"}</td>
                      <td>{r.employer_name || "—"}</td>
                      <td>
                        <span className={`pill ${r.employment_status === "Employed" || r.employment_status === "Self-employed" ? "pill-match" : r.employment_status === "Unemployed" ? "pill-gap" : "pill-neutral"}`}>
                          {r.employment_status}
                        </span>
                      </td>
                      <td style={{ minWidth: 100 }}>
                        {score != null ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: alignColor(score), marginBottom: 3 }}>{Math.round(score*100)}%</div>
                            <ScoreBar value={score} color={alignColor(score)} />
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        {r.gap_skills?.length > 0
                          ? <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                              {r.gap_skills.slice(0,3).map(s => <span key={s} className="pill pill-gap">{s}</span>)}
                              {r.gap_skills.length > 3 && <span className="pill pill-neutral">+{r.gap_skills.length-3}</span>}
                            </div>
                          : "—"
                        }
                      </td>
                      <td>
                        {score != null && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(selected?.record_id === r.record_id ? null : r)}>
                            {selected?.record_id === r.record_id ? "Close" : "Details"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}

// ─── PAGE: SKILLS GAP ANALYZER ────────────────────────────────────────────────
function AnalyzerPage() {
  const [form, setForm] = useState({ job_title:"", job_description:"", job_skills_required:"", program:"", top_k:3 });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const [topics, setTopics] = useState([]);

  useEffect(() => { get("/api/lda/topics").then(d => setTopics(d.topics || [])); }, []);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  async function analyze() {
    setBusy(true); setErr(null); setResult(null);
    try { setResult(await post("/api/lda/analyze", form)); }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const radarData = result?.skill_topics?.map(t => ({ topic: t.label.split(" & ")[0], score: Math.round(t.score * 100) })) || [];

  return (
    <div className="fade-up">
      <h1 className="page-title">Skills Gap Analyzer</h1>
      <p className="page-sub">Test LDA analysis on any job role vs. degree program without saving a record</p>

      <div className="grid-2 section" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">Job & Program Input</div>
          {err && <div className="alert alert-error">{err}</div>}

          <div className="form-group"><label className="form-label">Job Title *</label>
            <input className="form-input" value={form.job_title} onChange={e=>set("job_title",e.target.value)} placeholder="e.g. Data Analyst" />
          </div>
          <div className="form-group"><label className="form-label">Program / Degree *</label>
            <input className="form-input" value={form.program} onChange={e=>set("program",e.target.value)} placeholder="e.g. BS Computer Science" />
          </div>
          <div className="form-group"><label className="form-label">Job Description</label>
            <textarea className="form-textarea" value={form.job_description} onChange={e=>set("job_description",e.target.value)} placeholder="Describe the duties and responsibilities…" />
          </div>
          <div className="form-group"><label className="form-label">Skills Required</label>
            <textarea className="form-textarea" style={{ minHeight:60 }} value={form.job_skills_required} onChange={e=>set("job_skills_required",e.target.value)} placeholder="SQL, Python, communication…" />
          </div>
          <button className="btn btn-primary" onClick={analyze} disabled={busy || !form.job_title || !form.program}>
            {busy ? <><div className="spinner" />Analyzing…</> : "⚡ Analyze Skills Gap"}
          </button>
        </div>

        {result ? (
          <div className="fade-up">
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Analysis Result</div>
              <div style={{ display:"flex", alignItems:"center", gap: 24, marginBottom: 20 }}>
                <AlignmentGauge score={result.alignment_score} />
                <div>
                  <div style={{ fontSize: 13, color: T.inkMuted, marginBottom: 4 }}>Program</div>
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>{result.program}</div>
                  <div style={{ fontSize: 13, color: T.inkMuted, marginBottom: 4 }}>Skill Domains</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap: 4 }}>
                    {result.skill_topics.map(t => (
                      <span key={t.topic_id} className="pill pill-topic" title={`${Math.round(t.score*100)}%`}>{t.label}</span>
                    ))}
                  </div>
                </div>
              </div>

              <SkillPillGroup skills={result.gap_skills}     variant="gap"     label={`⚠ Gap Skills (${result.gap_skills.length}) — demanded by job, not in program`} />
              <SkillPillGroup skills={result.surplus_skills?.slice(0,10)} variant="surplus" label={`📚 Surplus Skills — in program, not required by job`} />
              <SkillPillGroup skills={result.skills_in_job}  variant="match"   label="✓ Skills Extracted from Job Text" />
            </div>

            {radarData.length > 0 && (
              <div className="card">
                <div className="card-title">Skill Domain Distribution</div>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke={T.border} />
                    <PolarAngleAxis dataKey="topic" tick={{ fontSize: 10 }} />
                    <Radar dataKey="score" fill={T.accent} fillOpacity={0.25} stroke={T.accent} strokeWidth={2} />
                    <Tooltip formatter={v => v + "%"} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight: 300 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ color: T.inkMuted, textAlign:"center" }}>
              Fill in the job and program fields then click<br /><b>Analyze Skills Gap</b> to see results here.
            </div>
          </div>
        )}
      </div>

      <div className="card section">
        <div className="card-title">Current LDA Skill Domain Topics</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          {topics.map(t => (
            <div key={t.topic_id} style={{ background: T.bg, borderRadius: 10, padding: "12px 14px", border:`1px solid ${T.border}` }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t.label}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap: 4 }}>
                {t.top_words.slice(0,6).map(w => <span key={w} className="pill pill-neutral">{w}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PAGE: MODEL SETTINGS ─────────────────────────────────────────────────────
function ModelPage() {
  const [health, setHealth]   = useState(null);
  const [retraining, setRet]  = useState(false);
  const [retResult, setRetResult] = useState(null);

  useEffect(() => { get("/api/health").then(setHealth); }, []);

  async function retrain() {
    setRet(true); setRetResult(null);
    try { setRetResult(await post("/api/lda/retrain", {})); }
    catch(e) { setRetResult({ status:"error", reason: e.message }); }
    finally { setRet(false); }
  }

  return (
    <div className="fade-up">
      <h1 className="page-title">Model Settings</h1>
      <p className="page-sub">LDA model status and retraining controls</p>

      <div className="grid-2 section" style={{ alignItems:"start" }}>
        <div className="card">
          <div className="card-title">Model Status</div>
          {health && (
            <div style={{ display:"flex", flexDirection:"column", gap: 12 }}>
              {[
                { label: "API Status",     value: health.status },
                { label: "LDA Trained",    value: health.lda_trained ? "✓ Yes" : "✗ No" },
                { label: "Skill Topics",   value: `${health.n_skill_topics} domains` },
                { label: "Mode",           value: health.mode },
              ].map(row => (
                <div key={row.label} style={{ display:"flex", justifyContent:"space-between", fontSize: 13, paddingBottom: 10, borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ color: T.inkMuted }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Retrain LDA Model</div>
          <p style={{ fontSize: 13, color: T.inkMuted, marginBottom: 16, lineHeight: 1.6 }}>
            Once you've collected enough employment records (≥ 30 recommended), retrain the LDA model to replace the seed corpus with real job data from your graduates.
          </p>
          <button className="btn btn-primary" onClick={retrain} disabled={retraining}>
            {retraining ? <><div className="spinner" />Retraining…</> : "🔄 Retrain Now"}
          </button>

          {retResult && (
            <div className={`alert ${retResult.status === "ok" ? "alert-success" : "alert-error"}`} style={{ marginTop: 14 }}>
              {retResult.status === "ok"
                ? `✓ Retrained on ${retResult.n_texts} texts. Review topic words and update SKILL_TOPIC_LABELS.`
                : retResult.reason || retResult.message
              }
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">How Skills Gap Analysis Works</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap: 16, marginTop: 4 }}>
          {[
            { step:"1", icon:"📝", title:"Job Text Input", desc:"Graduate submits job title, description, and required skills." },
            { step:"2", icon:"🔬", title:"LDA Analysis", desc:"TF-IDF vectorizes the text. LDA discovers skill domain clusters." },
            { step:"3", icon:"🗂️", title:"Program Matching", desc:"Extracted job skills are compared to the degree's curriculum profile." },
            { step:"4", icon:"📊", title:"Gap Report", desc:"Gap skills, surplus skills, and a 0–100% alignment score are returned." },
          ].map(s => (
            <div key={s.step} style={{ textAlign:"center", padding: "16px 10px" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
const PAGES = [
  { id:"dashboard",  label:"Dashboard",      icon:"◉" },
  { id:"graduates",  label:"Graduates",      icon:"🎓" },
  { id:"employment", label:"Employment",     icon:"💼" },
  { id:"analyzer",   label:"Skills Analyzer",icon:"🎯" },
  { id:"model",      label:"Model Settings", icon:"⚙" },
];

export default function App() {
  const [page, setPage]       = useState("dashboard");
  const [stats, setStats]     = useState({});
  const [healthy, setHealthy] = useState(null);

  useEffect(() => {
    get("/api/health").then(h => setHealthy(h.status === "ok")).catch(() => setHealthy(false));
    get("/api/stats").then(setStats).catch(() => {});
  }, [page]);

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <nav className="sidebar">
          <div className="sidebar-logo">Graduate<br /><span>Tracer</span><br />System</div>
          {PAGES.map(p => (
            <div key={p.id} className={`nav-item ${page === p.id ? "active" : ""}`} onClick={() => setPage(p.id)}>
              <span className="nav-icon">{p.icon}</span> {p.label}
            </div>
          ))}
          <div className="sidebar-footer">
            <div style={{ fontSize: 11, color:"rgba(255,255,255,.35)" }}>
              <span className="status-dot" style={{ background: healthy === null ? "#888" : healthy ? "#3ecf6b" : "#e05a5a" }} />
              {healthy === null ? "Connecting…" : healthy ? "API Connected" : "API Offline"}
            </div>
          </div>
        </nav>

        <main className="main">
          {healthy === false && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              ⚠ Cannot reach API at <b>localhost:8000</b>. Make sure the FastAPI server is running.
            </div>
          )}
          {page === "dashboard"  && <DashboardPage stats={stats} />}
          {page === "graduates"  && <GraduatesPage />}
          {page === "employment" && <EmploymentPage />}
          {page === "analyzer"   && <AnalyzerPage />}
          {page === "model"      && <ModelPage />}
        </main>
      </div>
    </>
  );
}
