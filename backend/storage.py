"""
storage.py — Graduate Tracer System v3
Dual-mode persistence:
  • Local / dev  → JSON files  (no env vars needed)
  • Production   → MongoDB Atlas (set MONGODB_URI environment variable)

Mode is detected automatically at startup. No code changes needed to switch.
"""

import json
import logging
import os
import hashlib
from pathlib import Path
from collections import Counter

logger = logging.getLogger(__name__)

# ── Mode detection ─────────────────────────────────────────────────────────────
#
#   Local dev  : MONGODB_URI is not set → JSON files in ./data/
#   Production : MONGODB_URI is set     → MongoDB Atlas
#
_MONGO_URI = os.getenv("MONGODB_URI", "").strip()
_USE_MONGO = bool(_MONGO_URI)

# ── MongoDB setup (production) ────────────────────────────────────────────────

if _USE_MONGO:
    try:
        import certifi
        from pymongo import MongoClient, UpdateOne
        _client = MongoClient(_MONGO_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        _DB     = _client[os.getenv("MONGO_DB_NAME", "tracer_system")]
        logger.info("storage: MongoDB Atlas mode — db=%s", _DB.name)
    except Exception as _mongo_err:
        logger.error("storage: MongoDB init failed: %s — falling back to JSON", _mongo_err)
        _USE_MONGO = False

def _col(name: str):
    """Return a MongoDB collection. Only called when _USE_MONGO is True."""
    return _DB[name]

def _clean(doc: dict) -> dict:
    """Strip MongoDB's internal _id field before returning a document."""
    if doc is None:
        return None
    d = dict(doc)
    d.pop("_id", None)
    return d

def _clean_list(docs) -> list[dict]:
    return [_clean(d) for d in docs]

# ── JSON setup (local dev) ────────────────────────────────────────────────────

DATA_DIR        = Path(os.getenv("TRACER_DATA_DIR", "./data"))
USERS_FILE      = DATA_DIR / "users.json"
EMPLOYMENT_FILE = DATA_DIR / "employment_records.json"
QUESTIONS_FILE  = DATA_DIR / "questions.json"
RESPONSES_FILE  = DATA_DIR / "tracer_responses.json"

if not _USE_MONGO:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("storage: JSON file mode — data dir=%s", DATA_DIR)

def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write(path: Path, data: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ── Common utilities ──────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed

DEFAULT_QUESTIONS = [
    # ─────────────────────────────────────────────────────────────────────────
    # SECTION A: GENERAL INFORMATION  (CHED GTS Q1-Q11)
    # Q1 Name, Q3 Email, Q4 Telephone, Q5 Mobile — captured at registration.
    # ─────────────────────────────────────────────────────────────────────────
    {
        "question_id":   "q_permanent_address",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Permanent Address",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         1,
    },
    {
        "question_id":   "q_civil_status",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Civil Status",
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
        "question_id":   "q_birthday",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "General Information",
        "text":          "Birthday (Month / Day / Year)",
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
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Present Occupation (Philippine Standard Occupational Classification — PSOC 1992)",
        "type":          "single_choice",
        "options": [
            {"id":"officials_managers", "label":"Officials, Corporate Executives, Managers and Supervisors"},
            {"id":"professionals",      "label":"Professionals"},
            {"id":"technicians",        "label":"Technicians and Associate Professionals"},
            {"id":"clerks",             "label":"Clerks"},
            {"id":"service_workers",    "label":"Service Workers and Shop and Market Sales Workers"},
            {"id":"farmers",            "label":"Farmers, Forestry Workers and Fishermen"},
            {"id":"trades_workers",     "label":"Trades and Related Workers"},
            {"id":"plant_operators",    "label":"Plant and Machine Operators and Assemblers"},
            {"id":"laborers",           "label":"Laborers and Unskilled Workers"},
            {"id":"special_occupation", "label":"Special Occupation"},
        ],
        "required": False, "order": 23,
    },
    {
        "question_id":   "q_employer_name",
        "semantic_role": "employer_name",
        "protected":     True,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Name of Company or Organization (including address)",
        "type":          "text",
        "options":       None,
        "required":      False,
        "order":         24,
    },
    {
        "question_id":   "q_employer_sector",
        "semantic_role": "employer_sector",
        "protected":     True,
        "enabled":       True,
        "section":       "Employment Data",
        "text":          "Major line of business of the company you are presently employed in:",
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
        "enabled":       True,
        "section":       "First Job",
        "text":          "Is your first job related to the course you took up in college?",
        "type":          "single_choice",
        "options": [
            {"id":"yes","label":"Yes"},
            {"id":"no", "label":"No"},
        ],
        "required": False, "order": 29,
    },
    {
        "question_id":   "q_accept_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "If not related to your course, what were your reasons for accepting the job? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"salary",        "label":"Salaries and benefits"},
            {"id":"career",        "label":"Career challenge"},
            {"id":"special_skill", "label":"Related to special skills"},
            {"id":"proximity",     "label":"Proximity to residence"},
        ],
        "required": False, "order": 30,
    },
    {
        "question_id":   "q_change_reason",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "What were your reason(s) for changing job? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"salary",        "label":"Salaries and benefits"},
            {"id":"career",        "label":"Career challenge"},
            {"id":"special_skill", "label":"Related to special skills"},
            {"id":"proximity",     "label":"Proximity to residence"},
        ],
        "required": False, "order": 31,
    },
    {
        "question_id":   "q_first_job_duration",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "How long did you stay in your first job?",
        "type":          "single_choice",
        "options": [
            {"id":"lt_1m", "label":"Less than a month"},
            {"id":"1_6m",  "label":"1 to 6 months"},
            {"id":"7_11m", "label":"7 to 11 months"},
            {"id":"1_2y",  "label":"1 year to less than 2 years"},
            {"id":"2_3y",  "label":"2 years to less than 3 years"},
            {"id":"3_4y",  "label":"3 years to less than 4 years"},
        ],
        "required": False, "order": 32,
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
        "enabled":       True,
        "section":       "First Job",
        "text":          "How long did it take you to land your first job after graduation?",
        "type":          "single_choice",
        "options": [
            {"id":"lt_1m", "label":"Less than a month"},
            {"id":"1_6m",  "label":"1 to 6 months"},
            {"id":"7_11m", "label":"7 to 11 months"},
            {"id":"1_2y",  "label":"1 year to less than 2 years"},
            {"id":"2_3y",  "label":"2 years to less than 3 years"},
            {"id":"3_4y",  "label":"3 years to less than 4 years"},
        ],
        "required": False, "order": 34,
    },
    {
        "question_id":   "q_job_level_first",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "Job Level Position — First Job",
        "type":          "single_choice",
        "options": [
            {"id":"rank_clerical", "label":"Rank or Clerical"},
            {"id":"professional",  "label":"Professional, Technical or Supervisory"},
            {"id":"managerial",    "label":"Managerial or Executive"},
            {"id":"self_employed", "label":"Self-employed"},
        ],
        "required": False, "order": 35,
    },
    {
        "question_id":   "q_job_level",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "Job Level Position — Current or Present Job",
        "type":          "single_choice",
        "options": [
            {"id":"rank_clerical", "label":"Rank or Clerical"},
            {"id":"professional",  "label":"Professional, Technical or Supervisory"},
            {"id":"managerial",    "label":"Managerial or Executive"},
            {"id":"self_employed", "label":"Self-employed"},
        ],
        "required": False, "order": 36,
    },
    {
        "question_id":   "q_monthly_income",
        "semantic_role": None,
        "protected":     False,
        "enabled":       True,
        "section":       "First Job",
        "text":          "What was your initial gross monthly earning in your first job after college?",
        "type":          "single_choice",
        "options": [
            {"id":"below_5k",  "label":"Below ₱5,000"},
            {"id":"5k_10k",    "label":"₱5,000 to less than ₱10,000"},
            {"id":"10k_15k",   "label":"₱10,000 to less than ₱15,000"},
            {"id":"15k_20k",   "label":"₱15,000 to less than ₱20,000"},
            {"id":"20k_25k",   "label":"₱20,000 to less than ₱25,000"},
            {"id":"above_25k", "label":"₱25,000 and above"},
        ],
        "required": False, "order": 37,
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
        "enabled":       True,
        "section":       "Curriculum Assessment",
        "text":          "What competencies learned in college did you find very useful in your job? (You may select more than one answer)",
        "type":          "multi_choice",
        "options": [
            {"id":"communication",    "label":"Communication skills"},
            {"id":"human_relations",  "label":"Human relations skills"},
            {"id":"entrepreneurial",  "label":"Entrepreneurial skills"},
            {"id":"it_skills",        "label":"Information Technology skills"},
            {"id":"problem_solving",  "label":"Problem-solving skills"},
            {"id":"critical_thinking","label":"Critical thinking skills"},
        ],
        "required": False, "order": 39,
    },
    {
        "question_id":   "q_curriculum_suggest",
        "semantic_role": "job_description",
        "protected":     True,
        "enabled":       True,
        "section":       "Curriculum Assessment",
        "text":          "Please list down suggestions to further improve your course curriculum:",
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


def _migrate_questions(data: list[dict]) -> tuple[list[dict], bool]:
    """
    Handles three migration scenarios:
    1. OLD format (pre-CHED 10 questions): full replacement, preserve customs.
    2. PARTIAL CHED (e.g. 27 of 35): merge in missing questions.
    3. FULL CHED (35 questions): field-level migration only.
    """
    existing_ids     = {q["question_id"] for q in data}
    is_old_format    = bool(existing_ids & _OLD_EXCLUSIVE_IDS)
    is_ched          = bool(existing_ids & _CHED_EXCLUSIVE_IDS)
    missing_from_ched = _CHED_QUESTION_IDS - existing_ids

    # ── Case 1: Old pre-CHED format — full replacement ───────────────────────
    if is_old_format and not is_ched:
        old_all = _OLD_EXCLUSIVE_IDS | {"q_emp_status", "q_employer_name", "q_satisfaction"}
        custom  = [q for q in data if q["question_id"] not in old_all]
        migrated = [dict(q) for q in DEFAULT_QUESTIONS] + custom
        for i, q in enumerate(migrated, 1):
            q["order"] = i
        return migrated, True

    # ── Case 2: Partial CHED — add the missing questions ────────────────────
    if missing_from_ched:
        qid_to_default = {q["question_id"]: q for q in DEFAULT_QUESTIONS}
        additions = [dict(qid_to_default[qid]) for qid in missing_from_ched
                     if qid in qid_to_default]
        base    = [q for q in data if q["question_id"] in _CHED_QUESTION_IDS]
        customs = [q for q in data if q["question_id"] not in _CHED_QUESTION_IDS]
        merged  = base + additions
        order_map = {q["question_id"]: q["order"] for q in DEFAULT_QUESTIONS}
        merged.sort(key=lambda q: order_map.get(q["question_id"], 999))
        for i, q in enumerate(merged, 1):
            q["order"] = i
        for i, q in enumerate(customs, len(merged) + 1):
            q["order"] = i
        return merged + customs, True

    # ── Case 3: Already full CHED — field-level migration only ────────────────
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
            q["enabled"] = True
            changed = True
    return data, changed




def _ensure_default_questions() -> None:
    """Seed questions on first run; migrate if an older format is detected."""
    if _USE_MONGO:
        col = _col("questions")
        if col.count_documents({}) == 0:
            col.insert_many([dict(q) for q in DEFAULT_QUESTIONS])
            logger.info("MongoDB: seeded %d CHED questions.", len(DEFAULT_QUESTIONS))
            return
        existing_ids      = {d["question_id"] for d in col.find({}, {"question_id": 1})}
        is_old_format     = bool(existing_ids & _OLD_EXCLUSIVE_IDS)
        is_ched           = bool(existing_ids & _CHED_EXCLUSIVE_IDS)
        missing_from_ched = _CHED_QUESTION_IDS - existing_ids

        if is_old_format and not is_ched:
            old_all = _OLD_EXCLUSIVE_IDS | {"q_emp_status", "q_employer_name", "q_satisfaction"}
            col.delete_many({"question_id": {"$in": list(old_all)}})
            col.insert_many([dict(q) for q in DEFAULT_QUESTIONS])
            logger.info("MongoDB: migrated to CHED question set.")
            return

        if missing_from_ched:
            qid_map = {q["question_id"]: q for q in DEFAULT_QUESTIONS}
            additions = [dict(qid_map[qid]) for qid in missing_from_ched if qid in qid_map]
            if additions:
                col.insert_many(additions)
            logger.info("MongoDB: added %d missing CHED questions.", len(additions))
            return

        # Field-level migration
        for q in DEFAULT_QUESTIONS:
            col.update_one(
                {"question_id": q["question_id"]},
                {"$setOnInsert": {"semantic_role": q.get("semantic_role"),
                                  "protected":     q.get("protected", False),
                                  "enabled":       q.get("enabled", True)}},
                upsert=False,
            )
    else:
        if not QUESTIONS_FILE.exists():
            _write(QUESTIONS_FILE, [dict(q) for q in DEFAULT_QUESTIONS])
            return
        data              = _read(QUESTIONS_FILE)
        migrated, changed = _migrate_questions(data)
        if changed:
            _write(QUESTIONS_FILE, migrated)


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC API — identical signatures regardless of backend
# ═════════════════════════════════════════════════════════════════════════════

# ── Users / Auth ──────────────────────────────────────────────────────────────

def save_user(record: dict) -> None:
    if _USE_MONGO:
        _col("users").insert_one(dict(record))
    else:
        data = _read(USERS_FILE)
        data.append(record)
        _write(USERS_FILE, data)


def find_user_by_email(email: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("users").find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}))
    return next((u for u in _read(USERS_FILE) if u["email"].lower() == email.lower()), None)


def find_user_by_identifier(identifier: str) -> dict | None:
    """Find a user by email OR student ID — lets students log in with either."""
    ident = identifier.strip()
    if _USE_MONGO:
        doc = _col("users").find_one({"email": {"$regex": f"^{ident}$", "$options": "i"}})
        if doc:
            return _clean(doc)
        return _clean(_col("users").find_one({"student_id": ident}))
    user = next((u for u in _read(USERS_FILE) if u["email"].lower() == ident.lower()), None)
    if user:
        return user
    return next(
        (u for u in _read(USERS_FILE) if u.get("student_id") and u["student_id"] == ident),
        None,
    )


def find_user_by_id(user_id: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("users").find_one({"user_id": user_id}))
    return next((u for u in _read(USERS_FILE) if u["user_id"] == user_id), None)


def find_user_by_token(token: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("users").find_one({"token": token}))
    return next((u for u in _read(USERS_FILE) if u.get("token") == token), None)


def update_user(user_id: str, updates: dict) -> dict | None:
    if _USE_MONGO:
        result = _col("users").find_one_and_update(
            {"user_id": user_id},
            {"$set": updates},
            return_document=True,
        )
        return _clean(result)
    data = _read(USERS_FILE)
    for i, u in enumerate(data):
        if u["user_id"] == user_id:
            data[i] = {**u, **updates}
            _write(USERS_FILE, data)
            return data[i]
    return None


def list_users(role: str | None = None) -> list[dict]:
    if _USE_MONGO:
        query = {"role": role} if role else {}
        return _clean_list(_col("users").find(query))
    users = _read(USERS_FILE)
    if role:
        users = [u for u in users if u.get("role") == role]
    return users


def email_exists(email: str) -> bool:
    return find_user_by_email(email) is not None


def delete_user(user_id: str) -> bool:
    """Hard-delete a user and cascade-delete their response and employment records."""
    if _USE_MONGO:
        result = _col("users").delete_one({"user_id": user_id})
        if result.deleted_count == 0:
            return False
        _col("tracer_responses").delete_many({"user_id": user_id})
        _col("employment_records").delete_many({"graduate_id": user_id})
        return True
    data     = _read(USERS_FILE)
    new_data = [u for u in data if u["user_id"] != user_id]
    if len(new_data) == len(data):
        return False
    _write(USERS_FILE, new_data)
    responses    = _read(RESPONSES_FILE)
    new_responses = [r for r in responses if r.get("user_id") != user_id]
    if len(new_responses) != len(responses):
        _write(RESPONSES_FILE, new_responses)
    emp     = _read(EMPLOYMENT_FILE)
    new_emp = [r for r in emp if r.get("graduate_id") != user_id]
    if len(new_emp) != len(emp):
        _write(EMPLOYMENT_FILE, new_emp)
    return True


def has_super_admin() -> bool:
    if _USE_MONGO:
        return _col("users").count_documents({"role": "super_admin"}) > 0
    return any(u.get("role") == "super_admin" for u in _read(USERS_FILE))


def clear_all_tokens() -> int:
    if _USE_MONGO:
        result = _col("users").update_many(
            {"token": {"$ne": None}},
            {"$set": {"token": None, "token_expires_at": None}},
        )
        return result.modified_count
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
    if _USE_MONGO:
        _col("employment_records").insert_one(dict(record))
    else:
        data = _read(EMPLOYMENT_FILE)
        data.append(record)
        _write(EMPLOYMENT_FILE, data)


def read_employment_records(limit: int = 100, offset: int = 0) -> list[dict]:
    if _USE_MONGO:
        return _clean_list(_col("employment_records").find().skip(offset).limit(limit))
    return _read(EMPLOYMENT_FILE)[offset: offset + limit]


def records_for_user(user_id: str) -> list[dict]:
    if _USE_MONGO:
        return _clean_list(_col("employment_records").find({"graduate_id": user_id}))
    return [r for r in _read(EMPLOYMENT_FILE) if r.get("graduate_id") == user_id]


def find_employment_record(record_id: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("employment_records").find_one({"record_id": record_id}))
    return next((r for r in _read(EMPLOYMENT_FILE) if r["record_id"] == record_id), None)


def all_job_texts() -> list[str]:
    records = (
        _clean_list(_col("employment_records").find())
        if _USE_MONGO else _read(EMPLOYMENT_FILE)
    )
    texts = []
    for r in records:
        parts    = [r.get("job_title") or "", r.get("job_description") or "",
                    r.get("job_skills_required") or ""]
        combined = " ".join(p for p in parts if p).strip()
        if combined:
            texts.append(combined)
    return texts


# ── Questionnaire Questions ───────────────────────────────────────────────────

def read_questions() -> list[dict]:
    _ensure_default_questions()
    if _USE_MONGO:
        return sorted(_clean_list(_col("questions").find()), key=lambda q: q.get("order", 0))
    return sorted(_read(QUESTIONS_FILE), key=lambda q: q.get("order", 0))


def get_question_by_role(role: str) -> dict | None:
    return next((q for q in read_questions() if q.get("semantic_role") == role), None)


def get_answer_by_role(answers: dict, role: str) -> str | None:
    """Look up a student's answer by semantic role — stable against admin renames."""
    q = get_question_by_role(role)
    if q:
        return answers.get(q["question_id"])
    return None


def save_question(record: dict) -> None:
    if _USE_MONGO:
        _col("questions").insert_one(dict(record))
    else:
        data = _read(QUESTIONS_FILE)
        data.append(record)
        _write(QUESTIONS_FILE, data)


def toggle_question_enabled(question_id: str, enabled: bool) -> dict | None:
    if _USE_MONGO:
        result = _col("questions").find_one_and_update(
            {"question_id": question_id},
            {"$set": {"enabled": enabled}},
            return_document=True,
        )
        return _clean(result)
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
    # Never allow overwriting semantic_role or protected via update
    updates.pop("semantic_role", None)
    updates.pop("protected",     None)
    if _USE_MONGO:
        result = _col("questions").find_one_and_update(
            {"question_id": question_id},
            {"$set": updates},
            return_document=True,
        )
        return _clean(result)
    data = read_questions()
    for i, q in enumerate(data):
        if q["question_id"] == question_id:
            data[i] = {**q, **updates}
            _write(QUESTIONS_FILE, data)
            return data[i]
    return None


def delete_question(question_id: str) -> tuple[bool, str]:
    """Returns (success, reason). Protected questions cannot be deleted."""
    all_qs = read_questions()
    target = next((q for q in all_qs if q["question_id"] == question_id), None)
    if not target:
        return False, "not_found"
    if target.get("protected"):
        return False, "protected"
    if _USE_MONGO:
        _col("questions").delete_one({"question_id": question_id})
    else:
        _write(QUESTIONS_FILE, [q for q in all_qs if q["question_id"] != question_id])
    return True, "ok"


# ── Tracer Responses ──────────────────────────────────────────────────────────

def save_response(record: dict) -> None:
    """Upsert: one response per user (replaces if already submitted)."""
    if _USE_MONGO:
        _col("tracer_responses").replace_one(
            {"user_id": record["user_id"]},
            dict(record),
            upsert=True,
        )
    else:
        data = _read(RESPONSES_FILE)
        data = [r for r in data if r["user_id"] != record["user_id"]]
        data.append(record)
        _write(RESPONSES_FILE, data)


def get_response_by_user(user_id: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("tracer_responses").find_one({"user_id": user_id}))
    return next((r for r in _read(RESPONSES_FILE) if r["user_id"] == user_id), None)


def read_all_responses() -> list[dict]:
    if _USE_MONGO:
        return _clean_list(_col("tracer_responses").find())
    return _read(RESPONSES_FILE)


def get_response_by_id(response_id: str) -> dict | None:
    if _USE_MONGO:
        return _clean(_col("tracer_responses").find_one({"response_id": response_id}))
    return next((r for r in _read(RESPONSES_FILE) if r["response_id"] == response_id), None)


def delete_response(response_id: str) -> bool:
    """Delete a response and cascade-delete the corresponding employment record."""
    if _USE_MONGO:
        doc = _col("tracer_responses").find_one({"response_id": response_id}, {"user_id": 1})
        if not doc:
            return False
        _col("tracer_responses").delete_one({"response_id": response_id})
        _col("employment_records").delete_many({"graduate_id": doc.get("user_id")})
        return True
    data   = _read(RESPONSES_FILE)
    target = next((r for r in data if r["response_id"] == response_id), None)
    if not target:
        return False
    _write(RESPONSES_FILE, [r for r in data if r["response_id"] != response_id])
    user_id = target.get("user_id")
    if user_id:
        emp     = _read(EMPLOYMENT_FILE)
        new_emp = [r for r in emp if r.get("graduate_id") != user_id]
        if len(new_emp) != len(emp):
            _write(EMPLOYMENT_FILE, new_emp)
    return True


def compute_stats() -> dict:
    from skill_parser import parse_skills_from_responses

    # Use the abstracted functions so this works in both JSON and MongoDB mode
    users     = list_users(role="student")
    responses = read_all_responses()
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
            # CHED format: range option ID → approximate midpoint in months
            _range_midpoints = {
                "lt_1m": 0.5, "1_6m": 3.5,  "7_11m": 9.0,
                "1_2y":  18.0, "2_3y": 30.0, "3_4y":  42.0,
            }
            midpoint = _range_midpoints.get(months)
            if midpoint is not None:
                month_values.append(midpoint)
            else:
                try: month_values.append(float(months))  # legacy numeric fallback
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
