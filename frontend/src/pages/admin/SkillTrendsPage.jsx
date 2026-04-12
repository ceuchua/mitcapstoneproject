// pages/admin/SkillTrendsPage.jsx
// Skill trends dashboard — redesigned for non-technical admin users

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

const DOMAIN_COLORS = [
  T.accent, T.green, "#7C5CBF", "#1A8CA0", "#E07B39", "#B07D1A",
  "#2D7A4F", "#B53A2F", "#555", "#1A8CA0",
];

function exportCSV(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })),
    download: filename,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export default function SkillTrendsPage() {
  const [trends,     setTrends]     = useState(null);
  const [market,     setMarket]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [reloading,  setReloading]  = useState(false);
  const [reloadMsg,  setReloadMsg]  = useState(null);
  const [tab,        setTab]        = useState("domains");
  const [loadedAt,   setLoadedAt]   = useState(null);

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
        ok: r.status === "ok",
        text: r.status === "ok"
          ? `Skill analysis model updated successfully — ${r.n_topics || ""} skill areas loaded.`
          : "Model could not be updated. Please contact your system administrator.",
      });
      if (r.status === "ok") await load();
    } catch (e) {
      setReloadMsg({ ok: false, text: "Update failed: " + e.message });
    } finally {
      setReloading(false);
    }
  }

  function exportDomains() {
    const rows = (trends?.top_skill_domains || []).map(d => ({
      "Skill Area":  d.label,
      "Prominence %": Math.round(d.prevalence * 100),
      "Top Keywords": (d.top_words || []).slice(0, 6).join(", "),
    }));
    exportCSV(rows, "skill_areas.csv");
  }

  function exportSkills() {
    const rows = (trends?.top_skills_overall || []).map(s => ({
      "Skill":   s.skill,
      "Mentions": s.count,
    }));
    exportCSV(rows, "top_skills.csv");
  }

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:80 }}>
      <div className="spinner spinner-dark" style={{ width:32, height:32 }} />
    </div>
  );

  // ── Derived chart data ─────────────────────────────────────────────────────

  const domainData = (trends?.top_skill_domains || []).map((d, i) => ({
    label:      d.label.split(/[,&]/)[0].trim().split(" ").slice(0,2).join(" "),
    full:       d.label,
    prevalence: Math.round(d.prevalence * 100),
    color:      DOMAIN_COLORS[i % DOMAIN_COLORS.length],
  }));

  const skillData = (trends?.top_skills_overall || []).slice(0, 15).map(s => ({
    skill: s.skill.length > 22 ? s.skill.slice(0, 20) + "…" : s.skill,
    full:  s.skill,
    count: s.count,
  }));

  const radarData = domainData.slice(0, 6);

  const nRecords   = trends?.n_records_analyzed ?? 0;
  const nDomains   = trends?.top_skill_domains?.length ?? 0;
  const nSkills    = trends?.top_skills_overall?.length ?? 0;
  const topDomain  = trends?.top_skill_domains?.[0]?.label ?? null;

  const hasData = trends?.status !== "no_data" && nRecords > 0;

  return (
    <div className="fade-up">

      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 className="page-title">Graduate Skills Analysis</h1>
          <p className="page-sub" style={{ marginBottom:0 }}>
            What skill areas and competencies are most common among your graduates.
            {loadedAt && (
              <span style={{ marginLeft:8, fontSize:11 }}>
                Last updated: {loadedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
              </span>
            )}
          </p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button className="btn btn-secondary btn-sm"
            onClick={handleReload} disabled={reloading}
            title="Refresh the skill analysis with the latest graduate data">
            {reloading
              ? <><div className="spinner" style={{ borderColor:"rgba(0,0,0,.15)", borderTopColor:T.accent }} />Updating…</>
              : "Refresh Analysis"}
          </button>
        </div>
      </div>

      {/* ── Reload result message ── */}
      {reloadMsg && (
        <div className={`alert ${reloadMsg.ok ? "alert-success" : "alert-error"}`}
          style={{ marginBottom:20 }}>
          {reloadMsg.text}
        </div>
      )}

      {/* ── No data state ── */}
      {!hasData ? (
        <div className="card" style={{ textAlign:"center", padding:60 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, marginBottom:8 }}>
            No Skill Data Yet
          </div>
          <p style={{ color:T.inkMuted, fontSize:13, maxWidth:420, margin:"0 auto", lineHeight:1.7 }}>
            Skill trends will appear here once graduates complete the tracer study and
            submit their employment information. The analysis is generated automatically
            from graduate responses.
          </p>
        </div>
      ) : (
        <>
          {/* ── Summary tiles ── */}
          <div className="grid-3 section">
            <div className="stat-tile">
              <div style={{ fontSize:20, marginBottom:4 }}></div>
              <div className="stat-value">{nRecords}</div>
              <div className="stat-label">Graduate Responses Analyzed</div>
            </div>
            <div className="stat-tile">
              <div style={{ fontSize:20, marginBottom:4 }}></div>
              <div className="stat-value">{nDomains}</div>
              <div className="stat-label">Skill Areas Identified</div>
            </div>
            <div className="stat-tile">
              <div style={{ fontSize:20, marginBottom:4 }}></div>
              <div className="stat-value">{nSkills}</div>
              <div className="stat-label">Unique Skills Mentioned</div>
            </div>
          </div>

          {/* ── Insight sentence ── */}
          {topDomain && (
            <div style={{
              background:T.surface, border:`1px solid ${T.border}`,
              borderRadius:12, padding:"14px 18px", marginBottom:20,
              fontSize:13, lineHeight:1.7,
            }}>
              📌 Based on <strong>{nRecords}</strong> graduate response{nRecords !== 1 ? "s" : ""},
              the most prominent skill area among your graduates is{" "}
              <strong style={{ color:T.accent }}>{topDomain}</strong>.
              {nDomains > 1 && (
                <> The analysis identified <strong>{nDomains}</strong> distinct skill areas across all employment records.</>
              )}
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="tabs">
            {[
              { id:"domains", label:"Skill Areas"       },
              { id:"skills",  label:"Top Skills"         },
              { id:"market",  label:"In-Demand Job Skills" },
            ].map(t => (
              <div key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </div>
            ))}
          </div>

          {/* ══ SKILL AREAS TAB ══════════════════════════════════════════════ */}
          {tab === "domains" && (
            <div className="section">
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                <p style={{ fontSize:13, color:T.inkMuted, maxWidth:560 }}>
                  Skill areas are clusters of related competencies found across all graduate
                  employment records. The percentage shows how prominent each area is
                  relative to the others.
                </p>
                <button className="btn btn-secondary btn-sm" onClick={exportDomains}>
                  ⬇ Export Skill Areas
                </button>
              </div>

              <div className="grid-2">
                {/* Bar chart */}
                <div className="card">
                  <div className="card-title">Skill Area Breakdown</div>
                  {domainData.length === 0 ? (
                    <div className="empty"><div className="empty-icon"></div>No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(200, domainData.length * 36 + 40)}>
                      <BarChart data={domainData} layout="vertical"
                        margin={{ left:4, right:40, top:4, bottom:4 }}>
                        <XAxis type="number" tickFormatter={v => v + "%"}
                          tick={{ fontSize:11 }} />
                        <YAxis type="category" dataKey="label"
                          width={135} tick={{ fontSize:11 }} />
                        <Tooltip
                          formatter={v => [v + "%", "Prominence"]}
                          labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                        <Bar dataKey="prevalence" radius={[0,4,4,0]} maxBarSize={22}>
                          {domainData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Radar */}
                {radarData.length >= 3 && (
                  <div className="card">
                    <div className="card-title">Skill Area Distribution</div>
                    <p style={{ fontSize:12, color:T.inkMuted, marginBottom:12 }}>
                      Shows the relative balance of skill areas across all graduates.
                    </p>
                    <div style={{ display:"flex", justifyContent:"center" }}>
                      <RadarChart width={320} height={260} data={radarData}>
                        <PolarGrid stroke={T.border} />
                        <PolarAngleAxis dataKey="label" tick={{ fontSize:10, fill:T.inkMuted }} />
                        <Radar dataKey="prevalence" fill={T.accent} fillOpacity={0.25}
                          stroke={T.accent} strokeWidth={2} />
                        <Tooltip
                          formatter={v => [v + "%", "Prominence"]}
                          labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                      </RadarChart>
                    </div>
                  </div>
                )}
              </div>

              {/* Domain keyword cards */}
              <div className="card" style={{ marginTop:20 }}>
                <div className="card-title">What Each Skill Area Covers</div>
                <p style={{ fontSize:12, color:T.inkMuted, marginBottom:16 }}>
                  Each skill area is represented by the most frequently occurring keywords
                  from graduate employment records.
                </p>
                <div style={{
                  display:"grid",
                  gridTemplateColumns:"repeat(auto-fill, minmax(250px, 1fr))",
                  gap:12,
                }}>
                  {(trends?.top_skill_domains || []).map((d, i) => (
                    <div key={d.topic_id} style={{
                      background:T.bg, borderRadius:10,
                      padding:"12px 14px",
                      border:`1px solid ${T.border}`,
                      borderLeft:`4px solid ${DOMAIN_COLORS[i % DOMAIN_COLORS.length]}`,
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"center", marginBottom:6 }}>
                        <div style={{ fontWeight:600, fontSize:13,
                          color: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}>
                          {d.label}
                        </div>
                        <span style={{ fontSize:11, color:T.inkMuted, fontWeight:600 }}>
                          {Math.round(d.prevalence * 100)}%
                        </span>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                        {(d.top_words || []).slice(0, 7).map(w => (
                          <span key={w} className="pill pill-neutral"
                            style={{ fontSize:10 }}>{w}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ TOP SKILLS TAB ═══════════════════════════════════════════════ */}
          {tab === "skills" && (
            <div className="card section">
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                <div>
                  <div className="card-title" style={{ marginBottom:4 }}>
                    Most Commonly Mentioned Skills
                  </div>
                  <p style={{ fontSize:12, color:T.inkMuted }}>
                    Skills most frequently selected or written by graduates in their
                    tracer study responses, ranked by how many graduates mentioned them.
                  </p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={exportSkills}>
                  ⬇ Export Skills List
                </button>
              </div>

              {skillData.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon"></div>
                  No skill data yet. Skills will appear once graduates submit their responses.
                </div>
              ) : (
                <ResponsiveContainer width="100%"
                  height={Math.max(200, skillData.length * 36 + 50)}>
                  <BarChart data={skillData} layout="vertical"
                    margin={{ left:8, right:48, top:4, bottom:4 }}>
                    <XAxis type="number" allowDecimals={false}
                      tick={{ fontSize:11 }} />
                    <YAxis type="category" dataKey="skill"
                      width={165} tick={{ fontSize:11 }} />
                    <Tooltip
                      formatter={v => [v, "Graduates mentioned"]}
                      labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} />
                    <Bar dataKey="count" radius={[0,4,4,0]} maxBarSize={22}>
                      {skillData.map((_, i) => (
                        <Cell key={i}
                          fill={i === 0 ? T.accent : i < 3 ? "#A52932" : T.green} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* ══ JOB MARKET TAB ═════════════════════════════════════════════ */}
          {tab === "market" && (
            <div className="section">

              {/* Disclaimer banner */}
              <div style={{
                background:"#FBF2DC", border:"1px solid #B07D1A",
                borderRadius:10, padding:"12px 16px", marginBottom:20,
                fontSize:12, color:"#5a4000", lineHeight:1.7,
              }}>
                <strong>📌 About this data:</strong> The skill clusters and keywords below
                are derived from the approximately 13,000 Philippine
                job postings. They represent skills that employers mentioned most frequently
                across different industries — not real-time job board data.
              </div>

              {!market || market.status === "no_model" ? (
                <div className="card empty" style={{ padding:60 }}>
                  <div className="empty-icon"></div>
                  <div style={{ fontWeight:600, marginBottom:8 }}>
                    Skill analysis model not loaded
                  </div>
                  <p style={{ fontSize:13, color:T.inkMuted, maxWidth:380, margin:"0 auto" }}>
                    The job market skill data comes from the trained model.
                    Use the Refresh Analysis button above to load it.
                  </p>
                </div>
              ) : (
                <>
                  {/* Top in-demand skills bar chart */}
                  <div className="card" style={{ marginBottom:20 }}>
                    <div className="card-title">Most In-Demand Skills Across Philippine Jobs</div>
                    <p style={{ fontSize:12, color:T.inkMuted, marginBottom:16 }}>
                      Skills that appeared most broadly across all job domains in the training dataset,
                      ranked by how consistently they were mentioned across different industries.
                    </p>
                    {(market.top_indemand || []).length === 0 ? (
                      <div className="empty">No data available.</div>
                    ) : (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {(market.top_indemand || []).map((s, i) => (
                          <div key={s.skill} style={{
                            display:"flex", alignItems:"center", gap:8,
                            background: i < 3 ? T.accentSoft : T.bg,
                            border:`1px solid ${i < 3 ? T.accent : T.border}`,
                            borderRadius:8, padding:"6px 12px",
                          }}>
                            <span style={{
                              fontSize:11, fontWeight:700,
                              color: i < 3 ? T.accent : T.inkMuted,
                              minWidth:18, textAlign:"center",
                            }}>
                              {i + 1}
                            </span>
                            <span style={{
                              fontSize:13, fontWeight: i < 3 ? 700 : 500,
                              color: T.ink, textTransform:"capitalize",
                            }}>
                              {s.skill}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Skill clusters from job postings */}
                  <div className="card">
                    <div className="card-title">Job Market Skill Clusters</div>
                    <p style={{ fontSize:12, color:T.inkMuted, marginBottom:16 }}>
                      Each cluster below represents a group of related skills that
                      Philippine employers commonly require together. The percentage
                      shows how prominent that cluster is across all job postings analyzed.
                    </p>
                    <div style={{
                      display:"grid",
                      gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",
                      gap:12,
                    }}>
                      {(market.skill_clusters || []).map((c, i) => (
                        <div key={c.topic_id} style={{
                          background:T.bg, borderRadius:10,
                          padding:"12px 14px",
                          border:`1px solid ${T.border}`,
                          borderLeft:`4px solid ${DOMAIN_COLORS[i % DOMAIN_COLORS.length]}`,
                        }}>
                          <div style={{ display:"flex", justifyContent:"space-between",
                            alignItems:"center", marginBottom:8 }}>
                            <div style={{
                              fontWeight:700, fontSize:13,
                              color:DOMAIN_COLORS[i % DOMAIN_COLORS.length],
                            }}>
                              {c.label}
                            </div>
                            <span style={{ fontSize:11, color:T.inkMuted, fontWeight:600 }}>
                              {Math.round(c.prominence * 100)}%
                            </span>
                          </div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                            {(c.top_skills || []).map(w => (
                              <span key={w} className="pill pill-topic"
                                style={{ fontSize:10, textTransform:"capitalize" }}>
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:16, fontSize:11, color:T.inkMuted, fontStyle:"italic" }}>
                      Model trained on {market.n_features?.toLocaleString() || "—"} unique
                      skill terms across {market.n_topics || "—"} job market domains.
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
