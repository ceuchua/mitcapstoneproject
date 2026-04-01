"""
main.py  —  Graduate Tracer System API v3
─────────────────────────────────────────────────────────────────────────────
Routes
  Auth
    POST /api/auth/register
    POST /api/auth/login

  Users / Profile
    GET  /api/users/me              (requires token header)
    PUT  /api/users/me              (requires token header)
    GET  /api/users                 (admin only)

  Questionnaire
    GET  /api/questionnaire/questions
    POST /api/questionnaire/questions       (admin only)
    PUT  /api/questionnaire/questions/{id}  (admin only)
    DELETE /api/questionnaire/questions/{id}(admin only)
    POST /api/questionnaire/responses       (student)
    GET  /api/questionnaire/responses/me    (student)
    GET  /api/questionnaire/responses       (admin only)

  LDA
    GET  /api/lda/recommend         student skill recommendations by program
    GET  /api/lda/industry-trends   admin industry skill trends
    POST /api/lda/retrain           admin retrain model
    GET  /api/lda/topics

  Employment (internal, triggered by questionnaire submission)
    POST /api/employment
    GET  /api/employment

  Dashboard
    GET  /api/stats

  System
    GET  /api/health
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from schemas import (
    RegisterRequest, LoginRequest, AuthResponse,
    ProfileUpdate, UserProfile,
    Question, QuestionCreate, QuestionUpdate,
    TracerResponse, TracerResponseRecord,
    EmploymentCreate, EmploymentResponse,
    SkillsGapRequest, SkillsGapResponse, SkillTopicScore,
    StudentSkillRecommendation,
    StatsResponse,
)
from storage import (
    save_user, find_user_by_email, find_user_by_id, find_user_by_token,
    update_user, list_users, email_exists, hash_password, verify_password,
    save_employment, read_employment_records, records_for_user,
    find_employment_record, all_job_texts,
    read_questions, save_question, update_question, delete_question,
    save_response, get_response_by_user, read_all_responses,
    compute_stats,
)
from lda_model import lda_analyzer

app = FastAPI(
    title="Graduate Tracer System API",
    version="3.0.0",
    description="ML-powered graduate tracer system with LDA skills analysis.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOW = lambda: datetime.now(timezone.utc).isoformat()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing.")
    token = authorization.replace("Bearer ", "").strip()
    user = find_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return user

def _require_admin(authorization: Optional[str] = Header(None)) -> dict:
    user = _get_current_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user

def _require_student(authorization: Optional[str] = Header(None)) -> dict:
    user = _get_current_user(authorization)
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required.")
    return user


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok", "lda_trained": lda_analyzer.is_trained, "version": "3.0.0"}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=AuthResponse, tags=["Auth"])
def register(req: RegisterRequest):
    if email_exists(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    if req.role not in ("student", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'student' or 'admin'.")
    if req.role == "student" and not req.program:
        raise HTTPException(status_code=400, detail="Program is required for students.")

    token = str(uuid.uuid4())
    user = {
        "user_id":          str(uuid.uuid4()),
        "first_name":       req.first_name,
        "last_name":        req.last_name,
        "email":            req.email,
        "password_hash":    hash_password(req.password),
        "role":             req.role,
        "token":            token,
        "student_id":       req.student_id,
        "program":          req.program,
        "graduation_year":  req.graduation_year,
        "sex":              req.sex,
        "contact_number":   req.contact_number,
        "bio":              None,
        "current_job":      None,
        "current_employer": None,
        "linkedin_url":     None,
        "skills_self_reported": [],
        "created_at":       NOW(),
    }
    save_user(user)
    return AuthResponse(
        user_id=user["user_id"], first_name=user["first_name"],
        last_name=user["last_name"], email=user["email"],
        role=user["role"], token=token,
    )


@app.post("/api/auth/login", response_model=AuthResponse, tags=["Auth"])
def login(req: LoginRequest):
    user = find_user_by_email(req.email)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    # Refresh token on each login
    token = str(uuid.uuid4())
    update_user(user["user_id"], {"token": token})
    return AuthResponse(
        user_id=user["user_id"], first_name=user["first_name"],
        last_name=user["last_name"], email=user["email"],
        role=user["role"], token=token,
    )


# ── Users / Profile ───────────────────────────────────────────────────────────

@app.get("/api/users/me", response_model=UserProfile, tags=["Users"])
def get_my_profile(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    return UserProfile(**{k: v for k, v in user.items() if k != "password_hash"})


@app.put("/api/users/me", response_model=UserProfile, tags=["Users"])
def update_my_profile(req: ProfileUpdate, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_user(user["user_id"], updates)
    return UserProfile(**{k: v for k, v in updated.items() if k != "password_hash"})


@app.get("/api/users", tags=["Users"])
def list_all_users(role: Optional[str] = None, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    users = list_users(role=role)
    return [UserProfile(**{k: v for k, v in u.items() if k != "password_hash"}) for u in users]


# ── Questionnaire Questions ───────────────────────────────────────────────────

@app.get("/api/questionnaire/questions", response_model=list[Question], tags=["Questionnaire"])
def get_questions():
    return [Question(**q) for q in read_questions()]


@app.post("/api/questionnaire/questions", response_model=Question, tags=["Questionnaire"])
def create_question(req: QuestionCreate, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    q = {
        **req.model_dump(),
        "question_id": f"q_{uuid.uuid4().hex[:8]}",
    }
    save_question(q)
    return Question(**q)


@app.put("/api/questionnaire/questions/{question_id}", response_model=Question, tags=["Questionnaire"])
def edit_question(question_id: str, req: QuestionUpdate, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_question(question_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found.")
    return Question(**updated)


@app.delete("/api/questionnaire/questions/{question_id}", tags=["Questionnaire"])
def remove_question(question_id: str, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    if not delete_question(question_id):
        raise HTTPException(status_code=404, detail="Question not found.")
    return {"status": "deleted", "question_id": question_id}


# ── Tracer Study Responses ────────────────────────────────────────────────────

@app.post("/api/questionnaire/responses", response_model=TracerResponseRecord, tags=["Questionnaire"])
def submit_response(req: TracerResponse, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    if user["user_id"] != req.user_id:
        raise HTTPException(status_code=403, detail="Cannot submit on behalf of another user.")

    record = {
        "response_id": str(uuid.uuid4()),
        "user_id":     req.user_id,
        "answers":     req.answers,
        "created_at":  NOW(),
    }
    save_response(record)

    # Auto-trigger LDA gap analysis if job text is present in answers
    job_text = " ".join(filter(None, [
        req.answers.get("q_job_title", ""),
        req.answers.get("q_job_desc", ""),
        req.answers.get("q_skills_used", ""),
    ])).strip()

    if job_text and req.answers.get("q_emp_status") in ("employed", "self_employed"):
        program = user.get("program", "")
        gap = lda_analyzer.analyze_gap(job_text=job_text, program=program)
        emp_record = {
            "record_id":              str(uuid.uuid4()),
            "graduate_id":            user["user_id"],
            "employment_status":      req.answers.get("q_emp_status", ""),
            "employer_name":          req.answers.get("q_employer_name"),
            "employer_sector":        req.answers.get("q_sector"),
            "job_title":              req.answers.get("q_job_title"),
            "job_description":        req.answers.get("q_job_desc"),
            "job_skills_required":    req.answers.get("q_skills_used"),
            "is_related_to_course":   req.answers.get("q_related") == "yes",
            "months_to_employment":   req.answers.get("q_months_to_job"),
            "detected_skill_topics":  [t["label"] for t in gap["skill_topics"]],
            "skills_in_job":          gap["skills_in_job"],
            "skills_from_program":    gap["skills_from_program"],
            "gap_skills":             gap["gap_skills"],
            "alignment_score":        gap["alignment_score"],
            "lda_topic_distribution": gap["lda_topic_distribution"],
            "created_at":             NOW(),
        }
        save_employment(emp_record)

    return TracerResponseRecord(**record)


@app.get("/api/questionnaire/responses/me", response_model=TracerResponseRecord, tags=["Questionnaire"])
def get_my_response(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    r = get_response_by_user(user["user_id"])
    if not r:
        raise HTTPException(status_code=404, detail="No response submitted yet.")
    return TracerResponseRecord(**r)


@app.get("/api/questionnaire/responses", tags=["Questionnaire"])
def get_all_responses(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    return read_all_responses()


# ── LDA ───────────────────────────────────────────────────────────────────────

@app.get("/api/lda/recommend", tags=["LDA"])
def student_skill_recommendations(
    program: str = Query(..., description="Degree program"),
    authorization: Optional[str] = Header(None),
):
    """Student-facing: recommend skills to develop based on degree program."""
    _get_current_user(authorization)
    return lda_analyzer.recommend_for_student(program)


@app.get("/api/lda/industry-trends", tags=["LDA"])
def industry_skill_trends(authorization: Optional[str] = Header(None)):
    """Admin-facing: analyze top skill trends across all employment records."""
    _require_admin(authorization)
    texts = all_job_texts()
    return lda_analyzer.analyze_industry_trends(texts)


@app.post("/api/lda/retrain", tags=["LDA"])
def retrain_model(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    return lda_analyzer.retrain(all_job_texts())


@app.get("/api/lda/topics", tags=["LDA"])
def lda_topics():
    return {"topics": lda_analyzer.topic_summary()}


# ── Employment Records (admin view) ───────────────────────────────────────────

@app.get("/api/employment", response_model=list[EmploymentResponse], tags=["Employment"])
def list_employment(limit: int = 100, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    return [EmploymentResponse(**r) for r in read_employment_records(limit=limit)]


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats", response_model=StatsResponse, tags=["Dashboard"])
def get_stats(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    s = compute_stats()
    s["records_by_graduation_year"] = {int(k): v for k, v in s["records_by_graduation_year"].items()}
    return StatsResponse(**s)
