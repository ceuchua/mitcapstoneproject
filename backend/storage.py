"""
storage.py  —  Graduate Tracer System v3
JSON-file persistence. Swap for PostgreSQL/SQLAlchemy when scaling.
"""

import json
import os
import hashlib
from pathlib import Path
from collections import Counter

DATA_DIR           = Path(os.getenv("TRACER_DATA_DIR", "./data"))
USERS_FILE         = DATA_DIR / "users.json"
EMPLOYMENT_FILE    = DATA_DIR / "employment_records.json"
QUESTIONS_FILE     = DATA_DIR / "questions.json"
RESPONSES_FILE     = DATA_DIR / "tracer_responses.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write(path: Path, data: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed


# ── Users / Auth ──────────────────────────────────────────────────────────────

def save_user(record: dict) -> None:
    data = _read(USERS_FILE)
    data.append(record)
    _write(USERS_FILE, data)

def find_user_by_email(email: str) -> dict | None:
    return next((u for u in _read(USERS_FILE) if u["email"].lower() == email.lower()), None)

def find_user_by_id(user_id: str) -> dict | None:
    return next((u for u in _read(USERS_FILE) if u["user_id"] == user_id), None)

def find_user_by_token(token: str) -> dict | None:
    return next((u for u in _read(USERS_FILE) if u.get("token") == token), None)

def update_user(user_id: str, updates: dict) -> dict | None:
    data = _read(USERS_FILE)
    for i, u in enumerate(data):
        if u["user_id"] == user_id:
            data[i] = {**u, **updates}
            _write(USERS_FILE, data)
            return data[i]
    return None

def list_users(role: str | None = None) -> list[dict]:
    users = _read(USERS_FILE)
    if role:
        users = [u for u in users if u.get("role") == role]
    return users

def email_exists(email: str) -> bool:
    return find_user_by_email(email) is not None


# ── Employment Records ────────────────────────────────────────────────────────

def save_employment(record: dict) -> None:
    data = _read(EMPLOYMENT_FILE)
    data.append(record)
    _write(EMPLOYMENT_FILE, data)

def read_employment_records(limit: int = 100, offset: int = 0) -> list[dict]:
    return _read(EMPLOYMENT_FILE)[offset: offset + limit]

def records_for_user(user_id: str) -> list[dict]:
    return [r for r in _read(EMPLOYMENT_FILE) if r.get("graduate_id") == user_id]

def find_employment_record(record_id: str) -> dict | None:
    return next((r for r in _read(EMPLOYMENT_FILE) if r["record_id"] == record_id), None)

def all_job_texts() -> list[str]:
    texts = []
    for r in _read(EMPLOYMENT_FILE):
        parts = [r.get("job_title") or "", r.get("job_description") or "", r.get("job_skills_required") or ""]
        combined = " ".join(p for p in parts if p).strip()
        if combined:
            texts.append(combined)
    return texts


# ── Questionnaire Questions ───────────────────────────────────────────────────

DEFAULT_QUESTIONS = [
    {
        "question_id": "q_emp_status",
        "section": "Employment",
        "text": "What is your current employment status?",
        "type": "single_choice",
        "options": [
            {"id": "employed", "label": "Employed"},
            {"id": "self_employed", "label": "Self-employed"},
            {"id": "unemployed", "label": "Unemployed"},
            {"id": "further_studies", "label": "Pursuing Further Studies"},
        ],
        "required": True,
        "order": 1,
    },
    {
        "question_id": "q_employer_name",
        "section": "Employment",
        "text": "Name of your employer or company:",
        "type": "text",
        "options": None,
        "required": False,
        "order": 2,
    },
    {
        "question_id": "q_job_title",
        "section": "Employment",
        "text": "What is your current job title?",
        "type": "text",
        "options": None,
        "required": False,
        "order": 3,
    },
    {
        "question_id": "q_sector",
        "section": "Employment",
        "text": "Which sector does your employer belong to?",
        "type": "single_choice",
        "options": [
            {"id": "private", "label": "Private"},
            {"id": "government", "label": "Government"},
            {"id": "ngo", "label": "NGO / Non-profit"},
            {"id": "self", "label": "Self-employed / Freelance"},
        ],
        "required": False,
        "order": 4,
    },
    {
        "question_id": "q_related",
        "section": "Employment",
        "text": "Is your current job related to your degree program?",
        "type": "single_choice",
        "options": [
            {"id": "yes", "label": "Yes"},
            {"id": "no", "label": "No"},
            {"id": "partially", "label": "Partially"},
        ],
        "required": False,
        "order": 5,
    },
    {
        "question_id": "q_months_to_job",
        "section": "Employment",
        "text": "How many months after graduation did you find your first job?",
        "type": "number",
        "options": None,
        "required": False,
        "order": 6,
    },
    {
        "question_id": "q_job_desc",
        "section": "Skills",
        "text": "Briefly describe your main duties and responsibilities:",
        "type": "text",
        "options": None,
        "required": False,
        "order": 7,
    },
    {
        "question_id": "q_skills_used",
        "section": "Skills",
        "text": "What skills do you use most in your current job?",
        "type": "text",
        "options": None,
        "required": False,
        "order": 8,
    },
    {
        "question_id": "q_satisfaction",
        "section": "Satisfaction",
        "text": "How satisfied are you with your current job? (1 = Very dissatisfied, 5 = Very satisfied)",
        "type": "scale",
        "options": [
            {"id": "1", "label": "1"}, {"id": "2", "label": "2"},
            {"id": "3", "label": "3"}, {"id": "4", "label": "4"}, {"id": "5", "label": "5"},
        ],
        "required": False,
        "order": 9,
    },
    {
        "question_id": "q_curriculum",
        "section": "Satisfaction",
        "text": "How well did your degree curriculum prepare you for the workforce? (1 = Not at all, 5 = Very well)",
        "type": "scale",
        "options": [
            {"id": "1", "label": "1"}, {"id": "2", "label": "2"},
            {"id": "3", "label": "3"}, {"id": "4", "label": "4"}, {"id": "5", "label": "5"},
        ],
        "required": False,
        "order": 10,
    },
]

def _ensure_default_questions() -> None:
    if not QUESTIONS_FILE.exists():
        _write(QUESTIONS_FILE, DEFAULT_QUESTIONS)

def read_questions() -> list[dict]:
    _ensure_default_questions()
    return sorted(_read(QUESTIONS_FILE), key=lambda q: q.get("order", 0))

def save_question(record: dict) -> None:
    data = _read(QUESTIONS_FILE)
    data.append(record)
    _write(QUESTIONS_FILE, data)

def update_question(question_id: str, updates: dict) -> dict | None:
    data = read_questions()
    for i, q in enumerate(data):
        if q["question_id"] == question_id:
            data[i] = {**q, **updates}
            _write(QUESTIONS_FILE, data)
            return data[i]
    return None

def delete_question(question_id: str) -> bool:
    data = read_questions()
    new_data = [q for q in data if q["question_id"] != question_id]
    if len(new_data) == len(data):
        return False
    _write(QUESTIONS_FILE, new_data)
    return True


# ── Tracer Responses ──────────────────────────────────────────────────────────

def save_response(record: dict) -> None:
    data = _read(RESPONSES_FILE)
    # Replace if user already submitted
    data = [r for r in data if r["user_id"] != record["user_id"]]
    data.append(record)
    _write(RESPONSES_FILE, data)

def get_response_by_user(user_id: str) -> dict | None:
    return next((r for r in _read(RESPONSES_FILE) if r["user_id"] == user_id), None)

def read_all_responses() -> list[dict]:
    return _read(RESPONSES_FILE)


# ── Stats ─────────────────────────────────────────────────────────────────────

def compute_stats() -> dict:
    users     = [u for u in _read(USERS_FILE) if u.get("role") == "student"]
    emp_recs  = _read(EMPLOYMENT_FILE)
    responses = _read(RESPONSES_FILE)

    # Pull employment status from tracer responses
    status_counts: Counter = Counter()
    sector_counts: Counter = Counter()
    for r in responses:
        ans = r.get("answers", {})
        status = ans.get("q_emp_status")
        if status:
            status_counts[status] += 1
        sector = ans.get("q_sector")
        if sector:
            sector_counts[sector] += 1

    # Related to course
    related_answers = [r["answers"].get("q_related") for r in responses if r.get("answers", {}).get("q_related")]
    related_yes = sum(1 for a in related_answers if a == "yes")
    related_rate = related_yes / len(related_answers) if related_answers else None

    # By program
    prog_counter: Counter = Counter()
    year_counter: Counter = Counter()
    for u in users:
        if u.get("program"):
            prog_counter[u["program"]] += 1
        if u.get("graduation_year"):
            year_counter[u["graduation_year"]] += 1

    # Gap skills from employment records
    all_gap: list[str] = []
    for r in emp_recs:
        all_gap.extend(r.get("gap_skills") or [])
    top_gap = [{"skill": s, "count": c} for s, c in Counter(all_gap).most_common(15)]

    # Alignment by program
    user_map = {u["user_id"]: u for u in users}
    prog_scores: dict[str, list[float]] = {}
    for r in emp_recs:
        score = r.get("alignment_score")
        u = user_map.get(r.get("graduate_id", ""))
        if score is not None and u:
            prog = u.get("program", "Unknown")
            prog_scores.setdefault(prog, []).append(score)
    avg_alignment = {p: round(sum(v)/len(v), 4) for p, v in prog_scores.items()}

    return {
        "total_graduates":            len(users),
        "total_responses":            len(responses),
        "employment_status_counts":   dict(status_counts),
        "sector_counts":              dict(sector_counts),
        "related_to_course_rate":     related_rate,
        "records_by_program":         dict(prog_counter),
        "records_by_graduation_year": {str(k): v for k, v in year_counter.items()},
        "top_gap_skills":             top_gap,
        "avg_alignment_by_program":   avg_alignment,
    }
