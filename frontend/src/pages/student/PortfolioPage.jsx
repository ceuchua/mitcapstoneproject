// pages/student/PortfolioPage.jsx

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { SkillPillGroup, Spinner } from "../../components/UI";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip,
} from "recharts";

const TOPIC_COLORS = [
  T.accent, T.green, T.yellow, "#7C5CBF", "#1A8CA0",
  "#E07B39", "#2D7A4F", "#B07D1A", "#B53A2F", "#555",
];

// ── Job role suggestions per LDA topic label (non-clickable, visual only) ──
// Keys match the exact topic_labels strings from lda_model.joblib.
const JOB_SUGGESTIONS = {
  "Healthcare and Medical": [
    { title: "Registered Nurse",         desc: "Patient care, clinical documentation, health assessment" },
    { title: "Medical Technologist",      desc: "Laboratory analysis, diagnostic testing, specimen processing" },
    { title: "Physical Therapist",        desc: "Rehabilitation programs, patient recovery, therapeutic exercises" },
    { title: "Health Information Manager",desc: "Medical records, health data management, compliance" },
    { title: "Pharmacist",                desc: "Drug dispensing, patient counseling, medication management" },
  ],
  "Business Governance": [
    { title: "Compliance Officer",  desc: "Regulatory compliance, policy implementation, risk monitoring" },
    { title: "Internal Auditor",    desc: "Financial audits, process review, risk assessment" },
    { title: "Corporate Secretary", desc: "Board governance, legal compliance, corporate records" },
    { title: "Operations Manager",  desc: "Business operations, process improvement, team supervision" },
    { title: "Management Analyst",  desc: "Organizational efficiency, workflow optimization, reporting" },
  ],
  "Information Technology": [
    { title: "Software Developer",    desc: "Application development, coding, system design" },
    { title: "IT Support Specialist", desc: "Technical troubleshooting, hardware/software support, helpdesk" },
    { title: "Network Administrator", desc: "Network infrastructure, server management, cybersecurity" },
    { title: "Systems Analyst",       desc: "Requirements analysis, system design, process documentation" },
    { title: "Web Developer",         desc: "Frontend/backend development, UI design, database integration" },
  ],
  "Business Development": [
    { title: "Sales Representative", desc: "Client acquisition, product pitching, revenue generation" },
    { title: "Marketing Specialist", desc: "Campaign management, brand promotion, market research" },
    { title: "Business Analyst",     desc: "Market analysis, strategic planning, process improvement" },
    { title: "Account Manager",      desc: "Client relationship management, retention, upselling" },
    { title: "Entrepreneur / MSME",  desc: "Business ownership, product/service development, operations" },
  ],
  "Engineering and Manufacturing": [
    { title: "Civil Engineer",             desc: "Infrastructure design, construction management, project supervision" },
    { title: "Electrical Engineer",        desc: "Electrical systems, power distribution, equipment maintenance" },
    { title: "Mechanical Engineer",        desc: "Machine design, manufacturing processes, product development" },
    { title: "Quality Assurance Engineer", desc: "Product testing, quality standards, process validation" },
    { title: "Industrial Engineer",        desc: "Process optimization, production planning, efficiency improvement" },
  ],
  "Education": [
    { title: "Elementary / HS Teacher",desc: "Classroom instruction, curriculum delivery, student assessment" },
    { title: "College Instructor",      desc: "Higher education teaching, course facilitation, research" },
    { title: "Curriculum Developer",    desc: "Learning material design, instructional design, program planning" },
    { title: "Education Administrator", desc: "School management, policy implementation, staff supervision" },
    { title: "Guidance Counselor",      desc: "Student support, career guidance, psychosocial services" },
  ],
  "Data Analytics and Marketing": [
    { title: "Data Analyst",                 desc: "Data cleaning, visualization, statistical analysis, reporting" },
    { title: "Digital Marketing Specialist", desc: "SEO/SEM, social media management, content strategy" },
    { title: "Business Intelligence Analyst",desc: "Dashboard development, KPI tracking, data-driven insights" },
    { title: "Market Research Analyst",      desc: "Consumer insights, survey design, competitive analysis" },
    { title: "Data Science Associate",        desc: "Machine learning, predictive modeling, data pipeline" },
  ],
};

function shortLabel(label) {
  return label.split(" & ")[0].trim().split(" ").slice(0, 2).join(" ");
}

// Returns a Google search URL for a skill term
function googleSkillUrl(skill) {
  return `https://www.google.com/search?q=${encodeURIComponent(skill + " skill")}`;
}

export default function PortfolioPage({ user, onNavigate, tracerDone }) {
  const [profile,     setProfile]    = useState(null);
  const [editing,     setEditing]    = useState(false);
  const [recs,        setRecs]       = useState(null);
  const [recsError,   setRecsError]  = useState(null);
  const [loadingRecs, setLoadingRecs]= useState(false);
  const [busy,        setBusy]       = useState(false);
  const [err,         setErr]        = useState(null);
  const [success,     setSuccess]    = useState(null);
  const [newSkill,    setNewSkill]   = useState("");

  // ── Resume PDF export ──────────────────────────────────────────────────────
  // Builds a print-optimised HTML page from student-authored fields only.
  // No LDA predictions, recommendations, or system-generated data included.
  function exportResumePDF() {
    if (!profile) return;

    const name     = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Graduate";
    const program  = profile.program           || "";
    const major    = profile.major             || "";
    const job      = profile.current_job       || "";
    const employer = profile.current_employer  || "";
    const linkedin = profile.linkedin_url      || "";
    const contact  = profile.contact_number    || "";
    const bio      = profile.bio               || "";
    const skills   = profile.skills_self_reported || [];
    const gradYear = profile.graduation_year   || "";

    const section = (title, content) => content ? `
      <div class="section">
        <div class="section-title">${title}</div>
        <div class="section-body">${content}</div>
      </div>` : "";

    const skillsHTML = skills.length > 0
      ? `<div class="skills-grid">${skills.map(s =>
          `<span class="skill-pill">${s}</span>`).join("")}</div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} \u2014 Resume</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', Arial, sans-serif; font-size: 11pt; color: #1A1714; background: #fff; }
  .page { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.65in 0.7in 0.7in; }
  .header { border-bottom: 3px solid #800E13; padding-bottom: 14px; margin-bottom: 18px; }
  .name { font-family: 'DM Serif Display', Georgia, serif; font-size: 28pt; color: #800E13; line-height: 1.1; margin-bottom: 4px; }
  .headline { font-size: 12pt; font-weight: 600; color: #1A1714; margin-bottom: 6px; }
  .contact-row { font-size: 9.5pt; color: #7A7168; display: flex; flex-wrap: wrap; gap: 16px; }
  .contact-row a { color: #800E13; text-decoration: none; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #800E13; border-bottom: 1px solid #E4DDD3; padding-bottom: 3px; margin-bottom: 8px; }
  .section-body { font-size: 10.5pt; line-height: 1.6; color: #1A1714; }
  .entry { margin-bottom: 6px; }
  .entry-title { font-weight: 600; font-size: 11pt; }
  .entry-sub { font-size: 10pt; color: #7A7168; }
  .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-pill { background: #F5E8DE; color: #800E13; font-size: 9.5pt; font-weight: 600; padding: 3px 10px; border-radius: 20px; border: 1px solid #E4DDD3; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #E4DDD3; font-size: 8.5pt; color: #7A7168; text-align: center; }
  @media print {
    body { background: white; }
    .page { padding: 0.55in 0.65in; width: 100%; }
    @page { size: letter; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="name">${name}</div>
    ${job || program ? `<div class="headline">${[job, employer ? "at " + employer : ""].filter(Boolean).join(" ")}</div>` : ""}
    <div class="contact-row">
      ${contact  ? "<span>\u{1F4DE} " + contact + "</span>" : ""}
      ${linkedin ? "<span>\u{1F517} <a href='" + linkedin + "' target='_blank'>" + linkedin.replace(/^https?:\\/\\/(www\\.)?/, "") + "</a></span>" : ""}
    </div>
  </div>
  ${section("Professional Summary", bio ? "<p>" + bio + "</p>" : "")}
  ${section("Education", (program || gradYear) ? `
    <div class="entry">
      <div class="entry-title">${program}${major ? " \u2014 " + major : ""}</div>
      ${gradYear ? "<div class='entry-sub'>Graduated " + gradYear + "</div>" : ""}
    </div>` : "")}
  ${section("Professional Experience", (job || employer) ? `
    <div class="entry">
      <div class="entry-title">${job || "Current Position"}</div>
      ${employer ? "<div class='entry-sub'>" + employer + "</div>" : ""}
    </div>` : "")}
  ${section("Skills", skillsHTML)}
  <div class="footer">
    Generated from the Graduate Tracer System \u00b7 ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}
  </div>
</div>
<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Popup blocked. Please allow popups for this site and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();
  }

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

  const radarData = recs
    ? (recs.skill_topics || [])
        .filter(t => t.score > 0.01)
        .map(t => ({ topic: shortLabel(t.label), score: Math.round(t.score * 100), full: t.label }))
    : [];

  // Build job suggestions from the top 2 scoring topics
  const topJobSuggestions = recs
    ? [...(recs.skill_topics || [])]
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .flatMap(t => (JOB_SUGGESTIONS[t.label] || []).map(j => ({ ...j, domain: t.label })))
        .slice(0, 6)
    : [];

  if (!profile) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
      <Spinner dark />
    </div>
  );

  // ── Tracer gate — must complete tracer study first ────────────────────────
  if (!tracerDone) return (
    <div className="fade-up">
      <h1 className="page-title">My Portfolio</h1>
      <div className="card" style={{ maxWidth:560, margin:"40px auto", textAlign:"center", padding:"48px 40px" }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🔒</div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, marginBottom:10 }}>
          Complete the Tracer Study First
        </div>
        <p style={{ color:T.inkMuted, fontSize:13, lineHeight:1.7, marginBottom:28 }}>
          Your portfolio and skill recommendations will be unlocked once you
          submit the Graduate Tracer Study questionnaire. This only takes a few minutes
          and your responses are kept strictly confidential.
        </p>
        <button className="btn btn-primary" style={{ fontSize:14, padding:"10px 28px" }}
          onClick={() => onNavigate && onNavigate("tracer")}>
          Go to Tracer Study →
        </button>
      </div>
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
        <div style={{ display:"flex", gap:8 }}>
          {!editing && (
            <button className="btn btn-secondary" onClick={exportResumePDF}
              disabled={!profile}
              title="Download your profile as a resume PDF">
              ⬇ Download Resume
            </button>
          )}
          <button className="btn btn-secondary"
            onClick={() => { setEditing(e => !e); setErr(null); setSuccess(null); }}>
            {editing ? "✕ Cancel" : "✏ Edit Profile"}
          </button>
        </div>
      </div>

      {err     && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="grid-2 section" style={{ alignItems: "start" }}>

        {/* ── LEFT: Profile ── */}
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
                  <div className="form-group"><label className="form-label">Current Job Title</label>
                    <input className="form-input" placeholder="e.g. Software Engineer"
                      value={form.current_job} onChange={e => setForm(f => ({...f, current_job: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Current Employer</label>
                    <input className="form-input" placeholder="Company or organization"
                      value={form.current_employer} onChange={e => setForm(f => ({...f, current_employer: e.target.value}))} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">LinkedIn URL</label>
                    <input className="form-input" placeholder="https://linkedin.com/in/…"
                      value={form.linkedin_url} onChange={e => setForm(f => ({...f, linkedin_url: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Contact Number</label>
                    <input className="form-input" placeholder="+63…"
                      value={form.contact_number} onChange={e => setForm(f => ({...f, contact_number: e.target.value}))} /></div>
                </div>

                <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:"uppercase",
                  letterSpacing:".8px", margin:"6px 0 10px", paddingBottom:6, borderBottom:`1px solid ${T.border}` }}>
                  My Skills
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <input className="form-input" placeholder="Add a skill…"
                    value={newSkill} onChange={e => setNewSkill(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSkill()} style={{ flex:1 }} />
                  <button className="btn btn-secondary btn-sm" onClick={addSkill}>Add</button>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
                  {form.skills_self_reported.map(s => (
                    <span key={s} className="pill pill-match" style={{ cursor:"pointer" }}
                      onClick={() => removeSkill(s)} title="Click to remove">
                      ✓ {s} ✕
                    </span>
                  ))}
                </div>

                <button className="btn btn-primary" onClick={saveProfile} disabled={busy}>
                  {busy ? <><div className="spinner"/>Saving…</> : "Save Profile"}
                </button>
              </>
            ) : (
              <>
                <div className="card-title">
                  {profile.first_name} {profile.last_name}
                </div>
                {profile.bio && (
                  <p style={{ fontSize:13, color:T.inkMuted, marginBottom:14, lineHeight:1.6 }}>
                    {profile.bio}
                  </p>
                )}
                {[
                  { label:"Program",  value: profile.program },
                  { label:"Major",    value: profile.major },
                  { label:"Job",      value: profile.current_job },
                  { label:"Employer", value: profile.current_employer },
                  { label:"Contact",  value: profile.contact_number },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} style={{ display:"flex", gap:10, fontSize:13,
                    marginBottom:6, color:T.ink }}>
                    <span style={{ color:T.inkMuted, minWidth:70 }}>{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
                {profile.linkedin_url && (
                  <div style={{ marginTop:8 }}>
                    <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:13, color:T.accent }}>
                      LinkedIn Profile →
                    </a>
                  </div>
                )}
                {(profile.skills_self_reported || []).length > 0 && (
                  <>
                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:"uppercase",
                      letterSpacing:".8px", margin:"16px 0 8px" }}>My Skills</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {profile.skills_self_reported.map(s => (
                        <span key={s} className="pill pill-match">{s}</span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Job Role Suggestions — below profile card ── */}
          {topJobSuggestions.length > 0 && (
            <div className="card" style={{ marginTop:20 }}>
              <div className="card-title" style={{ marginBottom:6 }}>💼 Possible Career Paths</div>
              <p style={{ fontSize:12, color:T.inkMuted, marginBottom:14, lineHeight:1.6 }}>
                Based on your identified skill domains. These are suggested roles only — not job listings.
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {topJobSuggestions.map((job, i) => (
                  <div key={i} style={{
                    background:T.bg, border:`1px solid ${T.border}`,
                    borderRadius:8, padding:"10px 12px",
                  }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.ink, marginBottom:3 }}>
                      {job.title}
                    </div>
                    <div style={{ fontSize:11, color:T.inkMuted, lineHeight:1.5 }}>
                      {job.desc}
                    </div>
                    <div style={{ marginTop:5 }}>
                      <span className="pill pill-neutral" style={{ fontSize:10 }}>
                        {job.domain.split(" ")[0]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: LDA Recommendations ── */}
        <div>
          <div className="card">
            <div className="card-title">🎯 Skill Recommendations</div>
            <p style={{ fontSize:13, color:T.inkMuted, marginBottom:16, lineHeight:1.6 }}>
              Based on your <strong>{profile.program || "degree"}</strong>
              {profile.major && <> — <strong>{profile.major}</strong></>}
              , the LDA model identifies the most relevant skill domains.
            </p>

            {loadingRecs && (
              <div style={{ textAlign:"center", padding:40 }}>
                <Spinner dark />
                <div style={{ marginTop:12, color:T.inkMuted, fontSize:13 }}>Analyzing your program…</div>
              </div>
            )}

            {!loadingRecs && recsError && (
              <div className="alert alert-error">Could not load recommendations: {recsError}</div>
            )}

            {!loadingRecs && !recsError && !recs && (
              <div className="empty">
                <div className="empty-icon">🎓</div>
                <div>Set your degree program in your profile to get recommendations.</div>
              </div>
            )}

            {!loadingRecs && recs && (
              <>
                {/* Radar chart */}
                {radarData.length >= 3 && (
                  <div style={{ marginBottom:24 }}>
                    <div className="form-label" style={{ marginBottom:10 }}>Domain Radar</div>
                    <RadarChart width={380} height={280} data={radarData}>
                      <PolarGrid stroke={T.border} />
                      <PolarAngleAxis dataKey="topic" tick={{ fontSize:11, fill:T.inkMuted }} />
                      <PolarRadiusAxis angle={30} domain={[0,100]}
                        tick={{ fontSize:9, fill:T.inkMuted }}
                        tickFormatter={v => v + "%"} />
                      <Radar name="Relevance" dataKey="score"
                        fill={T.accent} fillOpacity={0.25}
                        stroke={T.accent} strokeWidth={2}
                        dot={{ fill:T.accent, r:4 }} />
                      <Tooltip
                        formatter={v => [`${v}%`, "Relevance"]}
                        labelFormatter={(_,p) => p?.[0]?.payload?.full || ""} />
                    </RadarChart>
                  </div>
                )}

                {/* ── Recommended Skills — technical & tool are clickable ── */}
                <div className="form-label" style={{ marginBottom:10 }}>Recommended Skills</div>
                <p style={{ fontSize:11, color:T.inkMuted, marginBottom:10 }}>
                  💡 Click on <strong>Technical</strong> or <strong>Tool</strong> skills to search and learn more.
                </p>
                {(() => {
                  const owned  = new Set((profile.skills_self_reported || []).map(x => x.toLowerCase()));
                  const tagged = recs.tagged_skills || (recs.recommended_skills || []).map(s => ({ skill: s, category: "domain" }));
                  const groups = { technical: [], tool: [], soft: [], domain: [] };
                  tagged.forEach(t => (groups[t.category] || groups.domain).push(t.skill));

                  const CAT_CONFIG = {
                    technical: { label: "⚙ Technical Skills",  pill: "pill-topic",   clickable: true  },
                    tool:      { label: "🛠 Tools & Platforms", pill: "pill-surplus", clickable: true  },
                    soft:      { label: "💬 Soft Skills",       pill: "pill-match",   clickable: false },
                    domain:    { label: "📚 Domain Knowledge",  pill: "pill-neutral", clickable: false },
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
                            const pillClass = `pill ${isOwned ? "pill-match" : cfg.pill}`;
                            const label = `${isOwned ? "✓ " : ""}${s}`;

                            if (cfg.clickable) {
                              return (
                                <a key={s}
                                  href={googleSkillUrl(s)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={pillClass}
                                  title={isOwned
                                    ? `You have this skill — search "${s}"`
                                    : `Learn about "${s}" — opens Google`}
                                  style={{
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    transition: "opacity .15s",
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = ".75"}
                                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                                  {label} 🔍
                                </a>
                              );
                            }

                            return (
                              <span key={s}
                                className={pillClass}
                                title={isOwned ? "You already have this skill" : "Recommended to develop"}>
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ));
                })()}

                {/* Topic keyword cards */}
                <div className="form-label" style={{ marginBottom:8, marginTop:20 }}>
                  Top Skill Domains
                </div>
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
