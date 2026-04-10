// api.js — centralized API helpers with global 401 interception

// Use VITE_API_URL env var in production (set in Vercel dashboard).
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Global unauthorized handler ───────────────────────────────────────────────
// Registered by App.jsx on mount. Fires when any authenticated request
// gets a 401 — covers server restart, token expiry, inactivity logout.
// NOT fired for login/register which use 401 for credential errors.

let _onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("tracer_token") || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`,
  };
}

// ── Core request — with global 401 interception ───────────────────────────────
// Used for all authenticated routes. A 401 here always means the session
// is invalid (expired, server restarted) not a credential error.

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    if (_onUnauthorized) _onUnauthorized("server");
    throw new Error("Session expired. Please log in again.");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── Public request — NO global 401 interception ───────────────────────────────
// Used for login and register where a 401 means wrong credentials,
// not an expired session. Always surfaces the real error message from
// the backend so the form can display it to the user.

async function requestPublic(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  // Auth — uses requestPublic so credential errors surface correctly
  register: (body) => requestPublic("POST", "/api/auth/register", body),
  login:    (body) => requestPublic("POST", "/api/auth/login",    body),

  // Logout — uses regular request but errors are silently swallowed in App.jsx
  logout: () => request("POST", "/api/auth/logout"),

  // Profile
  getMe:    ()     => request("GET", "/api/users/me"),
  updateMe: (body) => request("PUT", "/api/users/me", body),
  listUsers:(role) => request("GET", `/api/users${role ? `?role=${role}` : ""}`),

  // Questionnaire
  getQuestions:   ()         => request("GET",    "/api/questionnaire/questions"),
  createQuestion: (body)     => request("POST",   "/api/questionnaire/questions", body),
  updateQuestion: (id, body) => request("PUT",    `/api/questionnaire/questions/${id}`, body),
  deleteQuestion: (id)       => request("DELETE", `/api/questionnaire/questions/${id}`),
  submitResponse: (body)     => request("POST",   "/api/questionnaire/responses", body),
  getMyResponse:  ()         => request("GET",    "/api/questionnaire/responses/me"),
  getAllResponses:  ()         => request("GET",    "/api/questionnaire/responses"),
  deleteResponse:  (id)       => request("DELETE", `/api/questionnaire/responses/${id}`),

  // LDA
  getRecommendations: (program, major = "") =>
    request("GET", `/api/lda/recommend?program=${encodeURIComponent(program)}&major=${encodeURIComponent(major)}`),
  getSkillTrends:     () => request("GET",  "/api/lda/skill-trends"),
  reloadModel:        () => request("POST", "/api/lda/reload"),
  getLdaTopics:       () => request("GET",  "/api/lda/topics"),

  // Employment / Stats
  getMyEmployment: () => request("GET", "/api/employment/me"),
  getEmployment:   () => request("GET", "/api/employment"),
  getStats:        () => request("GET", "/api/stats"),

  // Super Admin — account management
  initSuperAdmin:    (body)     => requestPublic("POST", "/api/auth/init-superadmin", body),
  createAdminAccount:(body)     => request("POST",   "/api/admin/accounts", body),
  listAdminAccounts: ()         => request("GET",    "/api/admin/accounts"),
  deleteAdminAccount:(id)       => request("DELETE", `/api/admin/accounts/${id}`),
  deleteStudent:     (id)       => request("DELETE", `/api/users/${id}`),
  listAllUsers:      ()         => request("GET",    "/api/users/all"),

  // Question toggle
  toggleQuestion: (id) => request("PATCH", `/api/questionnaire/questions/${id}/toggle`),

  // Health — no auth, never intercept
  health: () => fetch(BASE + "/api/health").then(r => r.json()),
};
