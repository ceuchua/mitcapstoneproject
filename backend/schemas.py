"""
schemas.py  —  Graduate Tracer System v3
Pydantic v2 request / response models.
"""

from pydantic import BaseModel, Field
from typing import Optional


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    first_name:      str
    last_name:       str
    email:           str
    password:        str
    role:            str        # "student" | "admin"
    # Student-only fields
    student_id:      Optional[str] = None
    program:         Optional[str] = None
    graduation_year: Optional[int] = None
    sex:             Optional[str] = None
    contact_number:  Optional[str] = None


class LoginRequest(BaseModel):
    email:    str
    password: str


class AuthResponse(BaseModel):
    user_id:    str
    first_name: str
    last_name:  str
    email:      str
    role:       str
    token:      str             # simple UUID token (no JWT for MVP)


# ── User Profile ──────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    first_name:      Optional[str] = None
    last_name:       Optional[str] = None
    contact_number:  Optional[str] = None
    # Student-only
    program:         Optional[str] = None
    graduation_year: Optional[int] = None
    sex:             Optional[str] = None
    # Student portfolio fields
    bio:             Optional[str] = None
    current_job:     Optional[str] = None
    current_employer:Optional[str] = None
    linkedin_url:    Optional[str] = None
    skills_self_reported: Optional[list[str]] = None


class UserProfile(BaseModel):
    user_id:         str
    first_name:      str
    last_name:       str
    email:           str
    role:            str
    contact_number:  Optional[str] = None
    program:         Optional[str] = None
    graduation_year: Optional[int] = None
    sex:             Optional[str] = None
    bio:             Optional[str] = None
    current_job:     Optional[str] = None
    current_employer:Optional[str] = None
    linkedin_url:    Optional[str] = None
    skills_self_reported: Optional[list[str]] = None
    student_id:      Optional[str] = None
    created_at:      str


# ── Questionnaire ─────────────────────────────────────────────────────────────

class QuestionOption(BaseModel):
    id:    str
    label: str

class Question(BaseModel):
    question_id:  str
    section:      str           # e.g. "Employment", "Further Studies", "Skills"
    text:         str
    type:         str           # "text" | "single_choice" | "multi_choice" | "scale" | "number"
    options:      Optional[list[QuestionOption]] = None
    required:     bool = True
    order:        int = 0

class QuestionCreate(BaseModel):
    section:  str
    text:     str
    type:     str
    options:  Optional[list[QuestionOption]] = None
    required: bool = True
    order:    int = 0

class QuestionUpdate(BaseModel):
    section:  Optional[str] = None
    text:     Optional[str] = None
    type:     Optional[str] = None
    options:  Optional[list[QuestionOption]] = None
    required: Optional[bool] = None
    order:    Optional[int] = None


# ── Tracer Study Response ─────────────────────────────────────────────────────

class TracerResponse(BaseModel):
    user_id:   str
    answers:   dict             # { question_id: answer_value }

class TracerResponseRecord(BaseModel):
    response_id: str
    user_id:     str
    answers:     dict
    created_at:  str


# ── Employment (kept for LDA triggering) ─────────────────────────────────────

class EmploymentCreate(BaseModel):
    graduate_id:          str
    employment_status:    str
    employer_name:        Optional[str]  = None
    employer_address:     Optional[str]  = None
    employer_sector:      Optional[str]  = None
    job_title:            Optional[str]  = None
    job_description:      Optional[str]  = None
    job_skills_required:  Optional[str]  = None
    is_related_to_course: Optional[bool] = None
    year_started:         Optional[int]  = None
    months_to_employment: Optional[int]  = None
    further_studies_school:  Optional[str] = None
    further_studies_program: Optional[str] = None

class EmploymentResponse(EmploymentCreate):
    record_id:              str
    created_at:             str
    detected_skill_topics:  Optional[list[str]]        = None
    skills_in_job:          Optional[list[str]]         = None
    skills_from_program:    Optional[list[str]]         = None
    gap_skills:             Optional[list[str]]         = None
    alignment_score:        Optional[float]             = None
    lda_topic_distribution: Optional[dict[str, float]]  = None


# ── LDA ───────────────────────────────────────────────────────────────────────

class SkillTopicScore(BaseModel):
    topic_id:  int
    label:     str
    score:     float
    top_words: list[str]

class SkillsGapRequest(BaseModel):
    job_title:           str
    job_description:     Optional[str] = None
    job_skills_required: Optional[str] = None
    program:             str
    top_k:               int = Field(3, ge=1, le=10)

class SkillsGapResponse(BaseModel):
    job_text:            str
    program:             str
    skill_topics:        list[SkillTopicScore]
    skills_in_job:       list[str]
    skills_from_program: list[str]
    gap_skills:          list[str]
    surplus_skills:      list[str]
    alignment_score:     float

class StudentSkillRecommendation(BaseModel):
    program:             str
    recommended_skills:  list[str]
    skill_topics:        list[SkillTopicScore]
    program_profile:     list[str]


# ── Stats ─────────────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    total_graduates:             int
    total_responses:             int
    employment_status_counts:    dict[str, int]
    sector_counts:               dict[str, int]
    related_to_course_rate:      Optional[float]
    records_by_program:          dict[str, int]
    records_by_graduation_year:  dict[int, int]
    top_gap_skills:              list[dict]
    avg_alignment_by_program:    dict[str, float]
