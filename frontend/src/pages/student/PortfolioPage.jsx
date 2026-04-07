// pages/student/PortfolioPage.jsx

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { SkillPillGroup, Spinner } from "../../components/UI";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell,
} from "recharts";

const TOPIC_COLORS = [
  T.accent, T.green, T.yellow, "#7C5CBF", "#1A8CA0",
  "#E07B39", "#2D7A4F", "#B07D1A", "#B53A2F", "#555",
];

function shortLabel(label) {
  return label.split(" & ")[0].trim().split(" ").slice(0, 2).join(" ");
}

export default function PortfolioPage({ user }) {
  const [profile,     setProfile]    = useState(null);
  const [editing,     setEditing]    = useState(false);
  const [recs,        setRecs]       = useState(null);
  const [recsError,   setRecsError]  = useState(null);
  const [loadingRecs, setLoadingRecs]= useState(false);
  const [busy,        setBusy]       = useState(false);
  const [err,         setErr]        = useState(null);
  const [success,     setSuccess]    = useState(null);
  const [newSkill,    setNewSkill]   = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", bio: "",
    current_job: "", current_employer: "",
    linkedin_url: "", contact_number: "",
    program: "", major: "",
    skills_self_reported: [],
  });

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      const p = await api.getMe();
      setProfile(p);
      setForm({
        first_name:           p.first_name           || "",
        last_name:            p.last_name            || "",
        bio:                  p.bio                  || "",
        current_job:          p.current_job          || "",
        current_employer:     p.current_employer     || "",
        linkedin_url:         p.linkedin_url         || "",
        contact_number:       p.contact_number       || "",
        program:              p.program              || "",
        major:                p.major                || "",
        skills_self_reported: p.skills_self_reported || [],
      });
      // fire both requests in parallel — neither blocks the other
      fetchRecs(p.program, p.major || "");
    } catch (e) {
      setErr("Could not load profile: " + e.message);
    }
  }

  async function fetchRecs(program, major) {
    if (!program) return;
    setLoadingRecs(true);
    setRecs(null);
    setRecsError(null);
    try {
      const data = await api.getRecommendations(program, major);
      setRecs(data);
    } catch (e) {
      setRecsError(e.message);
    } finally {
      setLoadingRecs(false);
    }
  }

  async function saveProfile() {
    setBusy(true); setErr(null); setSuccess(null);
    try {
      const updated = await api.updateMe({ ...form, major: form.major.trim() || null });
      setProfile(updated);
      setEditing(false);
      setSuccess("Profile updated.");
      fetchRecs(updated.program, updated.major || "");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function addSkill() {
    const s = newSkill.trim();
    if (s && !form.skills_self_reported.includes(s))
      setForm(f => ({ ...f, skills_self_reported: [...f.skills_self_reported, s] }));
    setNewSkill("");
  }

  function removeSkill(s) {
    setForm(f => ({ ...f, skills_self_reported: f.skills_self_reported.filter(x => x !== s) }));
  }

  // Chart data — computed only when recs exists
  const barData = recs
    ? [...(recs.skill_topics || [])]
        .sort((a, b) => b.score - a.score)
        .map(t => ({ label: shortLabel(t.label), score: Math.round(t.score * 100), full: t.label }))
    : [];

  const radarData = recs
    ? (recs.skill_topics || [])
        .filter(t => t.score > 0.01)
        .map(t => ({ topic: shortLabel(t.label), score: Math.round(t.score * 100), full: t.label }))
    : [];

  if (!profile) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
      <Spinner dark />
    </div>
  );

  return (
    <div className="fade-up">
      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">My Portfolio</h1>
          <p className="page-sub">Your professional profile and LDA-powered skills analysis</p>
        </div>
        <button className="btn btn-secondary"
          onClick={() => { setEditing(e => !e); setErr(null); setSuccess(null); }}>
          {editing ? "✕ Cancel" : "✏ Edit Profile"}
        </button>
      </div>

      {err     && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="grid-2 section" style={{ alignItems: "start" }}>

        {/* ── LEFT: Profile + Alignment ── */}
        <div>
          <div className="card section">
            {editing ? (
              <>
                <div className="card-title">Edit Profile</div>

                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:"uppercase",
                  letterSpacing:".8px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                  Personal
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">First Name</label>
                    <input className="form-input" value={form.first_name}
                      onChange={e => setForm(f => ({...f, first_name: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Last Name</label>
                    <input className="form-input" value={form.last_name}
                      onChange={e => setForm(f => ({...f, last_name: e.target.value}))} /></div>
                </div>
                <div className="form-group"><label className="form-label">Bio</label>
                  <textarea className="form-textarea" placeholder="Tell us about yourself…"
                    value={form.bio} onChange={e => setForm(f => ({...f, bio: e.target.value}))} /></div>

                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:"uppercase",
                  letterSpacing:".8px", margin:"6px 0 10px", paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                  Academic
                </div>
                <div className="form-group"><label className="form-label">Degree Program</label>
                  <input className="form-input" placeholder="e.g. BS Computer Science"
                    value={form.program} onChange={e => setForm(f => ({...f, program: e.target.value}))} /></div>
                <div className="form-group">
                  <label className="form-label">Major / Specialization
                    <span style={{ color:T.inkMuted, fontWeight:400, marginLeft:4 }}>(optional)</span>
                  </label>
                  <input className="form-input"
                    placeholder="e.g. Data Science, Network Security…"
                    value={form.major} onChange={e => setForm(f => ({...f, major: e.target.value}))} />
                  <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>
                    Adding your specialization improves skill recommendations.
                  </div>
                </div>

                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:"uppercase",
                  letterSpacing:".8px", margin:"6px 0 10px", paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                  Professional
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Job Title</label>
                    <input className="form-input" value={form.current_job}
                      onChange={e => setForm(f => ({...f, current_job: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Employer</label>
                    <input className="form-input" value={form.current_employer}
                      onChange={e => setForm(f => ({...f, current_employer: e.target.value}))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">LinkedIn URL</label>
                    <input className="form-input" placeholder="https://linkedin.com/in/…"
                      value={form.linkedin_url}
                      onChange={e => setForm(f => ({...f, linkedin_url: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Contact</label>
                    <input className="form-input" value={form.contact_number}
                      onChange={e => setForm(f => ({...f, contact_number: e.target.value}))} /></div>
                </div>

                <div className="form-group">
                  <label className="form-label">My Skills</label>
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    <input className="form-input" style={{ flex:1 }} placeholder="Add a skill…"
                      value={newSkill} onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSkill()} />
                    <button className="btn btn-secondary btn-sm" onClick={addSkill}>Add</button>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {form.skills_self_reported.map(s => (
                      <span key={s} className="pill pill-match" style={{ cursor:"pointer" }}
                        onClick={() => removeSkill(s)}>{s} ✕</span>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
                  {busy ? <><div className="spinner"/>Saving…</> : "Save Profile"}
                </button>
              </>
            ) : (
              <>
                <div style={{ display:"flex", gap:16, alignItems:"flex-start", marginBottom:20 }}>
                  <div style={{
                    width:64, height:64, borderRadius:"50%", background:T.accentSoft,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:24, fontFamily:"'DM Serif Display',serif",
                    color:T.accent, flexShrink:0,
                  }}>
                    {profile.first_name?.[0]}{profile.last_name?.[0]}
                  </div>
                  <div>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20 }}>
                      {profile.first_name} {profile.last_name}
                    </div>
                    {profile.current_job && (
                      <div style={{ fontSize:13, color:T.inkMuted, marginTop:2 }}>
                        {profile.current_job}{profile.current_employer ? ` · ${profile.current_employer}` : ""}
                      </div>
                    )}
                    <div style={{ fontSize:12, color:T.inkMuted, marginTop:4 }}>{profile.email}</div>
                  </div>
                </div>

                {profile.bio && (
                  <p style={{ fontSize:13, color:T.inkMuted, lineHeight:1.7, marginBottom:16 }}>{profile.bio}</p>
                )}

                <hr className="divider" />

                <div style={{ display:"flex", flexDirection:"column", gap:8, fontSize:13 }}>
                  {[
                    { label:"Program",               value: profile.program },
                    { label:"Major / Specialization", value: profile.major },
                    { label:"Graduation Year",        value: profile.graduation_year },
                    { label:"Student ID",             value: profile.student_id },
                    { label:"Contact",                value: profile.contact_number },
                    { label:"LinkedIn",               value: profile.linkedin_url, link: true },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                      <span style={{ color:T.inkMuted, flexShrink:0 }}>{r.label}</span>
                      {r.link
                        ? <a href={r.value} target="_blank" rel="noreferrer"
                            style={{ color:T.accent, wordBreak:"break-all" }}>{r.value}</a>
                        : <span style={{ fontWeight:500 }}>{r.value}</span>
                      }
                    </div>
                  ))}
                </div>

                {profile.skills_self_reported?.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div className="form-label" style={{ marginBottom:8 }}>My Skills</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {profile.skills_self_reported.map(s => (
                        <span key={s} className="pill pill-match">{s}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>


        </div>

        {/* ── RIGHT: LDA Recommendations ── */}
        <div>
          <div className="card">
            <div className="card-title">Skill Recommendations</div>
            <p style={{ fontSize:13, color:T.inkMuted, marginBottom:16, lineHeight:1.6 }}>
              Based on your college program <strong>{profile.program || "degree"}</strong>
              {profile.major && <> — <strong>{profile.major}</strong></>}
              , here are the identified relevant skill domains.
            </p>

            {/* ── Loading ── */}
            {loadingRecs && (
              <div style={{ textAlign:"center", padding:40 }}>
                <Spinner dark />
                <div style={{ marginTop:12, color:T.inkMuted, fontSize:13 }}>
                  Analyzing your program…
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {!loadingRecs && recsError && (
              <div className="alert alert-error">
                Could not load recommendations: {recsError}
              </div>
            )}

            {/* ── No program set ── */}
            {!loadingRecs && !recsError && !recs && (
              <div className="empty">
                <div className="empty-icon"></div>
                <div>Set your degree program in your profile to get recommendations.</div>
              </div>
            )}

            {/* ── Charts + content ── */}
            {!loadingRecs && recs && (
              <>
                {/* Bar chart — explicit fixed dimensions, no ResponsiveContainer */}
                {barData.length > 0 && (
                  <div style={{ marginBottom:24 }}>
                    <div className="form-label" style={{ marginBottom:10 }}>
                      Skill Domain Profile
                    </div>
                    <BarChart
                      width={380}
                      height={barData.length * 42 + 40}
                      data={barData}
                      layout="vertical"
                      margin={{ top:4, right:32, bottom:4, left:4 }}
                    >
                      <XAxis type="number" domain={[0, 100]}
                        tickFormatter={v => v + "%"} tick={{ fontSize:11 }} />
                      <YAxis type="category" dataKey="label"
                        width={125} tick={{ fontSize:11 }} />
                      <Tooltip
                        formatter={v => [`${v}%`, "Relevance"]}
                        labelFormatter={(_, p) => p?.[0]?.payload?.full || ""}
                      />
                      <Bar dataKey="score" radius={[0,4,4,0]} maxBarSize={22}>
                        {barData.map((_, i) => (
                          <Cell key={i} fill={TOPIC_COLORS[i % TOPIC_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </div>
                )}

                {/* Radar chart — explicit fixed dimensions, no ResponsiveContainer */}
                {radarData.length >= 3 && (
                  <div style={{ marginBottom:24 }}>
                    <div className="form-label" style={{ marginBottom:10 }}>
                      Domain Radar
                    </div>
                    <RadarChart
                      width={380}
                      height={280}
                      data={radarData}
                    >
                      <PolarGrid stroke={T.border} />
                      <PolarAngleAxis
                        dataKey="topic"
                        tick={{ fontSize:11, fill:T.inkMuted }}
                      />
                      <PolarRadiusAxis
                        angle={30}
                        domain={[0, 100]}
                        tick={{ fontSize:9, fill:T.inkMuted }}
                        tickFormatter={v => v + "%"}
                      />
                      <Radar
                        name="Relevance"
                        dataKey="score"
                        fill={T.accent}
                        fillOpacity={0.25}
                        stroke={T.accent}
                        strokeWidth={2}
                        dot={{ fill:T.accent, r:4 }}
                      />
                      <Tooltip
                        formatter={v => [`${v}%`, "Relevance"]}
                        labelFormatter={(_, p) => p?.[0]?.payload?.full || ""}
                      />
                    </RadarChart>
                  </div>
                )}

                {/* Categorized skill recommendations */}
                <div className="form-label" style={{ marginBottom:10 }}>
                  Recommended Skills
                </div>
                {(() => {
                  const owned = new Set((profile.skills_self_reported || []).map(x => x.toLowerCase()));
                  const tagged = recs.tagged_skills || (recs.recommended_skills || []).map(s => ({ skill: s, category: "domain" }));
                  const groups = { technical: [], tool: [], soft: [], domain: [] };
                  tagged.forEach(t => (groups[t.category] || groups.domain).push(t.skill));
                  const CAT_CONFIG = {
                    technical: { label: "Technical Skills", pill: "pill-topic" },
                    tool:      { label: "Tools & Platforms", pill: "pill-surplus" },
                    soft:      { label: "Soft Skills",      pill: "pill-match" },
                    domain:    { label: "Domain Knowledge", pill: "pill-neutral" },
                  };
                  return Object.entries(CAT_CONFIG)
                    .filter(([cat]) => groups[cat]?.length > 0)
                    .map(([cat, cfg]) => (
                      <div key={cat} style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted,
                          textTransform:"uppercase", letterSpacing:".6px", marginBottom:6 }}>
                          {cfg.label}
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {groups[cat].map(s => {
                            const isOwned = owned.has(s.toLowerCase());
                            return (
                              <span key={s}
                                className={`pill ${isOwned ? "pill-match" : cfg.pill}`}
                                title={isOwned ? "You already have this skill" : "Recommended to develop"}>
                                {isOwned ? "✓ " : ""}{s}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ));
                })()}

                {/* Topic cards */}
                <div className="form-label" style={{ marginBottom:8 }}>Top Skill Domains</div>
                {(recs.skill_topics || []).map((t, i) => (
                  <div key={t.topic_id} style={{
                    marginBottom:10, background:T.bg, borderRadius:8,
                    padding:"10px 12px", border:`1px solid ${T.border}`,
                    borderLeft:`3px solid ${TOPIC_COLORS[i % TOPIC_COLORS.length]}`,
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center", marginBottom:6 }}>
                      <div style={{ fontWeight:600, fontSize:13,
                        color:TOPIC_COLORS[i % TOPIC_COLORS.length] }}>{t.label}</div>
                      <span style={{ fontSize:11, color:T.inkMuted }}>
                        {Math.round(t.score * 100)}% relevance
                      </span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {(t.top_words || []).slice(0, 7).map(w => (
                        <span key={w} className="pill pill-neutral">{w}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
