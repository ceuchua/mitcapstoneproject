// api.js — centralized API helpers

const BASE = "http://localhost:8000";

function getToken() {
  return localStorage.getItem("tracer_token") || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`,
  };
}

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const api = {
  // Auth
  register: (body) => request("POST", "/api/auth/register", body),
  login:    (body) => request("POST", "/api/auth/login", body),

  // Profile
  getMe:    ()     => request("GET",  "/api/users/me"),
  updateMe: (body) => request("PUT",  "/api/users/me", body),
  listUsers:(role) => request("GET",  `/api/users${role ? `?role=${role}` : ""}`),

  // Questionnaire
  getQuestions:    ()           => request("GET",    "/api/questionnaire/questions"),
  createQuestion:  (body)       => request("POST",   "/api/questionnaire/questions", body),
  updateQuestion:  (id, body)   => request("PUT",    `/api/questionnaire/questions/${id}`, body),
  deleteQuestion:  (id)         => request("DELETE", `/api/questionnaire/questions/${id}`),
  submitResponse:  (body)       => request("POST",   "/api/questionnaire/responses", body),
  getMyResponse:   ()           => request("GET",    "/api/questionnaire/responses/me"),
  getAllResponses:  ()           => request("GET",    "/api/questionnaire/responses"),

  // LDA
  getRecommendations: (program) => request("GET", `/api/lda/recommend?program=${encodeURIComponent(program)}`),
  getIndustryTrends:  ()        => request("GET", "/api/lda/industry-trends"),
  retrainModel:       ()        => request("POST", "/api/lda/retrain"),
  getLdaTopics:       ()        => request("GET",  "/api/lda/topics"),

  // Employment / Stats
  getEmployment: () => request("GET", "/api/employment"),
  getStats:      () => request("GET", "/api/stats"),
  health:        () => fetch(BASE + "/api/health").then(r => r.json()),
};
