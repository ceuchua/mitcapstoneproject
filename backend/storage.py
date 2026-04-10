"""
storage.py  —  Graduate Tracer System v3
MongoDB Atlas persistence layer.
Replaces JSON file storage. Every function has the same signature as the
original so no other file (main.py, schemas.py, etc.) needs to change.

Required environment variables:
    MONGODB_URI     — Atlas connection string (mongodb+srv://...)
    MONGO_DB_NAME   — database name (default: tracer_system)
"""

import os
import hashlib
import logging
from collections import Counter

from pymongo import MongoClient, ASCENDING
from pymongo.collection import Collection

logger = logging.getLogger(__name__)


# ── Connection ────────────────────────────────────────────────────────────────

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("MONGO_DB_NAME", "tracer_system")

# certifi provides Mozilla's trusted CA bundle, which Atlas requires.
# MongoClient is lazy — no actual connection is made until the first query.
import certifi

_client = MongoClient(
    MONGO_URI,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=30000,
    connectTimeoutMS=20000,
    socketTimeoutMS=20000,
)
_db = _client[DB_NAME]


def _col(name: str) -> Collection:
    return _db[name]


def _clean(doc) -> dict | None:
    """Strip MongoDB's internal _id field from a document."""
    if doc is None:
        return None
    d = dict(doc)
    d.pop("_id", None)
    return d


def _clean_list(cursor) -> list[dict]:
    return [_clean(d) for d in cursor]


def _ensure_indexes() -> None:
    """Create indexes once on startup for query performance."""
    _col("users").create_index("user_id",  unique=True)
    _col("users").create_index("email",    unique=True, collation={"locale": "en", "strength": 2})
    _col("users").create_index("token",    sparse=True)
    _col("tracer_responses").create_index("user_id",     unique=True)
    _col("tracer_responses").create_index("response_id", unique=True)
    _col("employment_records").create_index("graduate_id")
    _col("employment_records").create_index("record_id",  unique=True)
    _col("questions").create_index("question_id",  unique=True)
    _col("questions").create_index("semantic_role", sparse=True)




# ── Helpers ───────────────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed


# ── Users / Auth ──────────────────────────────────────────────────────────────

def save_user(record: dict) -> None:
    _col("users").insert_one(dict(record))

def find_user_by_email(email: str) -> dict | None:
    return _clean(
        _col("users").find_one(
            {"email": email},
            collation={"locale": "en", "strength": 2},   # case-insensitive
        )
    )

def find_user_by_identifier(identifier: str) -> dict | None:
    """
    Find a user by email OR student ID.
    Tries email first (case-insensitive), then falls back to student_id.
    Allows students to log in with either their email or their student ID.
    """
    ident = identifier.strip()
    # Try email first
    user = next((u for u in _read(USERS_FILE) if u["email"].lower() == ident.lower()), None)
    if user:
        return user
    # Fall back to student_id (only students have this)
    user = next(
        (u for u in _read(USERS_FILE)
         if u.get("student_id") and u["student_id"] == ident),
        None,
    )
    return user

def find_user_by_id(user_id: str) -> dict | None:
    return _clean(_col("users").find_one({"user_id": user_id}))

def find_user_by_token(token: str) -> dict | None:
    if not token:
        return None
    return _clean(_col("users").find_one({"token": token}))

def update_user(user_id: str, updates: dict) -> dict | None:
    result = _col("users").find_one_and_update(
        {"user_id": user_id},
        {"$set": updates},
        return_document=True,
    )
    return _clean(result)

def list_users(role: str | None = None) -> list[dict]:
    query = {"role": role} if role else {}
    return _clean_list(_col("users").find(query))

def email_exists(email: str) -> bool:
    return _col("users").find_one(
        {"email": email},
        collation={"locale": "en", "strength": 2},
    ) is not None

def delete_user(user_id: str) -> bool:
    """
    Hard-delete a user and cascade: tracer response + employment records.
    """
    result = _col("users").delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        return False
    _col("tracer_responses").delete_many({"user_id": user_id})
    _col("employment_records").delete_many({"graduate_id": user_id})
    return True

def has_super_admin() -> bool:
    return _col("users").find_one({"role": "super_admin"}) is not None

def clear_all_tokens() -> int:
    result = _col("users").update_many(
        {"token": {"$nin": [None, ""]}},
        {"$set": {"token": None, "token_expires_at": None}},
    )
    return result.modified_count


# ── Employment Records ────────────────────────────────────────────────────────

def save_employment(record: dict) -> None:
    _col("employment_records").insert_one(dict(record))

def read_employment_records(limit: int = 100, offset: int = 0) -> list[dict]:
    return _clean_list(
        _col("employment_records").find().skip(offset).limit(limit)
    )

def records_for_user(user_id: str) -> list[dict]:
    return _clean_list(_col("employment_records").find({"graduate_id": user_id}))

def find_employment_record(record_id: str) -> dict | None:
    return _clean(_col("employment_records").find_one({"record_id": record_id}))

def all_job_texts() -> list[str]:
    texts = []
    for r in _col("employment_records").find():
        parts = [
            r.get("job_title")         or "",
            r.get("job_description")   or "",
            r.get("job_skills_required") or "",
        ]
        combined = " ".join(p for p in parts if p).strip()
        if combined:
            texts.append(combined)
    return texts


# ── Questionnaire Questions ───────────────────────────────────────────────────

DEFAULT_QUESTIONS = [
    # ─────────────────────────────────────────────────────────────────────────
    # SECTION A: GENERAL INFORMATION  (CHED GTS Q1-Q11)
    # Q1 Name, Q3 Email, Q4 Telephone, Q5 Mobile — captured at registration.
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_emp_status",
        "semantic_role": "employment_status",
        "protected":     True,
        "section":       "Employment",
        "text":          "What is your current employment status?",
        "type":          "single_choice",
        "options": [
            {"id":"single",        "label":"Single"},
            {"id":"married",       "label":"Married"},
            {"id":"separated",     "label":"Separated / Divorced"},
            {"id":"single_parent", "label":"Single Parent"},
            {"id":"widow",         "label":"Widow or Widower"},
        ],
        "required": False, "order": 2,
    },
    {
        "question_id":   "q_sex",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Sex",
        "type":          "single_choice",
        "options": [
            {"id":"male",   "label":"Male"},
            {"id":"female", "label":"Female"},
        ],
        "required": False, "order": 3,
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
        "order":         4,
    },
    {
        "question_id":   "q_region",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Region of Origin",
        "type":          "single_choice",
        "options": [
            {"id":"r1",    "label":"Region I"},
            {"id":"r2",    "label":"Region II"},
            {"id":"r3",    "label":"Region III"},
            {"id":"r4",    "label":"Region IV"},
            {"id":"r5",    "label":"Region V"},
            {"id":"r6",    "label":"Region VI"},
            {"id":"r7",    "label":"Region VII"},
            {"id":"r8",    "label":"Region VIII"},
            {"id":"r9",    "label":"Region IX"},
            {"id":"r10",   "label":"Region X"},
            {"id":"r11",   "label":"Region XI"},
            {"id":"r12",   "label":"Region XII"},
            {"id":"ncr",   "label":"NCR"},
            {"id":"car",   "label":"CAR"},
            {"id":"armm",  "label":"ARMM"},
            {"id":"caraga","label":"CARAGA"},
        ],
        "required": False, "order": 5,
    },
    {
        "question_id":   "q_province",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Province",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         6,
    },
    {
        "question_id":   "q_residence_type",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Location of Residence",
        "type":          "single_choice",
        "options": [
            {"id":"city",         "label":"City"},
            {"id":"municipality", "label":"Municipality"},
        ],
        "required": False, "order": 7,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION B: EDUCATIONAL BACKGROUND  (CHED GTS Q12-Q14)
    # Q12 split into 4 structured fields matching the CHED table columns.
    # Q13 split into 3 structured fields matching the CHED table columns.
    # ─────────────────────────────────────────────────────────────────────────

    # Q12 — Educational Attainment (4 columns)
    {
        "question_id":   "q_edu_degree_spec",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Degree(s) and Specialization(s) — e.g. BS in Teacher Education, major in Mathematics",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         8,
    },
    {
        "question_id":   "q_edu_university",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "College or University where degree was earned",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         9,
    },
    {
        "question_id":   "q_edu_year_grad",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Year Graduated",
        "type":          "number",
        "options":       None,
        "required":      False,
        "order":         10,
    },
    {
        "question_id":   "q_edu_honors",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Honor(s) or Award(s) Received",
        "type":          "single_choice",
        "options": [
            {"id":"summa",       "label":"Summa Cum Laude"},
            {"id":"magna",       "label":"Magna Cum Laude"},
            {"id":"cum_laude",   "label":"Cum Laude"},
            {"id":"with_honors", "label":"With Honors"},
            {"id":"deans_list",  "label":"Dean's List"},
            {"id":"none",        "label":"No Academic Honors"},
        ],
        "required": False, "order": 11,
    },

    # Q13 — Professional Examinations Passed (3 columns)
    {
        "question_id":   "q_prof_exam_name",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Name of Professional Examination Passed — e.g. Licensure Examination for Teachers (LET)",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         12,
    },
    {
        "question_id":   "q_prof_exam_date",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Date Taken — e.g. March 2023",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         13,
    },
    {
        "question_id":   "q_prof_exam_rating",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "Rating or Score — e.g. 81.25%",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         14,
    },

    # Q14 — Reason(s) for taking the course
    {
        "question_id":   "q_course_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Educational Background",
        "text":          "What were your reason(s) for taking your course or pursuing your degree? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"high_grades",     "label":"High grades in related subject areas"},
            {"id":"good_hs_grades",  "label":"Good grades in high school"},
            {"id":"parent_influence","label":"Influence of parents or relatives"},
            {"id":"peer_influence",  "label":"Peer influence"},
            {"id":"role_model",      "label":"Inspired by a role model"},
            {"id":"passion",         "label":"Strong passion for the profession"},
            {"id":"employment",      "label":"Prospect for immediate employment"},
            {"id":"prestige",        "label":"Status or prestige of the profession"},
            {"id":"availability",    "label":"Availability of course offering in chosen institution"},
            {"id":"career_advance",  "label":"Prospect of career advancement"},
            {"id":"affordable",      "label":"Affordable for the family"},
            {"id":"compensation",    "label":"Prospect of attractive compensation"},
            {"id":"abroad",          "label":"Opportunity for employment abroad"},
            {"id":"no_choice",       "label":"No particular choice or no better idea"},
        ],
        "required": False, "order": 15,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION C: TRAINING(S) / ADVANCE STUDIES  (CHED GTS Q15a-Q15b)
    # Q15a split into 3 structured fields matching the CHED table columns.
    # ─────────────────────────────────────────────────────────────────────────

    # Q15a — Training Programs (3 columns)
    {
        "question_id":   "q_training_title",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Training and Advance Studies",
        "text":          "Title of Training Program or Advance Study attended after college",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         16,
    },
    {
        "question_id":   "q_training_duration",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Training and Advance Studies",
        "text":          "Duration and Credits Earned — e.g. 3 days, 24 hours, 3 units",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         17,
    },
    {
        "question_id":   "q_training_institution",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Training and Advance Studies",
        "text":          "Name of Training Institution, College, or University",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         18,
    },

    # Q15b — Reason for advance studies
    {
        "question_id":   "q_advance_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Training and Advance Studies",
        "text":          "What made you pursue advance studies?",
        "type":          "single_choice",
        "options": [
            {"id":"promotion", "label":"For promotion"},
            {"id":"prof_dev",  "label":"For professional development"},
            {"id":"others",    "label":"Others"},
        ],
        "required": False, "order": 19,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION D: EMPLOYMENT DATA  (CHED GTS Q16-Q22)
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_emp_status",
        "semantic_role": "employment_status",
        "protected":     True,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Are you presently employed?",
        "type":          "single_choice",
        "options": [
            {"id":"employed",       "label":"Yes — Employed"},
            {"id":"unemployed",     "label":"No — Not Employed"},
            {"id":"never_employed", "label":"Never Been Employed"},
        ],
        "required": True, "order": 20,
    },
    {
        "question_id":   "q_unemployment_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "If not employed, please state your reason(s). (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"further_study",  "label":"Advance or further study"},
            {"id":"family_concern", "label":"Family concern — decided not to find a job"},
            {"id":"health",         "label":"Health-related reason(s)"},
            {"id":"no_experience",  "label":"Lack of work experience"},
            {"id":"no_opportunity", "label":"No job opportunity"},
            {"id":"did_not_look",   "label":"Did not look for a job"},
        ],
        "required": False, "order": 21,
    },
    {
        "question_id":   "q_emp_type",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Present Employment Status",
        "type":          "single_choice",
        "options": [
            {"id":"regular",      "label":"Regular or Permanent"},
            {"id":"temporary",    "label":"Temporary"},
            {"id":"contractual",  "label":"Contractual"},
            {"id":"casual",       "label":"Casual"},
            {"id":"self_employed","label":"Self-employed"},
        ],
        "required": False, "order": 22,
    },
    {
        "question_id":   "q_occupation",
        "semantic_role": "job_title",
        "protected":     True,
        "section":       "Employment",
        "text":          "What is your current job title or position?",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         24,
    },
    {
        "question_id":   "q_employer_sector",
        "semantic_role": "employer_sector",
        "protected":     True,
        "section":       "Employment",
        "text":          "Which sector does your employer belong to?",
        "type":          "single_choice",
        "options": [
            {"id":"agriculture",       "label":"Agriculture, Hunting and Forestry"},
            {"id":"fishing",           "label":"Fishing"},
            {"id":"mining",            "label":"Mining and Quarrying"},
            {"id":"manufacturing",     "label":"Manufacturing"},
            {"id":"utilities",         "label":"Electricity, Gas and Water Supply"},
            {"id":"construction",      "label":"Construction"},
            {"id":"trade",             "label":"Wholesale and Retail Trade"},
            {"id":"hotels",            "label":"Hotels and Restaurants"},
            {"id":"transport",         "label":"Transport, Storage and Communication"},
            {"id":"finance",           "label":"Financial Intermediation"},
            {"id":"real_estate",       "label":"Real Estate, Renting and Business Activities"},
            {"id":"public_admin",      "label":"Public Administration and Defense"},
            {"id":"education",         "label":"Education"},
            {"id":"health",            "label":"Health and Social Work"},
            {"id":"other_services",    "label":"Other Community, Social and Personal Services"},
            {"id":"private_household", "label":"Private Households with Employed Persons"},
            {"id":"international",     "label":"Extra-territorial Organizations and Bodies"},
        ],
        "required": False, "order": 25,
    },
    {
        "question_id":   "q_work_location",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Place of work",
        "type":          "single_choice",
        "options": [
            {"id":"local",  "label":"Local"},
            {"id":"abroad", "label":"Abroad"},
        ],
        "required": False, "order": 26,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION E: FIRST JOB  (CHED GTS Q22-Q31)
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_is_first_job",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "Is this your first job after college?",
        "type":          "single_choice",
        "options": [
            {"id":"yes","label":"Yes"},
            {"id":"no", "label":"No"},
        ],
        "required": False, "order": 27,
    },
    {
        "question_id":   "q_stay_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "What are your reason(s) for staying on the job? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"salary",        "label":"Salaries and benefits"},
            {"id":"career",        "label":"Career challenge"},
            {"id":"special_skill", "label":"Related to special skill"},
            {"id":"course_related","label":"Related to course or program of study"},
            {"id":"proximity",     "label":"Proximity to residence"},
            {"id":"peer",          "label":"Peer influence"},
            {"id":"family",        "label":"Family influence"},
        ],
        "required": False, "order": 28,
    },
    {
        "question_id":   "q_first_job_related",
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
        "required": False, "order": 29,
    },
    {
        "question_id":   "q_accept_reason",
        "semantic_role": None,
        "protected":     False,
        "section":       "Employment",
        "text":          "How many months after graduation did you find your first job?",
        "type":          "number",
        "options":       None,
        "required":      False,
        "order":         6,
    },
    {
        "question_id":   "q_job_search_method",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "How did you find your first job? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"advertisement", "label":"Response to an advertisement"},
            {"id":"walk_in",       "label":"As walk-in applicant"},
            {"id":"referral",      "label":"Recommended by someone"},
            {"id":"friends",       "label":"Information from friends"},
            {"id":"placement",     "label":"Arranged by school's job placement officer"},
            {"id":"family_biz",    "label":"Family business"},
            {"id":"job_fair",      "label":"Job Fair or Public Employment Service Office (PESO)"},
        ],
        "required": False, "order": 33,
    },
    {
        "question_id":   "q_time_to_job",
        "semantic_role": "months_to_employment",
        "protected":     True,
        "section":       "Skills",
        "text":          "Briefly describe your main duties and responsibilities:",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         7,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION F: CURRICULUM ASSESSMENT  (CHED GTS Q32-Q34)
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_curriculum_relevant",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "Curriculum Assessment",
        "text":          "Was the curriculum you had in college relevant to your first job?",
        "type":          "single_choice",
        "options": [
            {"id":"yes","label":"Yes"},
            {"id":"no", "label":"No"},
        ],
        "required": False, "order": 38,
    },
    {
        "question_id":   "q_competencies",
        "semantic_role": "skills_free_text",
        "protected":     True,
        "section":       "Skills",
        "text":          "List the skills you use most in your current job (separate with commas):",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         40,
    },

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION G: SATISFACTION  (system-required, not in CHED form)
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_satisfaction",
        "semantic_role": "satisfaction_rating",
        "protected":     False,
        "enabled":       True,
        "section":       "Satisfaction",
        "text":          "How satisfied are you with your current job? (1 = Very Dissatisfied, 5 = Very Satisfied)",
        "type":          "scale",
        "options": [
            {"id":"1","label":"1"}, {"id":"2","label":"2"}, {"id":"3","label":"3"},
            {"id":"4","label":"4"}, {"id":"5","label":"5"},
        ],
        "required": False, "order": 41,
    },
    {
        "question_id":   "q_curriculum_rating",
        "semantic_role": "curriculum_rating",
        "protected":     False,
        "enabled":       True,
        "section":       "Satisfaction",
        "text":          "How well did your degree curriculum prepare you for the workforce? (1 = Not at all, 5 = Very well)",
        "type":          "scale",
        "options": [
            {"id":"1","label":"1"}, {"id":"2","label":"2"}, {"id":"3","label":"3"},
            {"id":"4","label":"4"}, {"id":"5","label":"5"},
        ],
        "required": False, "order": 42,
    },
]
_CHED_QUESTION_IDS = {q["question_id"] for q in DEFAULT_QUESTIONS}

# IDs that exist ONLY in the old pre-CHED set (never appear in DEFAULT_QUESTIONS)
_OLD_EXCLUSIVE_IDS = {
    "q_job_title",     # old free-text; replaced by q_occupation
    "q_sector",        # old 4-option; replaced by q_employer_sector (17 CHED)
    "q_related",       # replaced by q_first_job_related
    "q_months_to_job", # replaced by q_time_to_job
    "q_job_desc",      # replaced by q_curriculum_suggest
    "q_skills_used",   # replaced by q_competencies
    "q_curriculum",    # replaced by q_curriculum_rating
}

# IDs exclusive to the full 42-question CHED set (never in pre-CHED version)
_CHED_EXCLUSIVE_IDS = {
    "q_civil_status", "q_region", "q_occupation",
    "q_first_job_related", "q_time_to_job", "q_competencies",
    "q_permanent_address", "q_sex", "q_birthday", "q_province",
    "q_edu_degree_spec", "q_edu_university", "q_edu_year_grad", "q_edu_honors",
    "q_prof_exam_name", "q_prof_exam_date", "q_prof_exam_rating",
    "q_training_title", "q_training_duration", "q_training_institution",
    "q_job_level_first",
}


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
    return _clean_list(_col("questions").find().sort("order", ASCENDING))


def read_questions_for_student() -> list[dict]:
    return _clean_list(
        _col("questions").find({"enabled": {"$ne": False}}).sort("order", ASCENDING)
    )


def get_question_by_role(role: str) -> dict | None:
    return _clean(_col("questions").find_one({"semantic_role": role}))


def get_answer_by_role(answers: dict, role: str) -> str | None:
    q = get_question_by_role(role)
    return answers.get(q["question_id"]) if q else None


def save_question(record: dict) -> None:
    _col("questions").insert_one(dict(record))


def update_question(question_id: str, updates: dict) -> dict | None:
    # Never allow overwriting semantic_role or protected
    updates.pop("semantic_role", None)
    updates.pop("protected",     None)
    result = _col("questions").find_one_and_update(
        {"question_id": question_id},
        {"$set": updates},
        return_document=True,
    )
    return _clean(result)


def toggle_question_enabled(question_id: str, enabled: bool) -> dict | None:
    result = _col("questions").find_one_and_update(
        {"question_id": question_id},
        {"$set": {"enabled": enabled}},
        return_document=True,
    )
    return _clean(result)


def delete_question(question_id: str) -> tuple[bool, str]:
    q = _col("questions").find_one({"question_id": question_id})
    if not q:
        return False, "not_found"
    if q.get("protected"):
        return False, "protected"
    _col("questions").delete_one({"question_id": question_id})
    return True, "ok"


# ── Tracer Responses ──────────────────────────────────────────────────────────

def save_response(record: dict) -> None:
    """Upsert — one response per student."""
    _col("tracer_responses").replace_one(
        {"user_id": record["user_id"]},
        dict(record),
        upsert=True,
    )

def get_response_by_user(user_id: str) -> dict | None:
    return _clean(_col("tracer_responses").find_one({"user_id": user_id}))

def read_all_responses() -> list[dict]:
    return _clean_list(_col("tracer_responses").find())

def get_response_by_id(response_id: str) -> dict | None:
    return _clean(_col("tracer_responses").find_one({"response_id": response_id}))

def delete_response(response_id: str) -> bool:
    """Delete response and cascade employment records for the same user."""
    r = _col("tracer_responses").find_one({"response_id": response_id})
    if not r:
        return False
    user_id = r.get("user_id")
    _col("tracer_responses").delete_one({"response_id": response_id})
    if user_id:
        _col("employment_records").delete_many({"graduate_id": user_id})
    return True


# ── Stats ─────────────────────────────────────────────────────────────────────

def compute_stats() -> dict:
    from skill_parser import parse_skills_from_responses

    users     = [u for u in list_users() if u.get("role") == "student"]
    responses = read_all_responses()
    questions = read_questions()

    def _by_role(answers, role):
        return get_answer_by_role(answers, role)

    status_counts:  Counter      = Counter()
    sector_counts:  Counter      = Counter()
    related_answers: list[str]   = []
    month_values:    list[float] = []
    satisfaction:    list[int]   = []
    curriculum:      list[int]   = []

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
        if s := _by_role(ans, "curriculum_rating"):
            try: curriculum.append(int(s))
            except (ValueError, TypeError): pass

    related_yes  = sum(1 for a in related_answers if a == "yes")
    related_rate = related_yes / len(related_answers) if related_answers else None

    prog_counter: Counter = Counter()
    year_counter: Counter = Counter()
    for u in users:
        if u.get("program"):
            prog_counter[u["program"]] += 1
        if u.get("graduation_year"):
            year_counter[u["graduation_year"]] += 1

    all_parsed_skills = parse_skills_from_responses(responses, questions)
    skill_freq        = Counter(all_parsed_skills)
    top_skills        = [{"skill": s, "count": c} for s, c in skill_freq.most_common(20)]

    return {
        "total_graduates":            len(users),
        "total_responses":            len(responses),
        "employment_status_counts":   dict(status_counts),
        "sector_counts":              dict(sector_counts),
        "related_to_course_rate":     related_rate,
        "records_by_program":         dict(prog_counter),
        "records_by_graduation_year": {str(k): v for k, v in year_counter.items()},
        "top_skills":                 top_skills,
        "avg_satisfaction":           round(sum(satisfaction)/len(satisfaction), 2) if satisfaction else None,
        "avg_curriculum_rating":      round(sum(curriculum)/len(curriculum), 2)     if curriculum   else None,
        "avg_months_to_employment":   round(sum(month_values)/len(month_values), 1) if month_values  else None,
    }
