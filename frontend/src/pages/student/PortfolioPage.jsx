// pages/student/PortfolioPage.jsx
// LinkedIn-style profile + LDA skill recommendations

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { SkillPillGroup, AlignmentGauge, Spinner } from "../../components/UI";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function PortfolioPage({ user }) {
  const [profile, setProfile]       = useState(null);
  const [editing, setEditing]       = useState(false);
  const [recommendations, setRecs]  = useState(null);
  const [empRecord, setEmpRecord]   = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [err, setErr]               = useState(null);
  const [success, setSuccess]       = useState(null);
  const [newSkill, setNewSkill]     = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", bio: "", current_job: "",
    current_employer: "", linkedin_url: "", contact_number: "",
    skills_self_reported: [],
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const p = await api.getMe();
      setProfile(p);
      setForm({
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        bio: p.bio || "",
        current_job: p.current_job || "",
        current_employer: p.current_employer || "",
        linkedin_url: p.linkedin_url || "",
        contact_number: p.contact_number || "",
        skills_self_reported: p.skills_self_reported || [],
      });
      // Load LDA recommendations based on program
      if (p.program) loadRecommendations(p.program);
      // Load their employment record if any
      try {
        const emp = await api.getEmployment();
        const mine = emp.find ? emp : [];
        if (Array.isArray(mine)) {
          const myRec = mine.find(r => r.graduate_id === p.user_id);
          if (myRec) setEmpRecord(myRec);
        }
      } catch (_) {}
    } catch (e) { setErr(e.message); }
  }

  async function loadRecommendations(program) {
    setLoadingRecs(true);
    try {
      const recs = await api.getRecommendations(program);
      setRecs(recs);
    } catch (_) {}
    finally { setLoadingRecs(false); }
  }

  async function saveProfile() {
    setBusy(true); setErr(null); setSuccess(null);
    try {
      const updated = await api.updateMe(form);
      setProfile(updated);
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function addSkill() {
    const s = newSkill.trim();
    if (s && !form.skills_self_reported.includes(s)) {
      setForm(f => ({ ...f, skills_self_reported: [...f.skills_self_reported, s] }));
    }
    setNewSkill("");
  }

  function removeSkill(s) {
    setForm(f => ({ ...f, skills_self_reported: f.skills_self_reported.filter(x => x !== s) }));
  }

  const radarData = recommendations?.skill_topics?.map(t => ({
    topic: t.label.split(" & ")[0].split(" ")[0],
    score: Math.round(t.score * 100),
  })) || [];

  if (!profile) return (
    <div className="fade-up" style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Spinner dark />
    </div>
  );

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">My Portfolio</h1>
          <p className="page-sub">Your professional profile and skills analysis</p>
        </div>
        <button className="btn btn-secondary" onClick={() => { setEditing(e => !e); setErr(null); setSuccess(null); }}>
          {editing ? "✕ Cancel" : "✏ Edit Profile"}
        </button>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="grid-2 section" style={{ alignItems: "start" }}>
        {/* ── Profile Card ── */}
        <div>
          <div className="card section">
            {editing ? (
              <>
                <div className="card-title">Edit Profile</div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">First Name</label>
                    <input className="form-input" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                  </div>
                  <div className="form-group"><label className="form-label">Last Name</label>
                    <input className="form-input" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Bio</label>
                  <textarea className="form-textarea" placeholder="Tell us about yourself…" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Current Job Title</label>
                    <input className="form-input" value={form.current_job} onChange={e => setForm(f => ({ ...f, current_job: e.target.value }))} />
                  </div>
                  <div className="form-group"><label className="form-label">Current Employer</label>
                    <input className="form-input" value={form.current_employer} onChange={e => setForm(f => ({ ...f, current_employer: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">LinkedIn URL</label>
                    <input className="form-input" placeholder="https://linkedin.com/in/..." value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} />
                  </div>
                  <div className="form-group"><label className="form-label">Contact Number</label>
                    <input className="form-input" value={form.contact_number} onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} />
                  </div>
                </div>

                {/* Skills */}
                <div className="form-group">
                  <label className="form-label">My Skills</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="Add a skill…"
                      value={newSkill} onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSkill()} />
                    <button className="btn btn-secondary btn-sm" onClick={addSkill}>Add</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {form.skills_self_reported.map(s => (
                      <span key={s} className="pill pill-match" style={{ cursor: "pointer" }}
                        onClick={() => removeSkill(s)}>{s} ✕</span>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
                  {busy ? <><div className="spinner" />Saving…</> : "Save Profile"}
                </button>
              </>
            ) : (
              <>
                {/* Profile view */}
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: T.accentSoft, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 24, fontFamily: "'DM Serif Display',serif",
                    color: T.accent, flexShrink: 0,
                  }}>
                    {profile.first_name?.[0]}{profile.last_name?.[0]}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>
                      {profile.first_name} {profile.last_name}
                    </div>
                    {profile.current_job && (
                      <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 2 }}>
                        {profile.current_job}{profile.current_employer ? ` · ${profile.current_employer}` : ""}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 4 }}>{profile.email}</div>
                  </div>
                </div>

                {profile.bio && (
                  <p style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.7, marginBottom: 16 }}>{profile.bio}</p>
                )}

                <hr className="divider" />

                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  {[
                    { label: "Program",         value: profile.program },
                    { label: "Graduation Year",  value: profile.graduation_year },
                    { label: "Student ID",       value: profile.student_id },
                    { label: "Contact",          value: profile.contact_number },
                    { label: "LinkedIn",         value: profile.linkedin_url, link: true },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: T.inkMuted }}>{r.label}</span>
                      {r.link
                        ? <a href={r.value} target="_blank" rel="noreferrer" style={{ color: T.accent }}>{r.value}</a>
                        : <span style={{ fontWeight: 500 }}>{r.value}</span>
                      }
                    </div>
                  ))}
                </div>

                {profile.skills_self_reported?.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div className="form-label" style={{ marginBottom: 8 }}>My Skills</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {profile.skills_self_reported.map(s => (
                        <span key={s} className="pill pill-match">{s}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Alignment card (if they have employment record) */}
          {empRecord && (
            <div className="card">
              <div className="card-title">Skills Alignment</div>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <AlignmentGauge score={empRecord.alignment_score ?? 0} />
                <div style={{ flex: 1 }}>
                  <SkillPillGroup skills={empRecord.gap_skills}     variant="gap"   label="⚠ Skills to Develop" />
                  <SkillPillGroup skills={empRecord.skills_in_job?.slice(0, 6)} variant="match" label="✓ Skills You're Using" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── LDA Recommendations ── */}
        <div>
          <div className="card section">
            <div className="card-title">🎯 Recommended Skills for You</div>
            <p style={{ fontSize: 13, color: T.inkMuted, marginBottom: 16, lineHeight: 1.6 }}>
              Based on your <strong>{profile.program}</strong> degree, the LDA model recommends developing these skills to stay competitive in the job market.
            </p>

            {loadingRecs ? (
              <div className="empty"><Spinner dark /><div style={{ marginTop: 10 }}>Analyzing your program…</div></div>
            ) : recommendations ? (
              <>
                {/* Skill domain radar */}
                {radarData.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="form-label" style={{ marginBottom: 8 }}>Skill Domain Profile</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke={T.border} />
                        <PolarAngleAxis dataKey="topic" tick={{ fontSize: 10 }} />
                        <Radar dataKey="score" fill={T.accent} fillOpacity={0.2} stroke={T.accent} strokeWidth={2} />
                        <Tooltip formatter={v => v + "%"} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="form-label" style={{ marginBottom: 8 }}>Recommended Skills</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {recommendations.recommended_skills.map(s => {
                    const owned = profile.skills_self_reported?.map(x => x.toLowerCase()).includes(s.toLowerCase());
                    return (
                      <span key={s} className={`pill ${owned ? "pill-match" : "pill-topic"}`}>
                        {owned ? "✓ " : ""}{s}
                      </span>
                    );
                  })}
                </div>

                <div className="form-label" style={{ marginBottom: 8 }}>Top Skill Domains for {profile.program}</div>
                {recommendations.skill_topics.map(t => (
                  <div key={t.topic_id} style={{ marginBottom: 10, background: T.bg, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: T.accent }}>{t.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {t.top_words.slice(0, 6).map(w => <span key={w} className="pill pill-neutral">{w}</span>)}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="empty"><div className="empty-icon">🤖</div>Could not load recommendations.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
