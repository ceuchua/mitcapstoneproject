// pages/admin/DashboardPage.jsx
// Descriptive visualizations + CSV/JSON export

import { useState, useEffect, useRef } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { StatTile, alignColor, ScoreBar } from "../../components/UI";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from "recharts";

const PIE_COLORS = [T.accent, T.green, T.yellow, T.red, "#7C5CBF", "#1A8CA0"];

export default function DashboardPage() {
  const [stats, setStats]       = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("overview");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, r] = await Promise.all([api.getStats(), api.getAllResponses()]);
        setStats(s);
        setResponses(r);
      } catch (_) {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  // ── Export helpers ──────────────────────────────────────────────────────────

  function exportJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV(rows, filename) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(","), ...rows.map(r =>
      headers.map(h => {
        const v = r[h];
        const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
        return `"${s.replace(/"/g, '""')}"`;
      }).join(",")
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportResponsesCSV() {
    const rows = responses.map(r => ({
      response_id: r.response_id,
      user_id:     r.user_id,
      submitted:   r.created_at,
      ...r.answers,
    }));
    exportCSV(rows, "tracer_responses.csv");
  }

  // ── Chart data ──────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (!stats) return <div className="alert alert-error">Failed to load statistics.</div>;

  const statusData = Object.entries(stats.employment_status_counts || {})
    .map(([k, v]) => ({ name: k.replace("_", " "), value: v }));

  const sectorData = Object.entries(stats.sector_counts || {})
    .map(([k, v]) => ({ name: k, value: v }));

  const gapData = (stats.top_gap_skills || []).slice(0, 10)
    .map(x => ({ skill: x.skill.length > 20 ? x.skill.slice(0, 18) + "…" : x.skill, count: x.count }));

  const progData = Object.entries(stats.records_by_program || {})
    .map(([k, v]) => ({ program: k.replace(/^(bs|bachelor of science in)\s*/i, ""), count: v }))
    .sort((a, b) => b.count - a.count);

  const yearData = Object.entries(stats.records_by_graduation_year || {})
    .map(([k, v]) => ({ year: k, graduates: v }))
    .sort((a, b) => a.year - b.year);

  const alignData = Object.entries(stats.avg_alignment_by_program || {})
    .map(([prog, score]) => ({
      program: prog.replace(/^(bs|bachelor of science in)\s*/i, ""),
      score: Math.round(score * 100),
    })).sort((a, b) => b.score - a.score);

  const responseRate = stats.total_graduates
    ? Math.round((stats.total_responses / stats.total_graduates) * 100) : 0;

  const employed = (stats.employment_status_counts?.["employed"] || 0)
    + (stats.employment_status_counts?.["self_employed"] || 0);
  const totalStatus = Object.values(stats.employment_status_counts || {}).reduce((a, b) => a + b, 0);
  const empRate = totalStatus ? Math.round((employed / totalStatus) * 100) : 0;

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Descriptive analytics from graduate tracer study responses</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportResponsesCSV}>⬇ Export Responses CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportJSON(stats, "tracer_stats.json")}>⬇ Export Stats JSON</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid-4 section">
        <StatTile icon="🎓" value={stats.total_graduates}  label="Total Graduates" />
        <StatTile icon="📋" value={stats.total_responses}  label="Responses" />
        <StatTile icon="📈" value={empRate + "%"}          label="Employment Rate" color={alignColor(empRate / 100)} />
        <StatTile icon="📊" value={responseRate + "%"}     label="Response Rate" />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {["overview", "skills", "programs", "responses"].map(t => (
          <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid-2 section">
          <div className="card">
            <div className="card-title">Employment Status</div>
            {statusData.length === 0
              ? <div className="empty"><div className="empty-icon">📊</div>No data yet</div>
              : <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                      label={({ name, percent }) => `${name} (${Math.round(percent * 100)}%)`}>
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
              ? <div className="empty"><div className="empty-icon">🏢</div>No data yet</div>
              : <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                      label={({ name, percent }) => `${name} (${Math.round(percent * 100)}%)`}>
                      {sectorData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
            }
          </div>

          {yearData.length > 0 && (
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <div className="card-title">Graduates by Batch Year</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="graduates" fill={T.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="grid-2 section">
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Top Skills Gap Across Graduates</div>
              <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(stats.top_gap_skills, "gap_skills.csv")}>⬇ Export</button>
            </div>
            {gapData.length === 0
              ? <div className="empty"><div className="empty-icon">🔍</div>No skills gap data yet. Graduates need to complete the tracer study.</div>
              : <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={gapData} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="skill" type="category" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill={T.red} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </div>

          {alignData.length > 0 && (
            <div className="card" style={{ gridColumn: "1/-1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>Average Alignment Score by Program</div>
                <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(alignData, "alignment_by_program.csv")}>⬇ Export</button>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={alignData}>
                  <XAxis dataKey="program" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => v + "%"} />
                  <Tooltip formatter={v => v + "%"} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {alignData.map((d, i) => <Cell key={i} fill={alignColor(d.score / 100)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab === "programs" && (
        <div className="card section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Graduates by Program</div>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(progData, "graduates_by_program.csv")}>⬇ Export</button>
          </div>
          {progData.length === 0
            ? <div className="empty">No program data yet.</div>
            : <ResponsiveContainer width="100%" height={Math.max(200, progData.length * 36)}>
                <BarChart data={progData} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="program" type="category" width={160} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={T.green} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      )}

      {tab === "responses" && (
        <div className="card section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Raw Responses ({responses.length})</div>
            <button className="btn btn-secondary btn-sm" onClick={exportResponsesCSV}>⬇ Export CSV</button>
          </div>
          {responses.length === 0
            ? <div className="empty"><div className="empty-icon">📋</div>No responses submitted yet.</div>
            : <table className="table">
                <thead><tr>
                  <th>User ID</th><th>Employment Status</th><th>Job Title</th><th>Sector</th><th>Related to Course</th><th>Submitted</th>
                </tr></thead>
                <tbody>
                  {responses.map(r => (
                    <tr key={r.response_id}>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.user_id.slice(0, 8)}…</td>
                      <td>{r.answers?.q_emp_status || "—"}</td>
                      <td>{r.answers?.q_job_title || "—"}</td>
                      <td>{r.answers?.q_sector || "—"}</td>
                      <td>{r.answers?.q_related || "—"}</td>
                      <td style={{ color: T.inkMuted, fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}
    </div>
  );
}
