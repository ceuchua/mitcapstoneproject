// components/UI.jsx — shared reusable components

import { T } from "../tokens";

export function AlignmentGauge({ score }) {
  const pct   = Math.round((score || 0) * 100);
  const color  = score >= 0.6 ? T.green : score >= 0.35 ? T.yellow : T.red;
  const r = 36, circ = 2 * Math.PI * r;
  const dash = circ * (score || 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#EDE9E3" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ * 0.25} strokeLinecap="round"
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.4,0,.2,1)" }} />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, fill: color }}>
          {pct}%
        </text>
      </svg>
      <span style={{ fontSize: 11, color: T.inkMuted, fontWeight: 600 }}>Alignment</span>
    </div>
  );
}

export function ScoreBar({ value, color }) {
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-fill" style={{ width: `${Math.round((value || 0) * 100)}%`, background: color || T.accent }} />
    </div>
  );
}

export function SkillPillGroup({ skills, variant, label }) {
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

export function Spinner({ dark } = {}) {
  return <div className={`spinner${dark ? " spinner-dark" : ""}`} />;
}

export function StatTile({ icon, value, label, color }) {
  return (
    <div className="stat-tile">
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function alignColor(score) {
  if (score >= 0.6) return T.green;
  if (score >= 0.35) return T.yellow;
  return T.red;
}
