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
    POST /api/lda/reload            hot-reload joblib without restart
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
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

# ── Session config ─────────────────────────────────────────────────────────────
# Inactivity timeout: token is invalidated if unused for this many minutes.
SESSION_TIMEOUT_MINUTES = 30

from schemas import (
    RegisterRequest, LoginRequest, AuthResponse,
    ProfileUpdate, UserProfile,
    Question, QuestionCreate, QuestionUpdate,
    TracerResponse, TracerResponseRecord,
    EmploymentCreate, EmploymentResponse,
    SkillsGapRequest, SkillsGapResponse, SkillTopicScore,
    StudentSkillRecommendation,
    StatsResponse,
    CreateAdminRequest, DeleteUserResponse,
)
from storage import (
    save_user, find_user_by_email, find_user_by_id, find_user_by_token,
    update_user, list_users, email_exists, clear_all_tokens,
    hash_password, verify_password,
    save_employment, read_employment_records, records_for_user,
    find_employment_record, all_job_texts,
    read_questions, read_questions_for_student, save_question,
    update_question, delete_question, toggle_question_enabled,
    get_answer_by_role, delete_user, has_super_admin,
    get_response_by_id, delete_response,
    save_response, get_response_by_user, read_all_responses,
    compute_stats,
)
from lda_model import lda_analyzer
from skill_parser import parse_skills, parse_skills_from_responses

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    # ── Startup: invalidate all sessions ──────────────────────────────────────
    # Every server restart forces all users to log in again.
    n = clear_all_tokens()
    logger.info("Server startup: cleared %d active session(s).", n)
    yield
    # ── Shutdown (nothing extra needed) ───────────────────────────────────────


app = FastAPI(
    title="Graduate Tracer System API",
    version="3.0.0",
    description="ML-powered graduate tracer system with LDA skills analysis.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOW      = lambda: datetime.now(timezone.utc).isoformat()
EXPIRES  = lambda: (datetime.now(timezone.utc) + timedelta(minutes=SESSION_TIMEOUT_MINUTES)).isoformat()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing.")
    token = authorization.replace("Bearer ", "").strip()
    user  = find_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    # Check inactivity expiry
    expires_at = user.get("token_expires_at")
    if expires_at:
        expiry_dt = datetime.fromisoformat(expires_at)
        if datetime.now(timezone.utc) > expiry_dt:
            # Invalidate the token so it cannot be reused
            update_user(user["user_id"], {"token": None, "token_expires_at": None})
            raise HTTPException(status_code=401, detail="Session expired due to inactivity. Please log in again.")

    # Slide the expiry window on every valid request
    update_user(user["user_id"], {"token_expires_at": EXPIRES()})
    return user

def _require_admin(authorization: Optional[str] = Header(None)) -> dict:
    """Allows both admin and super_admin roles."""
    user = _get_current_user(authorization)
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user

def _require_super_admin(authorization: Optional[str] = Header(None)) -> dict:
    """Only allows super_admin role."""
    user = _get_current_user(authorization)
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required.")
    return user

def _require_student(authorization: Optional[str] = Header(None)) -> dict:
    user = _get_current_user(authorization)
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required.")
    return user


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["System"])
def health():
    return {
        "status": "ok",
        "lda_trained": lda_analyzer.is_trained,
        "version": "3.0.0",
        "session_timeout_minutes": SESSION_TIMEOUT_MINUTES,
    }


@app.post("/api/auth/logout", tags=["Auth"])
def logout(authorization: Optional[str] = Header(None)):
    """Explicitly invalidate the session token on sign-out."""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        user  = find_user_by_token(token)
        if user:
            update_user(user["user_id"], {"token": None, "token_expires_at": None})
    return {"status": "logged_out"}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=AuthResponse, tags=["Auth"])
def register(req: RegisterRequest):
    if email_exists(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    if req.role != "student":
        raise HTTPException(status_code=400, detail="Self-registration is only available for students. Admin accounts are created by a super administrator.")
    if req.role == "student" and not req.program:
        raise HTTPException(status_code=400, detail="Program is required for students.")

    token = str(uuid.uuid4())
    expires = EXPIRES()
    user = {
        "user_id":          str(uuid.uuid4()),
        "first_name":       req.first_name,
        "last_name":        req.last_name,
        "email":            req.email,
        "password_hash":    hash_password(req.password),
        "role":             req.role,
        "token":            token,
        "token_expires_at": expires,
        "student_id":       req.student_id,
        "program":          req.program,
        "major":            req.major,
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
    # Refresh token on each login and set expiry
    token = str(uuid.uuid4())
    update_user(user["user_id"], {"token": token, "token_expires_at": EXPIRES()})
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
def get_questions(authorization: Optional[str] = Header(None)):
    # Admins & super_admins see all questions (for editing)
    # Students & unauthenticated (questionnaire preview) see only enabled ones
    try:
        user = _get_current_user(authorization)
        role = user.get("role", "")
    except Exception:
        role = ""
    if role in ("admin", "super_admin"):
        return [Question(**q) for q in read_questions()]
    return [Question(**q) for q in read_questions_for_student()]


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
    success, reason = delete_question(question_id)
    if not success:
        if reason == "protected":
            raise HTTPException(
                status_code=403,
                detail="This question is protected and cannot be deleted. You may edit its text but not remove it.",
            )
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

    # Parse skills — multi_choice (list of option IDs) or legacy free-text
    questions     = read_questions()
    raw_skills    = get_answer_by_role(req.answers, "skills_free_text")
    if isinstance(raw_skills, list):
        # Resolve option IDs to labels using the question definition
        skill_q   = next((q for q in questions if q.get("semantic_role") == "skills_free_text"), None)
        opt_map   = {o["id"]: o["label"] for o in (skill_q.get("options") or [])} if skill_q else {}
        parsed_skills = [opt_map.get(oid, oid) for oid in raw_skills]
    else:
        parsed_skills = parse_skills(raw_skills or "")
    record["parsed_skills"] = parsed_skills

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


@app.delete("/api/questionnaire/responses/{response_id}", tags=["Questionnaire"])
def admin_delete_response(response_id: str, authorization: Optional[str] = Header(None)):
    """Admin: permanently delete a tracer study response."""
    _require_admin(authorization)
    if not delete_response(response_id):
        raise HTTPException(status_code=404, detail="Response not found.")
    return {"status": "deleted", "response_id": response_id}



# ── LDA ───────────────────────────────────────────────────────────────────────

@app.get("/api/lda/recommend", tags=["LDA"])
def student_skill_recommendations(
    program: str = Query(..., description="Degree program"),
    major:   str = Query("",  description="Specialization or major (optional)"),
    authorization: Optional[str] = Header(None),
):
    """Student-facing: recommend skills based on degree program + major/specialization."""
    _get_current_user(authorization)
    return lda_analyzer.recommend_for_student(program, major=major)




@app.post("/api/lda/reload", tags=["LDA"])
def reload_model(authorization: Optional[str] = Header(None)):
    """
    Hot-reload lda_model.joblib without restarting the server.
    Use this after replacing the joblib file with a newly trained model.
    """
    _require_admin(authorization)
    return lda_analyzer.reload()


@app.get("/api/lda/topics", tags=["LDA"])
def lda_topics():
    return {"topics": lda_analyzer.topic_summary()}


# ── Employment Records (admin view) ───────────────────────────────────────────

@app.get("/api/employment/me", tags=["Employment"])
def get_my_employment(authorization: Optional[str] = Header(None)):
    """Student: fetch their own employment records."""
    user = _get_current_user(authorization)
    return [EmploymentResponse(**r) for r in records_for_user(user["user_id"])]


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


@app.get("/api/lda/skill-trends", tags=["LDA"])
def skill_trends_from_responses(authorization: Optional[str] = Header(None)):
    """
    Admin: run LDA on aggregated free-text skill answers from all responses.
    This is the correct corpus-level use of LDA — across all graduates,
    not on a single student's submission.
    """
    _require_admin(authorization)
    questions = read_questions()
    responses = read_all_responses()
    # Collect all job description + skills text per response (role-based)
    # Build option label maps for multi_choice semantic-role questions
    q_map = {q.get("semantic_role"): q for q in questions if q.get("semantic_role")}
    def _opt_label(q_obj, val):
        """Resolve a single_choice/multi_choice answer value to human-readable text."""
        if not q_obj or not val:
            return ""
        opts = {o["id"]: o["label"] for o in (q_obj.get("options") or [])}
        if isinstance(val, list):
            return " ".join(opts.get(v, v) for v in val)
        return opts.get(val, val)

    job_texts = []
    for r in responses:
        ans   = r.get("answers", {})
        parts = [
            _opt_label(q_map.get("job_title"),       get_answer_by_role(ans, "job_title")),
            get_answer_by_role(ans, "job_description") or "",
            _opt_label(q_map.get("skills_free_text"), get_answer_by_role(ans, "skills_free_text")),
        ]
        combined = " ".join(p for p in parts if p).strip()
        if combined:
            job_texts.append(combined)
    return lda_analyzer.analyze_industry_trends(job_texts)


# ── Question toggle (admin) ───────────────────────────────────────────────────

@app.patch("/api/questionnaire/questions/{question_id}/toggle", response_model=Question, tags=["Questionnaire"])
def toggle_question(question_id: str, authorization: Optional[str] = Header(None)):
    """
    Enable or disable a question.
    Disabled questions are hidden from the tracer study but preserved for data continuity.
    Protected questions can be disabled but not deleted.
    """
    _require_admin(authorization)
    q = next((q for q in read_questions() if q["question_id"] == question_id), None)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    updated = toggle_question_enabled(question_id, not q.get("enabled", True))
    return Question(**updated)


# ── Super Admin: account management ──────────────────────────────────────────

@app.post("/api/auth/init-superadmin", tags=["Auth"])
def init_superadmin(req: CreateAdminRequest):
    """
    Bootstrap endpoint: creates the first super admin account.
    Only works if no super_admin exists yet in the system.
    Disable or remove this route after initial setup.
    """
    if has_super_admin():
        raise HTTPException(status_code=409, detail="A super admin already exists. Use the admin panel to manage accounts.")
    if email_exists(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")

    token = str(uuid.uuid4())
    user  = {
        "user_id":          str(uuid.uuid4()),
        "first_name":       req.first_name,
        "last_name":        req.last_name,
        "email":            req.email,
        "password_hash":    hash_password(req.password),
        "role":             "super_admin",
        "token":            token,
        "token_expires_at": EXPIRES(),
        "student_id":       None,
        "program":          None,
        "major":            None,
        "graduation_year":  None,
        "sex":              None,
        "contact_number":   None,
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


@app.post("/api/admin/accounts", response_model=AuthResponse, tags=["Super Admin"])
def create_admin_account(req: CreateAdminRequest, authorization: Optional[str] = Header(None)):
    """Super admin: create a new admin or super_admin account."""
    _require_super_admin(authorization)
    if req.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'super_admin'.")
    if email_exists(req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")

    token = str(uuid.uuid4())
    user  = {
        "user_id":          str(uuid.uuid4()),
        "first_name":       req.first_name,
        "last_name":        req.last_name,
        "email":            req.email,
        "password_hash":    hash_password(req.password),
        "role":             req.role,
        "token":            token,
        "token_expires_at": EXPIRES(),
        "student_id":       None,
        "program":          None,
        "major":            None,
        "graduation_year":  None,
        "sex":              None,
        "contact_number":   None,
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


@app.get("/api/admin/accounts", tags=["Super Admin"])
def list_admin_accounts(authorization: Optional[str] = Header(None)):
    """Super admin: list all admin and super_admin accounts."""
    _require_super_admin(authorization)
    users = [u for u in list_users() if u.get("role") in ("admin", "super_admin")]
    return [UserProfile(**{k: v for k, v in u.items() if k != "password_hash"}) for u in users]


@app.delete("/api/admin/accounts/{user_id}", response_model=DeleteUserResponse, tags=["Super Admin"])
def delete_admin_account(user_id: str, authorization: Optional[str] = Header(None)):
    """Super admin: delete an admin account. Cannot delete your own account."""
    me = _require_super_admin(authorization)
    if me["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    target = find_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Account not found.")
    if target.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin accounts cannot be deleted through this endpoint.")
    delete_user(user_id)
    return DeleteUserResponse(status="deleted", user_id=user_id,
        message=f"Account for {target['first_name']} {target['last_name']} has been deleted.")


@app.delete("/api/users/{user_id}", response_model=DeleteUserResponse, tags=["Super Admin"])
def delete_student_account(user_id: str, authorization: Optional[str] = Header(None)):
    """Super admin: delete a student account."""
    _require_super_admin(authorization)
    target = find_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.get("role") != "student":
        raise HTTPException(status_code=400, detail="This endpoint only deletes student accounts.")
    delete_user(user_id)
    return DeleteUserResponse(status="deleted", user_id=user_id,
        message=f"Student account for {target['first_name']} {target['last_name']} has been deleted.")


@app.get("/api/users/all", tags=["Super Admin"])
def list_all_users_superadmin(authorization: Optional[str] = Header(None)):
    """Super admin: list every account in the system."""
    _require_super_admin(authorization)
    all_users = list_users()
    return [UserProfile(**{k: v for k, v in u.items() if k != "password_hash"}) for u in all_users]
