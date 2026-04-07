"""
storage.py  —  Graduate Tracer System v3
JSON-file persistence. Swap for PostgreSQL/SQLAlchemy when scaling.
"""

import json
import os
import hashlib
from pathlib import Path
from collections import Counter

DATA_DIR       = Path(os.getenv("TRACER_DATA_DIR", "./data"))
USERS_FILE     = DATA_DIR / "users.json"
EMPLOYMENT_FILE= DATA_DIR / "employment_records.json"
QUESTIONS_FILE = DATA_DIR / "questions.json"
RESPONSES_FILE = DATA_DIR / "tracer_responses.json"

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

def delete_user(user_id: str) -> bool:
    """
    Hard-delete a user account and cascade-delete all their associated data:
      - tracer study response
      - employment records (source of skill trend analysis)
    Returns True if the user was found and deleted.
    """
    data = _read(USERS_FILE)
    new_data = [u for u in data if u["user_id"] != user_id]
    if len(new_data) == len(data):
        return False
    _write(USERS_FILE, new_data)
    # Cascade: tracer response
    responses = _read(RESPONSES_FILE)
    new_responses = [r for r in responses if r.get("user_id") != user_id]
    if len(new_responses) != len(responses):
        _write(RESPONSES_FILE, new_responses)
    # Cascade: employment records (feeds industry skill trends)
    emp = _read(EMPLOYMENT_FILE)
    new_emp = [r for r in emp if r.get("graduate_id") != user_id]
    if len(new_emp) != len(emp):
        _write(EMPLOYMENT_FILE, new_emp)
    return True


def has_super_admin() -> bool:
    return any(u.get("role") == "super_admin" for u in _read(USERS_FILE))


def clear_all_tokens() -> int:
    data    = _read(USERS_FILE)
    cleared = 0
    for user in data:
        if user.get("token"):
            user["token"]            = None
            user["token_expires_at"] = None
            cleared += 1
    if cleared:
        _write(USERS_FILE, data)
    return cleared


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
#
# Each question carries two stability fields:
#   semantic_role : str | None
#       Stable identifier used by backend analytics — NEVER changes even if
#       the admin renames or rewrites the question text.
#       The dashboard queries by role, not by question_id.
#
#   protected : bool
#       If True, the admin UI shows a lock icon and blocks deletion.
#       The admin can still edit question text and options, but cannot
#       remove the question or change its semantic_role.
#
# Semantic roles in use:
#   employment_status   → pie chart, LDA trigger condition
#   employer_name       → admin table display
#   job_title           → admin table, skill trend LDA input
#   employer_sector     → sector pie chart
#   course_relevance    → related-to-course rate
#   months_to_employment→ time-to-job metric
#   job_description     → skill trend LDA corpus
#   skills_free_text    → parsed into skill list, skill frequency chart
#   satisfaction_rating → satisfaction chart
#   curriculum_rating   → curriculum satisfaction chart
#   (None)              → admin-added custom questions, shown generically

DEFAULT_QUESTIONS = [
    {
        "question_id":   "q_emp_status",
        "semantic_role": "employment_status",
        "protected":     True,
        "section":       "Employment",
        "text":          "What is your current employment status?",
        "type":          "single_choice",
        "options": [
            {"id": "employed",        "label": "Employed"},
            {"id": "self_employed",   "label": "Self-employed"},
            {"id": "unemployed",      "label": "Unemployed"},
            {"id": "further_studies", "label": "Pursuing Further Studies"},
        ],
        "required": True,
        "order": 1,
    },
    {
        "question_id":   "q_employer_name",
        "semantic_role": "employer_name",
        "protected":     True,
        "section":       "Employment",
        "text":          "Name of your employer or company:",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         2,
    },
    {
        "question_id":   "q_job_title",
        "semantic_role": "job_title",
        "protected":     True,
        "section":       "Employment",
        "text":          "What is your current job title or position?",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         3,
    },
    {
        "question_id":   "q_sector",
        "semantic_role": "employer_sector",
        "protected":     True,
        "section":       "Employment",
        "text":          "Which sector does your employer belong to?",
        "type":          "single_choice",
        "options": [
            {"id": "private",    "label": "Private"},
            {"id": "government", "label": "Government"},
            {"id": "ngo",        "label": "NGO / Non-profit"},
            {"id": "self",       "label": "Self-employed / Freelance"},
        ],
        "required": False,
        "order": 4,
    },
    {
        "question_id":   "q_related",
        "semantic_role": "course_relevance",
        "protected":     True,
        "section":       "Employment",
        "text":          "Is your current job related to your degree program?",
        "type":          "single_choice",
        "options": [
            {"id": "yes",        "label": "Yes"},
            {"id": "no",         "label": "No"},
            {"id": "partially",  "label": "Partially"},
        ],
        "required": False,
        "order": 5,
    },
    {
        "question_id":   "q_months_to_job",
        "semantic_role": "months_to_employment",
        "protected":     False,
        "section":       "Employment",
        "text":          "How many months after graduation did you find your first job?",
        "type":          "number",
        "options":       None,
        "required":      False,
        "order":         6,
    },
    {
        "question_id":   "q_job_desc",
        "semantic_role": "job_description",
        "protected":     True,
        "section":       "Skills",
        "text":          "Briefly describe your main duties and responsibilities:",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         7,
    },
    {
        "question_id":   "q_skills_used",
        "semantic_role": "skills_free_text",
        "protected":     True,
        "section":       "Skills",
        "text":          "List the skills you use most in your current job (separate with commas):",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         8,
    },
    {
        "question_id":   "q_satisfaction",
        "semantic_role": "satisfaction_rating",
        "protected":     False,
        "section":       "Satisfaction",
        "text":          "How satisfied are you with your current job? (1 = Very dissatisfied, 5 = Very satisfied)",
        "type":          "scale",
        "options": [
            {"id": "1", "label": "1"}, {"id": "2", "label": "2"},
            {"id": "3", "label": "3"}, {"id": "4", "label": "4"},
            {"id": "5", "label": "5"},
        ],
        "required": False,
        "order": 9,
    },
    {
        "question_id":   "q_curriculum",
        "semantic_role": "curriculum_rating",
        "protected":     False,
        "section":       "Satisfaction",
        "text":          "How well did your degree curriculum prepare you for the workforce? (1 = Not at all, 5 = Very well)",
        "type":          "scale",
        "options": [
            {"id": "1", "label": "1"}, {"id": "2", "label": "2"},
            {"id": "3", "label": "3"}, {"id": "4", "label": "4"},
            {"id": "5", "label": "5"},
        ],
        "required": False,
        "order": 10,
    },
]


def _migrate_questions(data: list[dict]) -> list[dict]:
    """
    Add semantic_role, protected, and enabled fields to existing questions.
    Ensures old questions.json files are forward-compatible without data loss.
    """
    role_map = {q["question_id"]: q for q in DEFAULT_QUESTIONS}
    changed  = False
    for q in data:
        defaults = role_map.get(q["question_id"], {})
        if "semantic_role" not in q:
            q["semantic_role"] = defaults.get("semantic_role", None)
            changed = True
        if "protected" not in q:
            q["protected"] = defaults.get("protected", False)
            changed = True
        if "enabled" not in q:
            q["enabled"] = True   # existing questions default to enabled
            changed = True
    return data, changed


def _ensure_default_questions() -> None:
    if not QUESTIONS_FILE.exists():
        # Add enabled:True to all defaults on first write
        defaults_with_enabled = [{**q, "enabled": True} for q in DEFAULT_QUESTIONS]
        _write(QUESTIONS_FILE, defaults_with_enabled)
        return
    # Migrate existing file if fields are missing
    data           = _read(QUESTIONS_FILE)
    migrated, changed = _migrate_questions(data)
    if changed:
        _write(QUESTIONS_FILE, migrated)


def read_questions() -> list[dict]:
    _ensure_default_questions()
    return sorted(_read(QUESTIONS_FILE), key=lambda q: q.get("order", 0))


def get_question_by_role(role: str) -> dict | None:
    """Return the first question with the given semantic_role."""
    return next(
        (q for q in read_questions() if q.get("semantic_role") == role),
        None,
    )


def get_answer_by_role(answers: dict, role: str) -> str | None:
    """
    Look up a student's answer by semantic role rather than question_id.
    Safe against admin renames — role is stable, question_id may change.
    """
    q = get_question_by_role(role)
    if q:
        return answers.get(q["question_id"])
    return None


def save_question(record: dict) -> None:
    data = _read(QUESTIONS_FILE)
    data.append(record)
    _write(QUESTIONS_FILE, data)


def toggle_question_enabled(question_id: str, enabled: bool) -> dict | None:
    """Enable or disable a question. Protected questions can also be toggled."""
    data = read_questions()
    for i, q in enumerate(data):
        if q["question_id"] == question_id:
            data[i] = {**q, "enabled": enabled}
            _write(QUESTIONS_FILE, data)
            return data[i]
    return None


def read_questions_for_student() -> list[dict]:
    """Return only enabled questions — what students see in the tracer study."""
    return [q for q in read_questions() if q.get("enabled", True)]


def update_question(question_id: str, updates: dict) -> dict | None:
    data = read_questions()
    for i, q in enumerate(data):
        if q["question_id"] == question_id:
            # Never allow overwriting semantic_role or protected via update
            updates.pop("semantic_role", None)
            updates.pop("protected",     None)
            data[i] = {**q, **updates}
            _write(QUESTIONS_FILE, data)
            return data[i]
    return None


def delete_question(question_id: str) -> tuple[bool, str]:
    """
    Returns (success, reason).
    Protected questions cannot be deleted.
    """
    data = read_questions()
    target = next((q for q in data if q["question_id"] == question_id), None)
    if not target:
        return False, "not_found"
    if target.get("protected"):
        return False, "protected"
    new_data = [q for q in data if q["question_id"] != question_id]
    _write(QUESTIONS_FILE, new_data)
    return True, "ok"


# ── Tracer Responses ──────────────────────────────────────────────────────────

def save_response(record: dict) -> None:
    data = _read(RESPONSES_FILE)
    data = [r for r in data if r["user_id"] != record["user_id"]]
    data.append(record)
    _write(RESPONSES_FILE, data)

def get_response_by_user(user_id: str) -> dict | None:
    return next((r for r in _read(RESPONSES_FILE) if r["user_id"] == user_id), None)

def read_all_responses() -> list[dict]:
    return _read(RESPONSES_FILE)

def get_response_by_id(response_id: str) -> dict | None:
    return next((r for r in _read(RESPONSES_FILE) if r["response_id"] == response_id), None)

def delete_response(response_id: str) -> bool:
    """
    Delete a single tracer response by ID and cascade-delete the corresponding
    employment record (source of skill trend data). Returns True if deleted.
    """
    data = _read(RESPONSES_FILE)
    target = next((r for r in data if r["response_id"] == response_id), None)
    if not target:
        return False
    _write(RESPONSES_FILE, [r for r in data if r["response_id"] != response_id])
    # Cascade: employment record for the same user
    user_id = target.get("user_id")
    if user_id:
        emp = _read(EMPLOYMENT_FILE)
        new_emp = [r for r in emp if r.get("graduate_id") != user_id]
        if len(new_emp) != len(emp):
            _write(EMPLOYMENT_FILE, new_emp)
    return True




# ── Stats ─────────────────────────────────────────────────────────────────────

def compute_stats() -> dict:
    from skill_parser import parse_skills_from_responses

    users     = [u for u in _read(USERS_FILE) if u.get("role") == "student"]
    responses = _read(RESPONSES_FILE)
    questions = read_questions()

    # ── Role-based answer lookup (flex against admin edits) ───────────────────

    def _by_role(answers: dict, role: str) -> str | None:
        return get_answer_by_role(answers, role)

    # Employment status counts
    status_counts: Counter = Counter()
    sector_counts: Counter = Counter()
    related_answers: list[str] = []
    month_values:   list[float] = []
    satisfaction:   list[int]   = []
    curriculum:     list[int]   = []

    for r in responses:
        ans = r.get("answers", {})

        status = _by_role(ans, "employment_status")
        if status:
            status_counts[status] += 1

        sector = _by_role(ans, "employer_sector")
        if sector:
            sector_counts[sector] += 1

        related = _by_role(ans, "course_relevance")
        if related:
            related_answers.append(related)

        months = _by_role(ans, "months_to_employment")
        if months:
            try: month_values.append(float(months))
            except (ValueError, TypeError): pass

        sat = _by_role(ans, "satisfaction_rating")
        if sat:
            try: satisfaction.append(int(sat))
            except (ValueError, TypeError): pass

        cur = _by_role(ans, "curriculum_rating")
        if cur:
            try: curriculum.append(int(cur))
            except (ValueError, TypeError): pass

    # Related-to-course rate
    related_yes  = sum(1 for a in related_answers if a == "yes")
    related_rate = related_yes / len(related_answers) if related_answers else None

    # By program
    prog_counter: Counter = Counter()
    year_counter: Counter = Counter()
    for u in users:
        if u.get("program"):
            prog_counter[u["program"]] += 1
        if u.get("graduation_year"):
            year_counter[u["graduation_year"]] += 1

    # Parsed skill frequency (role-based, not hardcoded ID)
    all_parsed_skills = parse_skills_from_responses(responses, questions)
    skill_freq        = Counter(all_parsed_skills)
    top_skills        = [{"skill": s, "count": c} for s, c in skill_freq.most_common(20)]

    # Average satisfaction ratings
    avg_satisfaction = round(sum(satisfaction) / len(satisfaction), 2) if satisfaction else None
    avg_curriculum   = round(sum(curriculum)   / len(curriculum),   2) if curriculum   else None
    avg_months       = round(sum(month_values) / len(month_values), 1) if month_values  else None

    return {
        "total_graduates":            len(users),
        "total_responses":            len(responses),
        "employment_status_counts":   dict(status_counts),
        "sector_counts":              dict(sector_counts),
        "related_to_course_rate":     related_rate,
        "records_by_program":         dict(prog_counter),
        "records_by_graduation_year": {str(k): v for k, v in year_counter.items()},
        "top_skills":                 top_skills,        # parsed from free-text
        "avg_satisfaction":           avg_satisfaction,
        "avg_curriculum_rating":      avg_curriculum,
        "avg_months_to_employment":   avg_months,
    }
