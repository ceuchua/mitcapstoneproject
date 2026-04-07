// pages/admin/SkillTrendsPage.jsx
// LDA-powered industry skill trend analysis for admins

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell,
} from "recharts";

export default function SkillTrendsPage() {
  const [trends, setTrends]       = useState(null);
  const [topics, setTopics]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [retResult, setRetResult] = useState(null);
  const [tab, setTab]             = useState("domains");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, tp] = await Promise.all([api.getSkillTrends(), api.getLdaTopics()]);
      setTrends(t);
      setTopics(tp.topics || []);
    } catch (e) {
      setTrends({ status: "error", message: e.message });
    } finally { setLoading(false); }
  }

  async function retrain() {
    setRetraining(true); setRetResult(null);
    try {
      const r = await api.reloadModel();
      setRetResult(r);
      await load();
    } catch (e) { setRetResult({ status: "error", reason: e.message }); }
    finally { setRetraining(false); }
  }

  function exportCSV(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
    </div>
  );

  const domainData = (trends?.top_skill_domains || []).map(d => ({
    label: d.label.split(" & ")[0],
    prevalence: Math.round(d.prevalence * 100),
    full: d.label,
  }));

  const skillData = (trends?.top_skills_overall || []).slice(0, 12)
    .map(s => ({ skill: s.skill.length > 20 ? s.skill.slice(0, 18) + "…" : s.skill, count: s.count, full: s.skill }));

  const radarData = domainData.slice(0, 6);

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Industry Skill Trends</h1>
          <p className="page-sub">Domains, skills, and topics across all graduate employment records</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(trends, "skill_trends.json")}>⬇ Export</button>
          <button className="btn btn-primary btn-sm" onClick={retrain} disabled={retraining}>
            {retraining ? <><div className="spinner" />Reloading…</> : "Reload Model"}
          </button>
        </div>
      </div>

      {retResult && (
        <div className={`alert ${retResult.status === "ok" ? "alert-success" : "alert-error"}`} style={{ marginBottom: 20 }}>
          {retResult.status === "ok"
            ? `✓ Model retrained on ${retResult.n_texts} job texts.`
            : retResult.reason || "Retraining failed."}
        </div>
      )}

      {trends?.status === "no_data" ? (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h3 style={{ marginBottom: 8 }}>No Employment Data Yet</h3>
          <p style={{ color: T.inkMuted, fontSize: 13, maxWidth: 400, margin: "0 auto" }}>
            Industry skill trends will appear here once graduates complete the tracer study and submit employment information.
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid-3 section">
            {[
              { label: "Records Analyzed", value: trends?.n_records_analyzed ?? 0,},
              { label: "Skill Domains",    value: trends?.top_skill_domains?.length ?? 0,},
              { label: "Unique Skills",    value: trends?.top_skills_overall?.length ?? 0,},
            ].map(s => (
              <div className="stat-tile" key={s.label}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="tabs">
            {["domains", "skills", "topics"].map(t => (
              <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>

          {tab === "domains" && (
            <div className="grid-2 section">
              <div className="card">
                <div className="card-title">Skill Domain Prevalence</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={domainData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tickFormatter={v => v + "%"} hide />
                    <YAxis dataKey="label" type="category" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => v + "%"} labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""} />
                    <Bar dataKey="prevalence" fill={T.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <div className="card-title">Skill Domain Radar</div>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke={T.border} />
                    <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <Radar dataKey="prevalence" fill={T.accent} fillOpacity={0.25} stroke={T.accent} strokeWidth={2} />
                    <Tooltip formatter={v => v + "%"} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Domain breakdown */}
              <div className="card" style={{ gridColumn: "1/-1" }}>
                <div className="card-title">Top Skills by Domain</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                  {(trends?.top_skill_domains || []).slice(0, 6).map(d => (
                    <div key={d.topic_id} style={{ background: T.bg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: T.accent, marginBottom: 4 }}>
                        {Math.round(d.prevalence * 100)}% prevalence
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{d.label}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {d.top_words.slice(0, 6).map(w => (
                          <span key={w} className="pill pill-neutral">{w}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "skills" && (
            <div className="card section">
              <div className="card-title">Most In-Demand Skills (All Industries)</div>
              {skillData.length === 0
                ? <div className="empty">No skill data yet.</div>
                : <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={skillData} layout="vertical" margin={{ left: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="skill" type="category" width={160} tick={{ fontSize: 12 }} />
                      <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""} />
                      <Bar dataKey="count" fill={T.green} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>
          )}

          {tab === "topics" && (
            <div className="card section">
              <div className="card-title">Current LDA Topic Vocabulary</div>
              <p style={{ fontSize: 13, color: T.inkMuted, marginBottom: 16 }}>
                These are the skill clusters the LDA model has learned. After retraining on real data, review and relabel these topics in <code>lda_model.py</code>.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
                {topics.map(t => (
                  <div key={t.topic_id} style={{ background: T.bg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.label}</div>
                      <span className="pill pill-neutral">#{t.topic_id}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {t.top_words.slice(0, 7).map(w => <span key={w} className="pill pill-neutral">{w}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
