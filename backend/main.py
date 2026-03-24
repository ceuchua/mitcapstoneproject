"""
main.py  —  Graduate Tracer System API
─────────────────────────────────────────────────────────────────────────────
Routes
  System
    GET  /api/health

  Graduates
    POST /api/graduates                   register a graduate
    GET  /api/graduates                   list all graduates
    GET  /api/graduates/{id}              graduate + their employment records

  Employment
    POST /api/employment                  submit record → triggers LDA skills-gap
    GET  /api/employment                  list all records
    GET  /api/employment/{id}             single record

  LDA / Skills Gap
    POST /api/lda/analyze                 analyze job text against a program (no save)
    GET  /api/lda/topics                  current skill domain topics + top words
    GET  /api/lda/program-profile         expected skills for a given program
    POST /api/lda/retrain                 retrain model on all saved job texts

  Dashboard
    GET  /api/stats                       aggregated dashboard statistics
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import uuid

from schemas import (
    GraduateCreate, GraduateResponse,
    EmploymentCreate, EmploymentResponse,
    SkillsGapRequest, SkillsGapResponse, SkillTopicScore,
    HistoryItem, StatsResponse,
)
from storage import (
    save_graduate, read_graduates, find_graduate, graduate_exists,
    save_employment, read_employment_records, records_for_graduate,
    find_employment_record, compute_stats, all_job_texts,
)
from lda_model import lda_analyzer

app = FastAPI(
    title="Graduate Tracer System API",
    description=(
        "Tracks graduate employment outcomes and uses LDA to perform "
        "skills-gap analysis between job requirements and degree programs."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["System"])
def health():
    return {
        "status": "ok",
        "lda_trained": lda_analyzer.is_trained,
        "n_skill_topics": 10,
        "mode": "skills_gap",
    }


# ── Graduates ─────────────────────────────────────────────────────────────────

@app.post("/api/graduates", response_model=GraduateResponse, tags=["Graduates"])
def register_graduate(req: GraduateCreate):
    if graduate_exists(req.student_id):
        raise HTTPException(
            status_code=409,
            detail=f"Student ID '{req.student_id}' is already registered.",
        )
    record = {
        **req.model_dump(),
        "graduate_id": str(uuid.uuid4()),
        "created_at":  datetime.now(timezone.utc).isoformat(),
    }
    save_graduate(record)
    return GraduateResponse(**record)


@app.get("/api/graduates", response_model=list[GraduateResponse], tags=["Graduates"])
def list_graduates(limit: int = 50, offset: int = 0):
    return [GraduateResponse(**g) for g in read_graduates(limit=limit, offset=offset)]


@app.get("/api/graduates/{graduate_id}", tags=["Graduates"])
def get_graduate(graduate_id: str):
    g = find_graduate(graduate_id)
    if not g:
        raise HTTPException(status_code=404, detail="Graduate not found.")
    return {
        "graduate":           GraduateResponse(**g),
        "employment_records": [EmploymentResponse(**r) for r in records_for_graduate(graduate_id)],
    }


# ── Employment Records ────────────────────────────────────────────────────────

@app.post("/api/employment", response_model=EmploymentResponse, tags=["Employment"])
def submit_employment(req: EmploymentCreate):
    grad = find_graduate(req.graduate_id)
    if not grad:
        raise HTTPException(status_code=404, detail="Graduate not found.")

    # Build job text
    job_text = " ".join(filter(None, [
        req.job_title,
        req.job_description,
        req.job_skills_required,
    ])).strip()

    # Run LDA skills-gap analysis when there's job text
    gap_result = None
    if job_text and req.employment_status in ("Employed", "Self-employed"):
        gap_result = lda_analyzer.analyze(
            job_text=job_text,
            program=grad.get("program", ""),
            top_k=3,
        )

    record = {
        **req.model_dump(),
        "record_id":  str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Skills-gap fields (None when not employed / no job text)
        "detected_skill_topics":  [t["label"] for t in gap_result["skill_topics"]] if gap_result else None,
        "skills_in_job":          gap_result["skills_in_job"]       if gap_result else None,
        "skills_from_program":    gap_result["skills_from_program"] if gap_result else None,
        "gap_skills":             gap_result["gap_skills"]           if gap_result else None,
        "alignment_score":        gap_result["alignment_score"]      if gap_result else None,
        "lda_topic_distribution": gap_result["lda_topic_distribution"] if gap_result else None,
    }
    save_employment(record)
    return EmploymentResponse(**record)


@app.get("/api/employment", response_model=list[EmploymentResponse], tags=["Employment"])
def list_employment(limit: int = 50, offset: int = 0):
    return [EmploymentResponse(**r) for r in read_employment_records(limit=limit, offset=offset)]


@app.get("/api/employment/{record_id}", response_model=EmploymentResponse, tags=["Employment"])
def get_employment_record(record_id: str):
    r = find_employment_record(record_id)
    if not r:
        raise HTTPException(status_code=404, detail="Employment record not found.")
    return EmploymentResponse(**r)


# ── LDA / Skills Gap ──────────────────────────────────────────────────────────

@app.post("/api/lda/analyze", response_model=SkillsGapResponse, tags=["LDA / Skills Gap"])
def lda_analyze(req: SkillsGapRequest):
    """
    Run skills-gap analysis on free text without saving a record.
    Useful for previewing results or testing the model.
    """
    job_text = " ".join(filter(None, [
        req.job_title,
        req.job_description,
        req.job_skills_required,
    ])).strip()

    result = lda_analyzer.analyze(job_text=job_text, program=req.program, top_k=req.top_k)

    return SkillsGapResponse(
        job_text=job_text,
        program=req.program,
        skill_topics=[
            SkillTopicScore(
                topic_id=t["topic_id"],
                label=t["label"],
                score=t["score"],
                top_words=t["top_words"],
            )
            for t in result["skill_topics"]
        ],
        skills_in_job=result["skills_in_job"],
        skills_from_program=result["skills_from_program"],
        gap_skills=result["gap_skills"],
        surplus_skills=result["surplus_skills"],
        alignment_score=result["alignment_score"],
    )


@app.get("/api/lda/topics", tags=["LDA / Skills Gap"])
def lda_topics():
    """Return all current skill domain topics with their top keywords."""
    return {"topics": lda_analyzer.topic_summary()}


@app.get("/api/lda/program-profile", tags=["LDA / Skills Gap"])
def program_profile(program: str = Query(..., description="Degree program name")):
    """Return the expected skill profile for a given degree program."""
    return lda_analyzer.get_program_profile(program)


@app.post("/api/lda/retrain", tags=["LDA / Skills Gap"])
def lda_retrain():
    """
    Retrain the LDA model on all saved employment record texts.
    Recommended once ≥30 records are collected.
    After retraining, review the returned top_words and update
    SKILL_TOPIC_LABELS in lda_model.py accordingly.
    """
    texts = all_job_texts()
    return lda_analyzer.retrain(texts)


# ── Dashboard Stats ───────────────────────────────────────────────────────────

@app.get("/api/stats", response_model=StatsResponse, tags=["Dashboard"])
def get_stats():
    s = compute_stats()
    # Convert year keys back to int
    s["records_by_graduation_year"] = {
        int(k): v for k, v in s["records_by_graduation_year"].items()
    }
    return StatsResponse(**s)
