"""
schemas.py  —  Graduate Tracer System
Pydantic v2 request / response models.
"""

from pydantic import BaseModel, Field
from typing import Optional


# ── Graduate ──────────────────────────────────────────────────────────────────

class GraduateCreate(BaseModel):
    first_name:       str
    last_name:        str
    student_id:       str
    program:          str   # e.g. "BS Computer Science"
    graduation_year:  int
    email:            Optional[str] = None
    sex:              Optional[str] = None   # "Male" | "Female" | "Other"
    contact_number:   Optional[str] = None


class GraduateResponse(GraduateCreate):
    graduate_id: str
    created_at:  str


# ── Employment Record ─────────────────────────────────────────────────────────

class EmploymentCreate(BaseModel):
    graduate_id:          str
    employment_status:    str   # "Employed" | "Unemployed" | "Self-employed" | "Further Studies"

    # Employer info
    employer_name:        Optional[str]  = None
    employer_address:     Optional[str]  = None
    employer_sector:      Optional[str]  = None   # "Private" | "Government" | "NGO" | "Self"

    # Job info — these feed the LDA skills-gap engine
    job_title:            Optional[str]  = None
    job_description:      Optional[str]  = None   # free text of duties / responsibilities
    job_skills_required:  Optional[str]  = None   # skills the employer listed / graduate observed

    # Alignment
    is_related_to_course: Optional[bool] = None
    year_started:         Optional[int]  = None
    months_to_employment: Optional[int]  = None   # how long after graduation to land the job

    # Further studies (when status == "Further Studies")
    further_studies_school:  Optional[str] = None
    further_studies_program: Optional[str] = None


class EmploymentResponse(EmploymentCreate):
    record_id: str
    created_at: str

    # LDA skills-gap output
    detected_skill_topics:  Optional[list[str]]        = None  # top skill-cluster labels
    skills_in_job:          Optional[list[str]]         = None  # skills LDA found in job text
    skills_from_program:    Optional[list[str]]         = None  # expected skills for the program
    gap_skills:             Optional[list[str]]         = None  # in job but NOT in program profile
    alignment_score:        Optional[float]             = None  # 0.0–1.0
    lda_topic_distribution: Optional[dict[str, float]]  = None  # topic → probability


# ── Skills-Gap Classify (standalone endpoint) ─────────────────────────────────

class SkillsGapRequest(BaseModel):
    job_title:           str
    job_description:     Optional[str] = None
    job_skills_required: Optional[str] = None
    program:             str = Field(..., description="Graduate's degree program")
    top_k:               int = Field(3, ge=1, le=10)


class SkillTopicScore(BaseModel):
    topic_id:  int
    label:     str
    score:     float
    top_words: list[str]


class SkillsGapResponse(BaseModel):
    job_text:            str
    program:             str
    skill_topics:        list[SkillTopicScore]  # LDA topics detected in job text
    skills_in_job:       list[str]              # skill keywords extracted
    skills_from_program: list[str]              # expected skills for this program
    gap_skills:          list[str]              # demanded by job, missing from program
    surplus_skills:      list[str]              # in program profile, not demanded by job
    alignment_score:     float                  # 0.0–1.0


# ── History / Stats ───────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    record_id:             str
    graduate_id:           str
    job_title:             Optional[str]
    employment_status:     str
    detected_skill_topics: Optional[list[str]]
    alignment_score:       Optional[float]
    created_at:            str


class StatsResponse(BaseModel):
    total_graduates:             int
    total_employment_records:    int
    employment_status_counts:    dict[str, int]
    sector_counts:               dict[str, int]
    related_to_course_rate:      Optional[float]
    records_by_program:          dict[str, int]
    records_by_graduation_year:  dict[int, int]
    top_gap_skills:              list[dict]           # [{"skill": str, "count": int}]
    avg_alignment_by_program:    dict[str, float]
