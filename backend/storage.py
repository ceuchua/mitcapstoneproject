"""
storage.py  —  Graduate Tracer System
JSON-file persistence layer. Swap for SQLAlchemy/PostgreSQL when scaling.
"""

import json
import os
from pathlib import Path
from collections import Counter

DATA_DIR          = Path(os.getenv("TRACER_DATA_DIR", "./data"))
GRADUATES_FILE    = DATA_DIR / "graduates.json"
EMPLOYMENT_FILE   = DATA_DIR / "employment_records.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)


# ── Low-level I/O ─────────────────────────────────────────────────────────────

def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write(path: Path, data: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Graduate CRUD ─────────────────────────────────────────────────────────────

def save_graduate(record: dict) -> None:
    data = _read(GRADUATES_FILE)
    data.append(record)
    _write(GRADUATES_FILE, data)

def read_graduates(limit: int = 100, offset: int = 0) -> list[dict]:
    return _read(GRADUATES_FILE)[offset: offset + limit]

def find_graduate(graduate_id: str) -> dict | None:
    return next((g for g in _read(GRADUATES_FILE) if g["graduate_id"] == graduate_id), None)

def graduate_exists(student_id: str) -> bool:
    return any(g["student_id"] == student_id for g in _read(GRADUATES_FILE))

def count_graduates() -> int:
    return len(_read(GRADUATES_FILE))


# ── Employment CRUD ───────────────────────────────────────────────────────────

def save_employment(record: dict) -> None:
    data = _read(EMPLOYMENT_FILE)
    data.append(record)
    _write(EMPLOYMENT_FILE, data)

def read_employment_records(limit: int = 100, offset: int = 0) -> list[dict]:
    return _read(EMPLOYMENT_FILE)[offset: offset + limit]

def records_for_graduate(graduate_id: str) -> list[dict]:
    return [r for r in _read(EMPLOYMENT_FILE) if r["graduate_id"] == graduate_id]

def find_employment_record(record_id: str) -> dict | None:
    return next((r for r in _read(EMPLOYMENT_FILE) if r["record_id"] == record_id), None)


# ── Stats ─────────────────────────────────────────────────────────────────────

def compute_stats() -> dict:
    graduates  = _read(GRADUATES_FILE)
    emp_recs   = _read(EMPLOYMENT_FILE)

    # Employment status counts
    status_counts = Counter(r.get("employment_status", "Unknown") for r in emp_recs)

    # Employer sector counts
    sector_counts = Counter(
        r["employer_sector"] for r in emp_recs if r.get("employer_sector")
    )

    # Related-to-course rate
    related_pool = [r for r in emp_recs if r.get("is_related_to_course") is not None]
    related_rate = (
        sum(1 for r in related_pool if r["is_related_to_course"]) / len(related_pool)
        if related_pool else None
    )

    # Records by program (from graduate table)
    grad_map = {g["graduate_id"]: g for g in graduates}
    prog_counter: Counter = Counter()
    year_counter: Counter = Counter()
    for r in emp_recs:
        g = grad_map.get(r["graduate_id"])
        if g:
            prog_counter[g.get("program", "Unknown")] += 1
            year_counter[g.get("graduation_year", 0)] += 1

    # Top gap skills across all records
    all_gap_skills: list[str] = []
    for r in emp_recs:
        all_gap_skills.extend(r.get("gap_skills") or [])
    gap_skill_counts = Counter(all_gap_skills).most_common(15)
    top_gap_skills = [{"skill": s, "count": c} for s, c in gap_skill_counts]

    # Average alignment score by program
    prog_scores: dict[str, list[float]] = {}
    for r in emp_recs:
        score = r.get("alignment_score")
        g = grad_map.get(r["graduate_id"])
        if score is not None and g:
            prog = g.get("program", "Unknown")
            prog_scores.setdefault(prog, []).append(score)
    avg_alignment_by_program = {
        p: round(sum(v) / len(v), 4) for p, v in prog_scores.items()
    }

    return {
        "total_graduates":            len(graduates),
        "total_employment_records":   len(emp_recs),
        "employment_status_counts":   dict(status_counts),
        "sector_counts":              dict(sector_counts),
        "related_to_course_rate":     related_rate,
        "records_by_program":         dict(prog_counter),
        "records_by_graduation_year": {str(k): v for k, v in year_counter.items()},
        "top_gap_skills":             top_gap_skills,
        "avg_alignment_by_program":   avg_alignment_by_program,
    }


# ── Bulk text extractor (for LDA retraining) ──────────────────────────────────

def all_job_texts() -> list[str]:
    """Combine job_title + job_description + job_skills_required for every record."""
    texts = []
    for r in _read(EMPLOYMENT_FILE):
        parts = [
            r.get("job_title") or "",
            r.get("job_description") or "",
            r.get("job_skills_required") or "",
        ]
        combined = " ".join(p for p in parts if p).strip()
        if combined:
            texts.append(combined)
    return texts
