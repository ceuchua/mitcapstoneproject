// pages/admin/GraduatesPage.jsx
// Admin view of all registered student accounts

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";

export default function GraduatesPage() {
  const [graduates, setGraduates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    api.listUsers("student")
      .then(setGraduates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function exportCSV() {
    const rows = graduates.map(g => ({
      name: `${g.last_name}, ${g.first_name}`,
      email: g.email,
      program: g.program,
      graduation_year: g.graduation_year,
      student_id: g.student_id,
      current_job: g.current_job,
      current_employer: g.current_employer,
      joined: g.created_at,
    }));
    const headers = Object.keys(rows[0] || {});
    const lines = [headers.join(","), ...rows.map(r =>
      headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "graduates.csv"; a.click();
  }

  const filtered = graduates.filter(g => {
    const s = search.toLowerCase();
    return !s || `${g.first_name} ${g.last_name} ${g.email} ${g.program} ${g.student_id}`.toLowerCase().includes(s);
  });

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Graduates</h1>
          <p className="page-sub">All registered student accounts</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      <div className="card section">
        <div style={{ marginBottom: 16 }}>
          <input className="form-input" style={{ maxWidth: 320 }} placeholder="🔍 Search by name, email, program…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="empty"><div className="spinner spinner-dark" /><div style={{ marginTop: 10 }}>Loading…</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon"></div>No graduates found.</div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>Name</th><th>Program</th><th>Batch</th><th>Student ID</th>
              <th>Current Role</th><th>Skills</th><th>Joined</th>
            </tr></thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.user_id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{g.last_name}, {g.first_name}</div>
                    <div style={{ fontSize: 11, color: T.inkMuted }}>{g.email}</div>
                  </td>
                  <td>{g.program || "—"}</td>
                  <td>{g.graduation_year || "—"}</td>
                  <td style={{ color: T.inkMuted }}>{g.student_id || "—"}</td>
                  <td>
                    {g.current_job
                      ? <><div style={{ fontWeight: 500 }}>{g.current_job}</div>
                          <div style={{ fontSize: 11, color: T.inkMuted }}>{g.current_employer}</div></>
                      : "—"
                    }
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(g.skills_self_reported || []).slice(0, 3).map(s => (
                        <span key={s} className="pill pill-neutral">{s}</span>
                      ))}
                      {(g.skills_self_reported || []).length > 3 &&
                        <span className="pill pill-neutral">+{g.skills_self_reported.length - 3}</span>}
                      {!g.skills_self_reported?.length && "—"}
                    </div>
                  </td>
                  <td style={{ color: T.inkMuted, fontSize: 12 }}>
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
