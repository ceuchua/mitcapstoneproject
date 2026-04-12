// pages/admin/SkillTrendsPage.jsx

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const COLORS = [
  T.accent, T.green, "#7C5CBF", "#1A8CA0", "#E07B39",
  "#B07D1A", "#2D7A4F", "#B53A2F",
];

function exportCSV(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r =>
      headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })),
    download: filename,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export default function SkillTrendsPage() {
  const [trends,    setTrends]    = useState(null);
  const [market,    setMarket]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  const [tab,       setTab]       = useState("competencies");
  const [loadedAt,  setLoadedAt]  = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([
        api.getSkillTrends(),
        api.getMarketSkills().catch(() => null),
      ]);
      setTrends(t);
      setMarket(m);
      setLoadedAt(new Date());
    } catch (e) {
      setTrends({ status: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleReload() {
    setReloading(true); setReloadMsg(null);
    try {
      const r = await api.reloadModel();
      setReloadMsg({
        ok:   r.status === "ok",
        text: r.status === "ok"
          ? "Skill analysis model updated successfully."
          : "Model could not be updated. Please contact your system administrator.",
      });
      if (r.status === "ok") await load();
    } catch (e) {
      setReloadMsg({ ok: false, text: "Update failed: " + e.message });
    } finally {
      setReloading(false);
    }
  }

  function exportCompetencies() {
    const rows = (trends?.competency_frequency || []).map(c => ({
      "Competency":         c.competency,
      "Number of Graduates": c.count,
      "Percentage":         c.pct + "%",
    }));
    exportCSV(rows, "graduate_competencies.csv");
  }

  function exportMarket() {
    const rows = (market?.top_indemand || []).map((s, i) => ({
      "Rank":  i + 1,
      "Skill": s.skill,
    }));
    exportCSV(rows, "indemand_skills.csv");
  }

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:80 }}>
      <div className="spinner spinner-dark" style={{ width:32, height:32 }} />
    </div>
  );

  // ── Derived data ───────────────────────────────────────────────────────────

  const nResponses = trends?.n_responses ?? 0;
  const freqData   = (trends?.competency_frequency || []).map((c, i) => ({
    ...c,
    short: c.competency.replace(" Skills", "").replace(" skills", ""),
    color: COLORS[i % COLORS.length],
  }));

  // Collect all unique competency labels for grouped program chart
  const allComps = [...new Set(freqData.map(c => c.competency))];

  // Top 6 programs by number of graduates
  const programData = (trends?.competency_by_program || []).slice(0, 6).map(p => {
    const row = { program: p.program.replace("Bachelor of ", "B. ").replace("BS ", "BS ") };
    for (const c of p.competencies) row[c.competency] = c.count;
    return row;
  });

  const hasData = trends?.status !== "no_data" && nResponses > 0;

  return (
    <div className="fade-up">

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 className="page-title">Graduate Skills Analysis</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>
            Competencies reported by graduates in their tracer study responses.
            {loadedAt && (
              <span style={{ marginLeft:8, fontSize:11, color:T.inkMuted }}>
                Last updated: {loadedAt.toLocaleTimeString([],
                  { hour:"2-digit", minute:"2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm"
          onClick={handleReload} disabled={reloading}
          title="Refresh the analysis with the latest graduate data">
          {reloading
            ? <><div className="spinner"
                style={{ borderColor:"rgba(0,0,0,.15)", borderTopColor:T.accent }} />
                Updating…</>
            : "Refresh Analysis"}
        </button>
      </div>

      {reloadMsg && (
        <div className={`alert ${reloadMsg.ok ? "alert-success" : "alert-error"}`}
          style={{ marginBottom:20 }}>
          {reloadMsg.text}
        </div>
      )}

      {/* ── No data ── */}
      {!hasData ? (
        <div className="card" style={{ textAlign:"center", padding:60 }}>
          <div style={{ fontFamily:"'DM Serif Display',serif",
            fontSize:20, marginBottom:8 }}>
            No Data Yet
          </div>
          <p style={{ color:T.inkMuted, fontSize:13, maxWidth:420,
            margin:"0 auto", lineHeight:1.7 }}>
            Competency data will appear here once graduates complete the tracer
            study and submit their responses.
          </p>
        </div>
      ) : (
        <>
          {/* ── Summary tiles ── */}
          <div className="grid-3 section">
            <div className="stat-tile">
              <div className="stat-value">{nResponses}</div>
              <div className="stat-label">Graduate Responses</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">{freqData.length}</div>
              <div className="stat-label">Distinct Competencies Reported</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">
                {freqData[0]?.competency.replace(" Skills","") || "—"}
              </div>
              <div className="stat-label">Most Reported Competency</div>
            </div>
          </div>

          {/* ── Insight ── */}
          {freqData[0] && (
            <div style={{
              background:T.surface, border:`1px solid ${T.border}`,
              borderRadius:12, padding:"14px 18px", marginBottom:20,
              fontSize:13, lineHeight:1.7,
            }}>
              📌 Based on <strong>{nResponses}</strong> graduate
              response{nResponses !== 1 ? "s" : ""}, the most commonly reported
              competency is <strong style={{ color:T.accent }}>
              {freqData[0].competency}</strong> reported by{" "}
              <strong>{freqData[0].count}</strong> graduate
              {freqData[0].count !== 1 ? "s" : ""} ({freqData[0].pct}%).
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="tabs">
            {[
              { id:"competencies", label:"Reported Competencies" },
              { id:"by_program",   label:"By Degree Program"    },
              { id:"market",       label:"In-Demand Job Skills" },
            ].map(t => (
              <div key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </div>
            ))}
          </div>

          {/* ══ REPORTED COMPETENCIES TAB ════════════════════════════════════ */}
          {tab === "competencies" && (
            <div className="section">
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:16,
                flexWrap:"wrap", gap:10 }}>
                <p style={{ fontSize:13, color:T.inkMuted, maxWidth:560 }}>
                  The chart below shows how many graduates selected each
                  competency when completing the tracer study. A graduate
                  may select more than one competency.
                </p>
                <button className="btn btn-secondary btn-sm"
                  onClick={exportCompetencies}>
                  Export
                </button>
              </div>

              <div className="card">
                <div className="card-title">Competency Frequency</div>
                <ResponsiveContainer width="100%"
                  height={Math.max(180, freqData.length * 48 + 40)}>
                  <BarChart data={freqData} layout="vertical"
                    margin={{ left:8, right:60, top:4, bottom:4 }}>
                    <XAxis type="number" allowDecimals={false}
                      tick={{ fontSize:11 }}
                      label={{ value:"Number of graduates", position:"insideBottom",
                        offset:-2, fontSize:11, fill:T.inkMuted }} />
                    <YAxis type="category" dataKey="short"
                      width={150} tick={{ fontSize:12 }} />
                    <Tooltip
                      formatter={(v, _, props) => [
                        `${v} graduate${v !== 1 ? "s" : ""} (${props.payload.pct}%)`,
                        "Count",
                      ]}
                      labelFormatter={(_, p) => p?.[0]?.payload?.competency || ""} />
                    <Bar dataKey="count" radius={[0,4,4,0]} maxBarSize={28}>
                      {freqData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Summary table */}
              <div className="card" style={{ marginTop:20 }}>
                <div className="card-title">Summary Table</div>
                <table style={{ width:"100%", borderCollapse:"collapse",
                  fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                      {["Competency","Graduates Reporting","% of Respondents"].map(h => (
                        <th key={h} style={{ textAlign:"left",
                          padding:"8px 12px", fontSize:11,
                          fontWeight:700, color:T.inkMuted,
                          textTransform:"uppercase", letterSpacing:".6px" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freqData.map((c, i) => (
                      <tr key={c.competency}
                        style={{ background: i % 2 === 0 ? "transparent" : T.bg,
                          borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"10px 12px", fontWeight:500 }}>
                          <span style={{ display:"inline-block", width:10,
                            height:10, borderRadius:2, background:c.color,
                            marginRight:8 }} />
                          {c.competency}
                        </td>
                        <td style={{ padding:"10px 12px" }}>{c.count}</td>
                        <td style={{ padding:"10px 12px", color:T.inkMuted }}>
                          {c.pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ BY DEGREE PROGRAM TAB ════════════════════════════════════════ */}
          {tab === "by_program" && (
            <div className="section">
              <p style={{ fontSize:13, color:T.inkMuted,
                marginBottom:16, maxWidth:560 }}>
                Shows which competencies graduates from each degree program
                reported most. This helps identify whether different programs
                produce different skill profiles.
              </p>

              {programData.length === 0 ? (
                <div className="card empty">
                  No program data available yet.
                </div>
              ) : (
                <>
                  {/* One card per program */}
                  <div style={{
                    display:"grid",
                    gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",
                    gap:16,
                  }}>
                    {(trends?.competency_by_program || []).map((p, pi) => (
                      <div key={p.program} className="card">
                        <div className="card-title"
                          style={{ fontSize:13, marginBottom:4 }}>
                          {p.program}
                        </div>
                        <div style={{ fontSize:11, color:T.inkMuted,
                          marginBottom:12 }}>
                          {p.total} competency selection{p.total !== 1 ? "s" : ""}
                          {" "}from this program
                        </div>
                        {p.competencies.map((c, ci) => (
                          <div key={c.competency}
                            style={{ marginBottom:8 }}>
                            <div style={{ display:"flex",
                              justifyContent:"space-between",
                              fontSize:12, marginBottom:3 }}>
                              <span>{c.competency
                                .replace(" Skills","")
                                .replace(" skills","")}</span>
                              <span style={{ color:T.inkMuted,
                                fontWeight:600 }}>
                                {c.count}
                              </span>
                            </div>
                            <div style={{ background:T.border,
                              borderRadius:20, height:6, overflow:"hidden" }}>
                              <div style={{
                                width: p.total > 0
                                  ? `${Math.round(c.count/p.total*100)}%`
                                  : "0%",
                                height:"100%",
                                background: COLORS[ci % COLORS.length],
                                borderRadius:20,
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ IN-DEMAND JOB SKILLS TAB ════════════════════════════════════ */}
          {tab === "market" && (
            <div className="section">

              <div style={{
                background:"#FBF2DC", border:"1px solid #B07D1A",
                borderRadius:10, padding:"12px 16px", marginBottom:20,
                fontSize:12, color:"#5a4000", lineHeight:1.7,
              }}>
                📌 <strong>About this data:</strong> The skill clusters and
                keywords below are derived from a model trained on approximately
                13,000 Philippine job postings. They represent skills that
                employers mentioned most frequently across different
                industries — not real-time job board data.
              </div>

              {!market || market.status === "no_model" ? (
                <div className="card" style={{ textAlign:"center", padding:60 }}>
                  <div style={{ fontFamily:"'DM Serif Display',serif",
                    fontSize:18, marginBottom:8 }}>
                    Analysis model not loaded
                  </div>
                  <p style={{ fontSize:13, color:T.inkMuted,
                    maxWidth:380, margin:"0 auto" }}>
                    Use the Refresh Analysis button above to load the model.
                  </p>
                </div>
              ) : (
                <>
                  <div className="card" style={{ marginBottom:20 }}>
                    <div style={{ display:"flex",
                      justifyContent:"space-between",
                      alignItems:"flex-start",
                      marginBottom:14, flexWrap:"wrap", gap:10 }}>
                      <div>
                        <div className="card-title">
                          Most In-Demand Skills Across Philippine Jobs
                        </div>
                        <p style={{ fontSize:12, color:T.inkMuted }}>
                          Skills that appeared most broadly across all job
                          domains, ranked by how consistently employers
                          mentioned them.
                        </p>
                      </div>
                      <button className="btn btn-secondary btn-sm"
                        onClick={exportMarket}>
                        Export
                      </button>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {(market.top_indemand || []).map((s, i) => (
                        <div key={s.skill} style={{
                          display:"flex", alignItems:"center", gap:8,
                          background: i < 3 ? T.accentSoft : T.bg,
                          border:`1px solid ${i < 3 ? T.accent : T.border}`,
                          borderRadius:8, padding:"6px 12px",
                        }}>
                          <span style={{ fontSize:11, fontWeight:700,
                            color: i < 3 ? T.accent : T.inkMuted,
                            minWidth:18, textAlign:"center" }}>
                            {i + 1}
                          </span>
                          <span style={{ fontSize:13,
                            fontWeight: i < 3 ? 700 : 500,
                            color:T.ink, textTransform:"capitalize" }}>
                            {s.skill}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Job Market Skill Clusters</div>
                    <p style={{ fontSize:12, color:T.inkMuted,
                      marginBottom:16 }}>
                      Each cluster represents a group of related skills that
                      Philippine employers commonly require together.
                    </p>
                    <div style={{
                      display:"grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(260px, 1fr))",
                      gap:12,
                    }}>
                      {(market.skill_clusters || []).map((c, i) => (
                        <div key={c.topic_id} style={{
                          background:T.bg, borderRadius:10,
                          padding:"12px 14px",
                          border:`1px solid ${T.border}`,
                          borderLeft:`4px solid ${COLORS[i % COLORS.length]}`,
                        }}>
                          <div style={{ display:"flex",
                            justifyContent:"space-between",
                            alignItems:"center", marginBottom:8 }}>
                            <div style={{ fontWeight:700, fontSize:13,
                              color:COLORS[i % COLORS.length] }}>
                              {c.label}
                            </div>
                            <span style={{ fontSize:11,
                              color:T.inkMuted, fontWeight:600 }}>
                              {Math.round(c.prominence * 100)}%
                            </span>
                          </div>
                          <div style={{ display:"flex",
                            flexWrap:"wrap", gap:4 }}>
                            {(c.top_skills || []).map(w => (
                              <span key={w} className="pill pill-neutral"
                                style={{ fontSize:10,
                                  textTransform:"capitalize" }}>
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:16, fontSize:11,
                      color:T.inkMuted, fontStyle:"italic" }}>
                      Model trained on{" "}
                      {market.n_features?.toLocaleString() || "—"} unique
                      skill terms across {market.n_topics || "—"} job
                      market domains.
                      Source: {market.model_source || "Philippine job postings"}.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}
