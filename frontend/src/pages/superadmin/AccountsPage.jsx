// pages/superadmin/AccountsPage.jsx
// Super admin: manage all admin and student accounts

import { useState, useEffect } from "react";
import { api } from "../../api";
import { T } from "../../tokens";
import { Spinner } from "../../components/UI";

const ROLE_BADGE = {
  super_admin: { label: "Super Admin", color: "#f0c040", bg: "rgba(240,192,64,.15)" },
  admin:       { label: "Admin",       color: T.accent,  bg: T.accentSoft },
  student:     { label: "Student",     color: T.green,   bg: T.greenSoft  },
};

export default function AccountsPage({ currentUser }) {
  const [tab,        setTab]       = useState("admins");
  const [admins,     setAdmins]    = useState([]);
  const [students,   setStudents]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [err,        setErr]       = useState(null);
  const [success,    setSuccess]   = useState(null);
  const [showCreate, setShowCreate]= useState(false);
  const [busy,       setBusy]      = useState(false);
  const [search,     setSearch]    = useState("");

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "", role: "admin",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const all = await api.listAllUsers();
      setAdmins(all.filter(u => ["admin", "super_admin"].includes(u.role)));
      setStudents(all.filter(u => u.role === "student"));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function createAdmin() {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setErr("All fields are required."); return;
    }
    setBusy(true); setErr(null);
    try {
      await api.createAdminAccount(form);
      setSuccess(`Account created for ${form.first_name} ${form.last_name}.`);
      setShowCreate(false);
      setForm({ first_name:"", last_name:"", email:"", password:"", role:"admin" });
      await loadAll();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function deleteAdmin(u) {
    if (!window.confirm(`Delete admin account for ${u.first_name} ${u.last_name}? This cannot be undone.`)) return;
    try {
      await api.deleteAdminAccount(u.user_id);
      setSuccess(`Account for ${u.first_name} ${u.last_name} deleted.`);
      await loadAll();
    } catch (e) { setErr(e.message); }
  }

  async function deleteStudent(u) {
    if (!window.confirm(`Delete student account for ${u.first_name} ${u.last_name}? This will also remove their tracer study responses.`)) return;
    try {
      await api.deleteStudent(u.user_id);
      setSuccess(`Student account for ${u.first_name} ${u.last_name} deleted.`);
      await loadAll();
    } catch (e) { setErr(e.message); }
  }

  const filteredStudents = students.filter(u => {
    const s = search.toLowerCase();
    return !s || `${u.first_name} ${u.last_name} ${u.email} ${u.program || ""} ${u.student_id || ""}`.toLowerCase().includes(s);
  });

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 className="page-title">Account Management</h1>
          <p className="page-sub">Manage administrator and student accounts across the system</p>
        </div>
        {tab === "admins" && (
          <button className="btn btn-primary" onClick={() => { setShowCreate(s => !s); setErr(null); }}>
            {showCreate ? "✕ Cancel" : "+ Create Admin"}
          </button>
        )}
      </div>

      {err     && <div className="alert alert-error">{err}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showCreate && (
        <div className="card section fade-up" style={{ borderColor:"#f0c040", borderWidth:1.5 }}>
          <div className="card-title">Create Admin Account</div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">First Name *</label>
              <input className="form-input" value={form.first_name}
                onChange={e => setForm(f => ({...f, first_name: e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Last Name *</label>
              <input className="form-input" value={form.last_name}
                onChange={e => setForm(f => ({...f, last_name: e.target.value}))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email}
                onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Temporary Password *</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Role</label>
            <select className="form-select" value={form.role}
              onChange={e => setForm(f => ({...f, role: e.target.value}))}>
              <option value="admin">Administrator</option>
              <option value="super_admin">Super Administrator</option>
            </select>
            <div style={{ fontSize:11, color:T.inkMuted, marginTop:4 }}>
              Super administrators can manage all accounts and have full system access.
            </div>
          </div>
          <button className="btn btn-primary" onClick={createAdmin} disabled={busy}>
            {busy ? <><div className="spinner"/>Creating…</> : "Create Account"}
          </button>
        </div>
      )}

      <div className="tabs">
        <div className={`tab ${tab === "admins" ? "active" : ""}`} onClick={() => setTab("admins")}>
          Administrators ({admins.length})
        </div>
        <div className={`tab ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>
          Students ({students.length})
        </div>
      </div>

      {loading ? (
        <div className="empty"><Spinner dark /><div style={{ marginTop:10 }}>Loading…</div></div>
      ) : tab === "admins" ? (
        <div className="card">
          {admins.length === 0
            ? <div className="empty"><div className="empty-icon"></div>No admin accounts.</div>
            : <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
                <tbody>
                  {admins.map(u => {
                    const badge = ROLE_BADGE[u.role] || ROLE_BADGE.admin;
                    const isMe  = u.user_id === currentUser?.user_id;
                    const isSA  = u.role === "super_admin";
                    return (
                      <tr key={u.user_id}>
                        <td>
                          <div style={{ fontWeight:500 }}>{u.first_name} {u.last_name}
                            {isMe && <span style={{ fontSize:11, color:T.inkMuted, marginLeft:6 }}>(you)</span>}
                          </div>
                        </td>
                        <td style={{ color:T.inkMuted }}>{u.email}</td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px",
                            borderRadius:20, background:badge.bg, color:badge.color }}>
                            {isSA && "⭐ "}{badge.label}
                          </span>
                        </td>
                        <td style={{ color:T.inkMuted, fontSize:12 }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          {!isMe && !isSA
                            ? <button className="btn btn-danger btn-sm" onClick={() => deleteAdmin(u)}>🗑 Delete</button>
                            : <span style={{ fontSize:11, color:T.inkMuted }}>{isSA ? "Protected" : ""}</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      ) : (
        <div className="card">
          <div style={{ marginBottom:14 }}>
            <input className="form-input" style={{ maxWidth:320 }}
              placeholder="🔍 Search by name, email, program, ID…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {filteredStudents.length === 0
            ? <div className="empty"><div className="empty-icon"></div>No students found.</div>
            : <table className="table">
                <thead><tr>
                  <th>Name</th><th>Program</th><th>Student ID</th><th>Batch</th><th>Joined</th><th></th>
                </tr></thead>
                <tbody>
                  {filteredStudents.map(u => (
                    <tr key={u.user_id}>
                      <td>
                        <div style={{ fontWeight:500 }}>{u.last_name}, {u.first_name}</div>
                        <div style={{ fontSize:11, color:T.inkMuted }}>{u.email}</div>
                      </td>
                      <td>{u.program || "—"}</td>
                      <td style={{ color:T.inkMuted }}>{u.student_id || "—"}</td>
                      <td>{u.graduation_year || "—"}</td>
                      <td style={{ color:T.inkMuted, fontSize:12 }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => deleteStudent(u)}>🗑 Delete</button>
                      </td>
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
