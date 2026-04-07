// pages/admin/DashboardPage.jsx
// Descriptive analytics dashboard — all data via semantic roles, no hardcoded IDs

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { StatTile } from "../../components/UI";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  ResponsiveContainer,
} from "recharts";

const PIE_COLORS = [T.accent, T.green, T.yellow, T.red, "#7C5CBF", "#1A8CA0", "#E07B39"];

// ── Export helpers ────────────────────────────────────────────────────────────

function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

function exportCSV(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines   = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      return `"${String(Array.isArray(v) ? v.join("; ") : v ?? "").replace(/"/g, '""')}"`;
    }).join(",")),
  ];
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })),
    download: filename,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Rating bar ────────────────────────────────────────────────────────────────

function RatingBar({ value, max = 5, label }) {
  if (value == null) return null;
  const pct   = (value / max) * 100;
  const color = pct >= 70 ? T.green : pct >= 50 ? T.yellow : T.red;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: T.inkMuted }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value.toFixed(1)} / {max}</span>
      </div>
      <div style={{ background: "#EDE9E3", borderRadius: 20, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color,
          borderRadius: 20, transition: "width .6s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,           setStats]           = useState(null);
  const [responses,       setResponses]       = useState([]);
  const [questions,       setQuestions]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [tab,             setTab]             = useState("overview");
  const [actionErr,       setActionErr]       = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, r, q] = await Promise.all([
          api.getStats(),
          api.getAllResponses(),
          api.getQuestions(),
        ]);
        setStats(s);
        setResponses(r);
        setQuestions(q);
      } catch (_) {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleDeleteResponse(r) {
    if (!window.confirm(`Delete the response submitted by user ${r.user_id.slice(0,8)}? This cannot be undone.`)) return;
    try {
      await api.deleteResponse(r.response_id);
      setResponses(rs => rs.filter(x => x.response_id !== r.response_id));
      setActionErr(null);
    } catch (e) { setActionErr(e.message); }
  }


  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:80 }}>
      <div className="spinner spinner-dark" style={{ width:32, height:32 }} />
    </div>
  );

  if (!stats) return <div className="alert alert-error">Failed to load statistics.</div>;

  // ── Derive chart data ─────────────────────────────────────────────────────

  // Status chart — map option IDs to readable labels
  const STATUS_LABEL = {
    employed: "Employed", self_employed: "Self-employed",
    unemployed: "Unemployed", further_studies: "Further Studies",
  };
  const statusData = Object.entries(stats.employment_status_counts || {})
    .map(([k, v]) => ({ name: STATUS_LABEL[k] || k, value: v }));

  // Sector chart
  const SECTOR_LABEL = {
    private: "Private", government: "Government",
    ngo: "NGO / Non-profit", self: "Freelance / Self",
  };
  const sectorData = Object.entries(stats.sector_counts || {})
    .map(([k, v]) => ({ name: SECTOR_LABEL[k] || k, value: v }));

  // Skills from free-text (parsed)
  const skillData = (stats.top_skills || []).slice(0, 15)
    .map(x => ({
      skill: x.skill.length > 22 ? x.skill.slice(0, 20) + "…" : x.skill,
      full:  x.skill,
      count: x.count,
    }));

  // Graduates by program
  const progData = Object.entries(stats.records_by_program || {})
    .map(([k, v]) => ({ program: k.replace(/^(bs|bachelor of science in)\s*/i, ""), count: v }))
    .sort((a, b) => b.count - a.count);

  // Graduates by batch year
  const yearData = Object.entries(stats.records_by_graduation_year || {})
    .map(([k, v]) => ({ year: k, count: v }))
    .sort((a, b) => Number(a.year) - Number(b.year));

  // KPIs
  const totalStatus = Object.values(stats.employment_status_counts || {}).reduce((a,b) => a+b, 0);
  const employed    = (stats.employment_status_counts?.employed || 0)
                    + (stats.employment_status_counts?.self_employed || 0);
  const empRate     = totalStatus ? Math.round((employed / totalStatus) * 100) : 0;
  const respRate    = stats.total_graduates
    ? Math.round((stats.total_responses / stats.total_graduates) * 100) : 0;

  // Export helpers
  function exportResponses() {
    const rows = responses.map(r => ({ response_id: r.response_id, user_id: r.user_id, submitted: r.created_at, ...r.answers }));
    exportCSV(rows, "tracer_responses.csv");
  }

  // Build a role→question_id map for the response table headers
  const roleToQid = Object.fromEntries(
    questions.filter(q => q.semantic_role).map(q => [q.semantic_role, q.question_id])
  );

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Descriptive analytics from graduate tracer study responses</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportResponses}>⬇ Responses CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportJSON(stats, "tracer_stats.json")}>⬇ Stats JSON</button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid-4 section">
        <StatTile value={stats.total_graduates} label="Total Graduates" />
        <StatTile value={stats.total_responses} label="Responses" />
        <StatTile value={empRate + "%"}         label="Employment Rate"
          color={empRate >= 70 ? T.green : empRate >= 50 ? T.yellow : T.red} />
        <StatTile value={respRate + "%"}        label="Response Rate" />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {["overview", "skills", "satisfaction", "programs", "responses"].map(t => (
          <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="grid-2 section">
          <div className="card">
            <div className="card-title">Employment Status</div>
            {statusData.length === 0
              ? <div className="empty"><div className="empty-icon"></div>No responses yet</div>
              : <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={85}
                      label={({ name, percent }) => `${name} (${Math.round(percent*100)}%)`}>
                      {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
            }
          </div>

          <div className="card">
            <div className="card-title">Employer Sector</div>
            {sectorData.length === 0
              ? <div className="empty"><div className="empty-icon"></div>No data yet</div>
              : <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={sectorData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={85}
                      label={({ name, percent }) => `${name} (${Math.round(percent*100)}%)`}>
                      {sectorData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
            }
          </div>

          {yearData.length > 0 && (
            <div className="card" style={{ gridColumn:"1/-1" }}>
              <div className="card-title">Graduates by Batch Year</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="year" tick={{ fontSize:12 }} />
                  <YAxis tick={{ fontSize:12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={T.accent} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Skills tab ── */}
      {tab === "skills" && (
        <div className="section">
          <div className="card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div className="card-title" style={{ marginBottom:4 }}>Most Mentioned Skills</div>
                <p style={{ fontSize:12, color:T.inkMuted }}>
                  Extracted from graduates' free-text skill answers using delimiter-based parsing.
                  Each distinct skill phrase is counted separately.
                </p>
              </div>
              <button className="btn btn-secondary btn-sm"
                onClick={() => exportCSV(stats.top_skills, "top_skills.csv")}>⬇ Export</button>
            </div>
            {skillData.length === 0
              ? <div className="empty">
                  <div className="empty-icon"></div>
                  No skill data yet. Graduates need to answer the skills question in the tracer study.
                </div>
              : <BarChart
                  width={560} height={skillData.length * 36 + 40}
                  data={skillData} layout="vertical"
                  margin={{ left:8, right:32, top:4, bottom:4 }}
                  style={{ margin:"0 auto", display:"block" }}
                >
                  <XAxis type="number" allowDecimals={false}
                    tick={{ fontSize:11 }} />
                  <YAxis type="category" dataKey="skill"
                    width={160} tick={{ fontSize:11 }} />
                  <Tooltip
                    formatter={v => [v, "Mentions"]}
                    labelFormatter={(_, p) => p?.[0]?.payload?.full || ""}
                  />
                  <Bar dataKey="count" fill={T.accent} radius={[0,4,4,0]} maxBarSize={22} />
                </BarChart>
            }
          </div>
        </div>
      )}

      {/* ── Satisfaction tab ── */}
      {tab === "satisfaction" && (
        <div className="grid-2 section">
          <div className="card">
            <div className="card-title">Average Ratings</div>
            <p style={{ fontSize:12, color:T.inkMuted, marginBottom:16 }}>
              Based on {stats.total_responses} response{stats.total_responses !== 1 ? "s" : ""}.
              Scale: 1 (low) to 5 (high).
            </p>
            <RatingBar value={stats.avg_satisfaction}       label="Job Satisfaction" />
            <RatingBar value={stats.avg_curriculum_rating}  label="Curriculum Preparedness" />
            {stats.avg_months_to_employment != null && (
              <div style={{ marginTop:16, padding:"12px 14px", background:T.bg,
                borderRadius:8, border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:12, color:T.inkMuted, marginBottom:4 }}>
                  Average Months to First Employment
                </div>
                <div style={{ fontSize:24, fontFamily:"'DM Serif Display',serif", color:T.accent }}>
                  {stats.avg_months_to_employment}
                  <span style={{ fontSize:13, color:T.inkMuted, fontFamily:"'DM Sans',sans-serif",
                    marginLeft:6 }}>months</span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Course Relevance</div>
            {(() => {
              const rel = stats.employment_status_counts ? null : null;
              // Build from responses directly
              const counts = { yes: 0, no: 0, partially: 0 };
              const qid = roleToQid["course_relevance"];
              if (qid) {
                responses.forEach(r => {
                  const v = r.answers?.[qid];
                  if (v && counts[v] !== undefined) counts[v]++;
                });
              }
              const total = Object.values(counts).reduce((a,b)=>a+b,0);
              if (total === 0) return (
                <div className="empty"><div className="empty-icon"></div>No data yet</div>
              );
              const relData = [
                { name:"Related", value: counts.yes },
                { name:"Partially", value: counts.partially },
                { name:"Not Related", value: counts.no },
              ].filter(d => d.value > 0);
              return (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={relData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${Math.round(percent*100)}%`}>
                      <Cell fill={T.green} /><Cell fill={T.yellow} /><Cell fill={T.red} />
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Programs tab ── */}
      {tab === "programs" && (
        <div className="card section">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:0 }}>Graduates by Program</div>
            <button className="btn btn-secondary btn-sm"
              onClick={() => exportCSV(progData, "graduates_by_program.csv")}>⬇ Export</button>
          </div>
          {progData.length === 0
            ? <div className="empty">No program data yet.</div>
            : <ResponsiveContainer width="100%" height={Math.max(200, progData.length * 38)}>
                <BarChart data={progData} layout="vertical" margin={{ left:20 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis dataKey="program" type="category" width={160} tick={{ fontSize:12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={T.green} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      )}

      {/* ── Responses tab ── */}
      {tab === "responses" && (
        <div className="card section">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:0 }}>
              Tracer Study Responses ({responses.length})
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportResponses}>⬇ Export CSV</button>
          </div>

          {actionErr && <div className="alert alert-error" style={{ marginBottom:12 }}>{actionErr}</div>}

          {responses.length === 0
            ? <div className="empty"><div className="empty-icon"></div>No responses yet.</div>
            : <div style={{ overflowX:"auto" }}>
                <table className="table">
                  <thead><tr>
                    <th>User ID</th>
                    <th>Status</th>
                    <th>Job Title</th>
                    <th>Sector</th>
                    <th>Related</th>
                    <th>Skills Mentioned</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {responses.map(r => {
                      const ans = r.answers || {};
                      return (
                        <tr key={r.response_id}>
                          <td style={{ fontFamily:"monospace", fontSize:11 }}>{r.user_id.slice(0,8)}…</td>
                          <td>{STATUS_LABEL[ans[roleToQid["employment_status"]]] || ans[roleToQid["employment_status"]] || "—"}</td>
                          <td>{ans[roleToQid["job_title"]] || "—"}</td>
                          <td>{SECTOR_LABEL[ans[roleToQid["employer_sector"]]] || ans[roleToQid["employer_sector"]] || "—"}</td>
                          <td>{ans[roleToQid["course_relevance"]] || "—"}</td>
                          <td style={{ maxWidth:180, fontSize:11, color:T.inkMuted }}>
                            {ans[roleToQid["skills_free_text"]]?.slice(0,55) || "—"}
                          </td>
                          <td style={{ color:T.inkMuted, fontSize:12, whiteSpace:"nowrap" }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <button className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteResponse(r)}>🗑 Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

    </div>
  );
}
