// pages/admin/DashboardPage.jsx
// Admin dashboard — redesigned for non-technical users (faculty / registrars)

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { StatTile } from "../../components/UI";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  ResponsiveContainer,
} from "recharts";

const PIE_COLORS = [T.accent, T.green, T.yellow, "#7C5CBF", "#1A8CA0", "#E07B39", T.red];

const HANDLED_ROLES = new Set([
  "employment_status", "employer_sector", "course_relevance",
  "satisfaction_rating", "curriculum_rating", "months_to_employment",
  "skills_free_text", "job_description", "job_title", "employer_name",
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function exportCSV(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      const s = String(Array.isArray(v) ? v.join("; ") : v ?? "");
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(",")),
  ];
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })),
    download: filename,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

function resolveLabel(question, value) {
  if (value == null || value === "") return "";
  if (!question) return String(value);
  const opts = question.options || [];
  const map  = Object.fromEntries(opts.map(o => [o.id, o.label]));
  if (Array.isArray(value)) return value.map(v => map[v] || v).join("; ");
  return map[value] || String(value);
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function RatingBar({ value, max = 5, label, helpText }) {
  if (value == null) return null;
  const pct   = (value / max) * 100;
  const color = pct >= 70 ? T.green : pct >= 50 ? T.yellow : T.red;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
        <span style={{ color:T.ink, fontWeight:500 }}>{label}</span>
        <span style={{ fontWeight:700, color }}>{value.toFixed(1)} / {max}</span>
      </div>
      <div style={{ background:"#EDE9E3", borderRadius:20, height:10, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color,
          borderRadius:20, transition:"width .6s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      {helpText && <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>{helpText}</div>}
    </div>
  );
}

function InsightBadge({ value, threshold, goodLabel, badLabel }) {
  const isGood = value >= threshold;
  return (
    <span style={{
      display:"inline-block", fontSize:11, fontWeight:600,
      padding:"2px 8px", borderRadius:20, marginLeft:8,
      background: isGood ? T.greenSoft : T.yellowSoft,
      color: isGood ? T.green : T.yellow,
    }}>
      {isGood ? goodLabel : badLabel}
    </span>
  );
}

function DeleteModal({ response, userName, onConfirm, onCancel }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.45)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
    }}>
      <div style={{
        background:T.surface, borderRadius:16, padding:28, maxWidth:420,
        width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,.2)",
      }}>
        <div style={{ fontSize:22, marginBottom:6 }}>Remove Response?</div>
        <p style={{ fontSize:13, color:T.inkMuted, lineHeight:1.6, marginBottom:18 }}>
          You are about to permanently remove the tracer study response submitted by{" "}
          <strong style={{ color:T.ink }}>{userName}</strong>.
          This cannot be undone and the graduate will need to re-submit.
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Yes, Remove Response</button>
        </div>
      </div>
    </div>
  );
}

function QuestionChart({ question, responses }) {
  const qid     = question.question_id;
  const type    = question.type;
  const answers = responses
    .map(r => r.answers?.[qid])
    .filter(v => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));

  if (answers.length === 0) return (
    <div style={{ fontSize:12, color:T.inkMuted, padding:"12px 0", fontStyle:"italic" }}>
      No responses yet for this question.
    </div>
  );

  if (type === "single_choice" || type === "multi_choice" || type === "scale") {
    const counts = {};
    (question.options || []).forEach(o => { counts[o.id] = 0; });
    answers.forEach(a => {
      if (Array.isArray(a)) a.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      else counts[a] = (counts[a] || 0) + 1;
    });
    const labelMap  = Object.fromEntries((question.options || []).map(o => [o.id, o.label]));
    const chartData = Object.entries(counts)
      .map(([id, count]) => ({ name: labelMap[id] || id, count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count);

    if (type === "scale") {
      const nums = answers.filter(a => !Array.isArray(a));
      const avg  = nums.reduce((s, v) => s + (parseFloat(v) || 0), 0) / (nums.length || 1);
      const maxV = Math.max(...(question.options||[]).map(o => parseFloat(o.id)||0)) || 5;
      return (
        <div>
          <RatingBar value={avg} max={maxV}
            label={`Average: ${avg.toFixed(1)} out of ${maxV}`}
            helpText={`Based on ${nums.length} response${nums.length !== 1 ? "s" : ""}`} />
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
            {chartData.map(d => (
              <div key={d.name} style={{ fontSize:12, padding:"4px 12px",
                background:T.bg, border:`1px solid ${T.border}`, borderRadius:6 }}>
                <strong>{d.name}</strong> — {d.count}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 36 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left:8, right:28, top:4 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize:11 }} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize:11 }} />
          <Tooltip formatter={v => [v, "Graduates"]} />
          <Bar dataKey="count" fill={T.accent} radius={[0,4,4,0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === "number") {
    const nums = answers.map(a => parseFloat(a)).filter(n => !isNaN(n));
    const avg  = nums.reduce((a, b) => a + b, 0) / nums.length;
    return (
      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
        {[
          { label:"Average", value:avg.toFixed(1) },
          { label:"Lowest",  value:Math.min(...nums) },
          { label:"Highest", value:Math.max(...nums) },
          { label:"Total",   value:nums.length },
        ].map(s => (
          <div key={s.label} style={{ padding:"10px 16px", background:T.bg,
            border:`1px solid ${T.border}`, borderRadius:8, textAlign:"center", minWidth:80 }}>
            <div style={{ fontSize:22, fontFamily:"'DM Serif Display',serif",
              color:T.accent }}>{s.value}</div>
            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ fontSize:12, color:T.inkMuted, padding:"8px 0", fontStyle:"italic" }}>
      {answers.length} written response{answers.length !== 1 ? "s" : ""} collected.
      See individual answers in the <strong>All Responses</strong> tab.
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,       setStats]       = useState(null);
  const [responses,   setResponses]   = useState([]);
  const [questions,   setQuestions]   = useState([]);
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState("overview");
  const [search,      setSearch]      = useState("");
  const [deleteModal, setDeleteModal] = useState(null);
  const [actionErr,   setActionErr]   = useState(null);
  const [loadedAt,    setLoadedAt]    = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, r, q, u] = await Promise.all([
          api.getStats(), api.getAllResponses(), api.getQuestions(), api.listUsers("student"),
        ]);
        setStats(s); setResponses(r); setQuestions(q); setUsers(u);
        setLoadedAt(new Date());
      } catch (_) {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  const userMap = Object.fromEntries(
    users.map(u => [u.user_id, {
      name:       `${u.last_name}, ${u.first_name}`,
      student_id: u.student_id || "—",
      program:    u.program    || "—",
    }])
  );
  const qMap      = Object.fromEntries(questions.map(q => [q.question_id, q]));
  const roleToQid = Object.fromEntries(
    questions.filter(q => q.semantic_role).map(q => [q.semantic_role, q.question_id])
  );

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:80 }}>
      <div className="spinner spinner-dark" style={{ width:32, height:32 }} />
    </div>
  );
  if (!stats) return (
    <div className="alert alert-error">Could not load dashboard. Please refresh the page.</div>
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  const STATUS_LABEL = {
    employed:"Employed", unemployed:"Not Employed", never_employed:"Never Employed",
  };
  const SECTOR_LABEL = {
    agriculture:"Agriculture & Forestry", fishing:"Fishing",
    mining:"Mining & Quarrying", manufacturing:"Manufacturing",
    utilities:"Electricity, Gas & Water", construction:"Construction",
    trade:"Wholesale & Retail Trade", hotels:"Hotels & Restaurants",
    transport:"Transport & Communication", finance:"Financial Intermediation",
    real_estate:"Real Estate & Business", public_admin:"Public Administration",
    education:"Education", health:"Health & Social Work",
    other_services:"Other Community Services",
    private_household:"Private Households", international:"Extra-territorial Orgs",
  };

  const statusData  = Object.entries(stats.employment_status_counts || {})
    .map(([k, v]) => ({ name: STATUS_LABEL[k] || k, value: v }));
  const sectorData  = Object.entries(stats.sector_counts || {})
    .map(([k, v]) => ({ name: SECTOR_LABEL[k] || k, count: v }))
    .sort((a, b) => b.count - a.count);
  const skillData   = (stats.top_skills || []).slice(0, 15)
    .map(x => ({ skill:x.skill.length>24?x.skill.slice(0,22)+"…":x.skill, full:x.skill, count:x.count }));
  const progData    = Object.entries(stats.records_by_program || {})
    .map(([k, v]) => ({ program:k.replace(/^(bs|bachelor of science in)\s*/i,""), count:v }))
    .sort((a, b) => b.count - a.count);
  const yearData    = Object.entries(stats.records_by_graduation_year || {})
    .map(([k, v]) => ({ year:k, count:v })).sort((a,b)=>Number(a.year)-Number(b.year));

  const totalStatus   = Object.values(stats.employment_status_counts||{}).reduce((a,b)=>a+b,0);
  const employedCount = stats.employment_status_counts?.employed || 0;
  const empRate       = totalStatus ? Math.round(employedCount/totalStatus*100) : 0;
  const respRate      = stats.total_graduates
    ? Math.round(stats.total_responses/stats.total_graduates*100) : 0;

  const relQid    = roleToQid["course_relevance"];
  const relCounts = { yes:0, no:0 };
  if (relQid) responses.forEach(r => {
    const v = r.answers?.[relQid];
    if (v==="yes") relCounts.yes++; else if (v==="no") relCounts.no++;
  });
  const relTotal   = relCounts.yes + relCounts.no;
  const relPct     = relTotal ? Math.round(relCounts.yes/relTotal*100) : null;
  const relPieData = [
    { name:"Related to Course", value:relCounts.yes },
    { name:"Not Related",       value:relCounts.no  },
  ].filter(d => d.value > 0);

  const surveyQuestions = questions.filter(q => !HANDLED_ROLES.has(q.semantic_role));

  // Search filter
  const searchLower       = search.toLowerCase().trim();
  const filteredResponses = responses.filter(r => {
    if (!searchLower) return true;
    const u = userMap[r.user_id];
    return [u?.name, u?.student_id, u?.program,
            r.answers?.[roleToQid["employment_status"]]]
      .filter(Boolean).some(v => v.toLowerCase().includes(searchLower));
  });

  function exportResponses() {
    const rows = responses.map(r => {
      const u = userMap[r.user_id] || {};
      const row = {
        "Graduate Name": u.name || "Unknown",
        "Student ID":    u.student_id || "—",
        "Program":       u.program || "—",
        "Date Submitted": new Date(r.created_at).toLocaleDateString(),
      };
      questions.forEach(q => {
        const raw    = r.answers?.[q.question_id];
        if (raw == null) return;
        const header = q.text.length > 50 ? q.text.slice(0,48)+"…" : q.text;
        row[header]  = resolveLabel(q, raw);
      });
      return row;
    });
    exportCSV(rows, "tracer_study_responses.csv");
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    try {
      await api.deleteResponse(deleteModal.response.response_id);
      setResponses(rs => rs.filter(x => x.response_id !== deleteModal.response.response_id));
      setActionErr(null);
    } catch (e) { setActionErr("Could not remove the response. Please try again."); }
    finally     { setDeleteModal(null); }
  }

  const TABLE_ROLE_COLS = [
    { role:"employment_status", header:"Employment Status",
      render:(v) => STATUS_LABEL[v] || v },
    { role:"job_title",         header:"Occupation / Role",
      render:(v,q) => resolveLabel(q,v) },
    { role:"employer_sector",   header:"Industry Sector",
      render:(v) => SECTOR_LABEL[v] || v },
    { role:"course_relevance",  header:"Job Related to Course?",
      render:(v) => v==="yes" ? "✓ Yes" : v==="no" ? "✗ No" : v },
  ];

  const TABS = [
    { id:"overview",    label:"At a Glance"       },
    { id:"skills",      label:"Skills"             },
    { id:"satisfaction",label:"Satisfaction"       },
    { id:"programs",    label:"By Program"         },
    ...(surveyQuestions.length > 0
      ? [{ id:"survey", label:"Survey Responses"  }] : []),
    { id:"responses",   label:"All Responses"     },
  ];

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 className="page-title">Graduate Tracer Dashboard</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>
            Summary of graduate employment outcomes and tracer study responses.
            {loadedAt && (
              <span style={{ marginLeft:8, fontSize:11 }}>
                Last updated: {loadedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportResponses}>
          ⬇ Export to Spreadsheet
        </button>
      </div>

      {/* KPI Tiles */}
      <div className="grid-4 section">
        <div className="stat-tile">
          <div style={{ fontSize:13, marginBottom:4 }}></div>
          <div className="stat-value">{stats.total_graduates}</div>
          <div className="stat-label">Registered Graduates</div>
        </div>
        <div className="stat-tile">
          <div style={{ fontSize:13, marginBottom:4 }}></div>
          <div className="stat-value">{stats.total_responses}</div>
          <div className="stat-label">Surveys Completed</div>
          <div style={{ fontSize:11, color:T.inkMuted, marginTop:3 }}>
            {respRate}% of graduates responded
          </div>
        </div>
        <div className="stat-tile">
          <div style={{ fontSize:13, marginBottom:4 }}></div>
          <div className="stat-value"
            style={{ color:empRate>=70?T.green:empRate>=50?T.yellow:T.red }}>
            {empRate}%
          </div>
          <div className="stat-label">Employment Rate</div>
          <div style={{ fontSize:11, color:T.inkMuted, marginTop:3 }}>
            of graduates who responded
          </div>
        </div>
        <div className="stat-tile">
          <div style={{ fontSize:13, marginBottom:4 }}></div>
          <div className="stat-value">
            {stats.avg_satisfaction ? stats.avg_satisfaction.toFixed(1) : "—"}
            <span style={{ fontSize:14, color:T.inkMuted,
              fontFamily:"'DM Sans',sans-serif" }}>/5</span>
          </div>
          <div className="stat-label">Avg. Job Satisfaction</div>
          <div style={{ fontSize:11, color:T.inkMuted, marginTop:3 }}>5 = Very Satisfied</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.id} className={`tab ${tab===t.id?"active":""}`}
            onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {/* ── AT A GLANCE ── */}
      {tab === "overview" && (
        <div className="section">
          {statusData.length === 0 && sectorData.length === 0 ? (
            <div className="card empty" style={{ padding:60 }}>
              <div style={{ fontWeight:600, marginBottom:8 }}>No responses yet</div>
              <div style={{ fontSize:13, color:T.inkMuted, maxWidth:360, margin:"0 auto" }}>
                Once graduates complete the tracer study, their responses will appear here.
              </div>
            </div>
          ) : (
            <>
              {totalStatus > 0 && (
                <div style={{
                  background:T.surface, border:`1px solid ${T.border}`,
                  borderRadius:12, padding:"14px 18px", marginBottom:20,
                  fontSize:13, lineHeight:1.7,
                }}>
                  Based on <strong>{totalStatus}</strong> tracer study
                  response{totalStatus!==1?"s":""},{" "}
                  <strong style={{ color:empRate>=70?T.green:T.yellow }}>
                    {empRate}%
                  </strong> of responding graduates are currently employed.
                  {relPct !== null && (
                    <> Of those,{" "}
                    <strong style={{ color:relPct>=60?T.green:T.yellow }}>
                      {relPct}%
                    </strong> said their job is related to their college course.</>
                  )}
                </div>
              )}
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">Employment Status</div>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={80}
                        label={({name,percent})=>`${name} (${Math.round(percent*100)}%)`}>
                        {statusData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={v=>[v,"Graduates"]}/>
                      <Legend/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="card-title">Industry Sector</div>
                  {sectorData.length === 0 ? (
                    <div className="empty" style={{ padding:40 }}>
                      <div className="empty-icon">🏢</div>No data yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%"
                      height={Math.max(160, sectorData.length*28+40)}>
                      <BarChart data={sectorData} layout="vertical"
                        margin={{ left:4, right:28, top:4, bottom:4 }}>
                        <XAxis type="number" allowDecimals={false} tick={{fontSize:10}}/>
                        <YAxis type="category" dataKey="name" width={150} tick={{fontSize:10}}/>
                        <Tooltip formatter={v=>[v,"Graduates"]}/>
                        <Bar dataKey="count" fill={T.accent} radius={[0,4,4,0]} maxBarSize={18}/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              {yearData.length > 0 && (
                <div className="card" style={{ marginTop:20 }}>
                  <div className="card-title">Graduates by Batch Year</div>
                  <p style={{ fontSize:12, color:T.inkMuted, marginBottom:14 }}>
                    Number of graduates registered per graduation year.
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={yearData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                      <XAxis dataKey="year" tick={{fontSize:12}}/>
                      <YAxis tick={{fontSize:12}} allowDecimals={false}/>
                      <Tooltip formatter={v=>[v,"Graduates"]}/>
                      <Bar dataKey="count" fill={T.green} radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SKILLS ── */}
      {tab === "skills" && (
        <div className="section">
          <div className="card">
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <div>
                <div className="card-title" style={{ marginBottom:4 }}>
                  Top Skills Reported by Graduates
                </div>
                <p style={{ fontSize:12, color:T.inkMuted }}>
                  Skills most frequently selected by graduates in their tracer study responses.
                </p>
              </div>
              <button className="btn btn-secondary btn-sm"
                onClick={() => exportCSV(
                  (stats.top_skills||[]).map(s=>({Skill:s.skill,Mentions:s.count})),
                  "top_skills.csv"
                )}>
                ⬇ Export Skills List
              </button>
            </div>
            {skillData.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🔍</div>
                No skill data yet. Skills will appear once graduates submit their responses.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={skillData.length*36+50}>
                <BarChart data={skillData} layout="vertical"
                  margin={{left:8,right:40,top:4,bottom:4}}>
                  <XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/>
                  <YAxis type="category" dataKey="skill" width={170} tick={{fontSize:11}}/>
                  <Tooltip formatter={v=>[v,"Graduates mentioned"]}
                    labelFormatter={(_,p)=>p?.[0]?.payload?.full||""}/>
                  <Bar dataKey="count" fill={T.accent} radius={[0,4,4,0]} maxBarSize={22}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── SATISFACTION ── */}
      {tab === "satisfaction" && (
        <div className="grid-2 section">
          <div className="card">
            <div className="card-title">Average Ratings</div>
            <p style={{ fontSize:12, color:T.inkMuted, marginBottom:18 }}>
              Based on {stats.total_responses} response{stats.total_responses!==1?"s":""}.
              Each item is rated from 1 (lowest) to 5 (highest).
            </p>
            <RatingBar value={stats.avg_satisfaction} label="Job Satisfaction"
              helpText="5 = Very Satisfied with their current job"/>
            <RatingBar value={stats.avg_curriculum_rating} label="Curriculum Preparedness"
              helpText="5 = Curriculum prepared them very well for the workforce"/>
            {stats.avg_months_to_employment != null && (
              <div style={{ marginTop:20, padding:"14px 16px", background:T.bg,
                borderRadius:10, border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:11, color:T.inkMuted, fontWeight:600,
                  textTransform:"uppercase", letterSpacing:".5px", marginBottom:6 }}>
                  Average Time to First Job
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                  <span style={{ fontSize:28, fontFamily:"'DM Serif Display',serif",
                    color:T.accent }}>{stats.avg_months_to_employment}</span>
                  <span style={{ fontSize:13, color:T.inkMuted }}>months after graduation</span>
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">Job Related to College Course?</div>
            {relTotal === 0 ? (
              <div className="empty"><div className="empty-icon">📋</div>No data yet</div>
            ) : (
              <>
                <p style={{ fontSize:13, marginBottom:16, lineHeight:1.6 }}>
                  <strong style={{color:relPct>=60?T.green:T.yellow}}>{relPct}%</strong>
                  {" "}of graduates said their first job was related to their college course.
                  <InsightBadge value={relPct} threshold={60}
                    goodLabel="Good alignment" badLabel="Needs attention"/>
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={relPieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={75}
                      label={({name,percent})=>`${name}: ${Math.round(percent*100)}%`}>
                      <Cell fill={T.green}/><Cell fill={T.red}/>
                    </Pie>
                    <Tooltip formatter={v=>[v,"Graduates"]}/>
                    <Legend/>
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── BY PROGRAM ── */}
      {tab === "programs" && (
        <div className="card section">
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <div>
              <div className="card-title" style={{ marginBottom:4 }}>
                Graduates by Degree Program
              </div>
              <p style={{ fontSize:12, color:T.inkMuted }}>
                Number of registered graduates per program.
              </p>
            </div>
            <button className="btn btn-secondary btn-sm"
              onClick={() => exportCSV(
                progData.map(p=>({Program:p.program,Graduates:p.count})),
                "graduates_by_program.csv"
              )}>
              ⬇ Export
            </button>
          </div>
          {progData.length === 0 ? (
            <div className="empty">No program data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200,progData.length*40)}>
              <BarChart data={progData} layout="vertical" margin={{left:16,right:48,top:4}}>
                <XAxis type="number" allowDecimals={false} hide/>
                <YAxis dataKey="program" type="category" width={185} tick={{fontSize:12}}/>
                <Tooltip formatter={v=>[v,"Graduates"]}/>
                <Bar dataKey="count" fill={T.green} radius={[0,4,4,0]}
                  label={{position:"right",fontSize:12,fill:T.inkMuted}}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── SURVEY RESPONSES ── */}
      {tab === "survey" && (
        <div className="section">
          {surveyQuestions.length === 0 ? (
            <div className="card empty" style={{ padding:60 }}>
              <div className="empty-icon">📋</div>
              <div style={{ fontWeight:600, marginBottom:8 }}>No additional questions</div>
              <div style={{ fontSize:13, color:T.inkMuted }}>
                All survey questions are shown in the other tabs above.
              </div>
            </div>
          ) : (
            <div style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(400px, 1fr))", gap:20 }}>
              {surveyQuestions.map(q => {
                const ansCount = responses.filter(
                  r => r.answers?.[q.question_id] != null &&
                       r.answers?.[q.question_id] !== ""
                ).length;
                return (
                  <div key={q.question_id} className="card"
                    style={{ gridColumn:q.type==="text"?"1/-1":"auto" }}>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontWeight:600, fontSize:13, marginBottom:4, lineHeight:1.5 }}>
                        {q.text}
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                        <span className="pill pill-neutral" style={{ fontSize:11 }}>
                          {q.section}
                        </span>
                        <span style={{ fontSize:11, color:T.inkMuted }}>
                          {ansCount} of {responses.length} responded
                        </span>
                      </div>
                    </div>
                    <QuestionChart question={q} responses={responses}/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ALL RESPONSES ── */}
      {tab === "responses" && (
        <div className="card section">
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
            <div>
              <div className="card-title" style={{ marginBottom:4 }}>
                All Responses ({responses.length})
              </div>
              <p style={{ fontSize:12, color:T.inkMuted }}>
                Individual tracer study submissions from graduates.
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportResponses}>
              ⬇ Export to Spreadsheet
            </button>
          </div>

          {/* Search */}
          <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10,
            flexWrap:"wrap" }}>
            <input className="form-input" style={{ maxWidth:380 }}
              placeholder="🔍  Search by name, student ID, program, or status…"
              value={search} onChange={e => setSearch(e.target.value)}/>
            {search && (
              <>
                <span style={{ fontSize:12, color:T.inkMuted }}>
                  {filteredResponses.length} of {responses.length} shown
                </span>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => setSearch("")}>Clear</button>
              </>
            )}
          </div>

          {actionErr && (
            <div className="alert alert-error" style={{ marginBottom:12 }}>{actionErr}</div>
          )}

          {responses.length === 0 ? (
            <div className="empty" style={{ padding:60 }}>
              <div className="empty-icon">📋</div>
              <div style={{ fontWeight:600, marginBottom:8 }}>No responses yet</div>
              <div style={{ fontSize:13, color:T.inkMuted }}>
                Share the tracer study link with graduates to start collecting responses.
              </div>
            </div>
          ) : filteredResponses.length === 0 ? (
            <div className="empty" style={{ padding:40 }}>
              <div className="empty-icon">🔍</div>
              No graduates match your search.
              <button className="btn btn-secondary btn-sm"
                style={{ marginLeft:10 }} onClick={() => setSearch("")}>
                Clear search
              </button>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Graduate Name</th>
                    <th>Student ID</th>
                    <th>Program</th>
                    {TABLE_ROLE_COLS.map(c => <th key={c.role}>{c.header}</th>)}
                    <th>Date Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResponses.map(r => {
                    const u   = userMap[r.user_id] || {};
                    const ans = r.answers || {};
                    return (
                      <tr key={r.response_id}>
                        <td style={{ fontWeight:500 }}>
                          {u.name || (
                            <span style={{ color:T.inkMuted, fontStyle:"italic" }}>
                              Unknown Graduate
                            </span>
                          )}
                        </td>
                        <td style={{ color:T.inkMuted, fontSize:12 }}>
                          {u.student_id || "—"}
                        </td>
                        <td style={{ fontSize:12, maxWidth:160, whiteSpace:"nowrap",
                          overflow:"hidden", textOverflow:"ellipsis", color:T.inkMuted }}>
                          {u.program || "—"}
                        </td>
                        {TABLE_ROLE_COLS.map(c => {
                          const raw = ans[roleToQid[c.role]];
                          const q   = qMap[roleToQid[c.role]];
                          return (
                            <td key={c.role} style={{ fontSize:12 }}>
                              {raw != null ? c.render(raw, q) : (
                                <span style={{ color:T.inkMuted }}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ color:T.inkMuted, fontSize:12, whiteSpace:"nowrap" }}>
                          {new Date(r.created_at).toLocaleDateString("en-PH", {
                            year:"numeric", month:"short", day:"numeric",
                          })}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color:T.red, borderColor:T.red, fontSize:11 }}
                            onClick={() => setDeleteModal({
                              response:r, userName:u.name||"this graduate",
                            })}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <DeleteModal
          response={deleteModal.response}
          userName={deleteModal.userName}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
