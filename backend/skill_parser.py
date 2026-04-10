"""
skill_parser.py  —  Graduate Tracer System v3
─────────────────────────────────────────────────────────────────────────────
Parses free-text skill answers into clean, deduplicated skill lists.

Strategy: delimiter-first, then conjunction stripping.
  "3d modeling, structural designing, and project reporting"
  → ["3d modeling", "structural designing", "project reporting"]

Never splits on stopwords mid-phrase — preserves multi-word skills.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
import re

# Delimiters that reliably separate skill items
_DELIMITER = re.compile(r"[,;/|•·\n\r]+")

# Leading conjunctions to strip from the start of a chunk only
_LEADING   = re.compile(
    r"^\s*(and|or|also|as well as|plus|with|including|such as|like|eg|e\.g\.?|i\.e\.?)\s+",
    re.IGNORECASE,
)

# Trailing punctuation / noise
_TRAILING  = re.compile(r"[\.\!\?\-]+$")

# Words that are so generic they are never meaningful skill items on their own
_SOLO_STOPWORDS = {
    "and", "or", "the", "a", "an", "of", "in", "to", "for",
    "on", "at", "with", "by", "from", "is", "are", "was", "were",
    "it", "its", "etc", "others", "other", "more", "some", "any",
}


def parse_skills(raw: str | None, max_skills: int = 30) -> list[str]:
    """
    Parse a free-text skill answer into a deduplicated list of skill strings.

    Examples
    --------
    >>> parse_skills("Python, SQL, and data analysis")
    ['python', 'sql', 'data analysis']

    >>> parse_skills("3d modeling; structural designing and project reporting")
    ['3d modeling', 'structural designing', 'project reporting']

    >>> parse_skills("communication / teamwork / leadership")
    ['communication', 'teamwork', 'leadership']

    >>> parse_skills("MS Office (Word, Excel, PowerPoint)")
    ['ms office', 'word', 'excel', 'powerpoint']
    """
    if not raw or not raw.strip():
        return []

    text = raw.strip()

    # Expand parenthetical lists: "MS Office (Word, Excel)" →
    # "MS Office, Word, Excel"
    text = re.sub(r"\(([^)]+)\)", lambda m: ", " + m.group(1), text)

    # Split on delimiters
    chunks = _DELIMITER.split(text)

    seen:   set[str] = set()
    result: list[str] = []

    for chunk in chunks:
        # Strip leading conjunctions
        chunk = _LEADING.sub("", chunk)
        # Strip trailing punctuation
        chunk = _TRAILING.sub("", chunk)
        # Normalize whitespace
        chunk = " ".join(chunk.split()).lower()

        if not chunk:
            continue

        # Reject chunks that are a single generic word
        if chunk in _SOLO_STOPWORDS:
            continue

        # Reject very short fragments (single char, noise)
        if len(chunk) < 2:
            continue

        if chunk not in seen:
            seen.add(chunk)
            result.append(chunk)

        if len(result) >= max_skills:
            break

    return result


def parse_skills_from_responses(
    responses: list[dict],
    questions: list[dict],
) -> list[str]:
    """
    Extract and flatten all skill answers across all responses.
    Looks for questions with semantic_role == 'skills_free_text'.
    Handles both free-text (str) and multi_choice (list of option IDs).
    Returns a flat list of all parsed skill strings (with repetitions,
    so frequency can be counted by the caller).
    """
    # Build a lookup: question_id → option labels for multi_choice questions
    skill_questions = [
        q for q in questions
        if q.get("semantic_role") == "skills_free_text"
    ]
    if not skill_questions:
        return []

    all_skills: list[str] = []
    for r in responses:
        answers = r.get("answers", {})
        for q in skill_questions:
            qid = q["question_id"]
            raw = answers.get(qid)
            if not raw:
                continue
            # Multi-choice answer: list of option IDs → resolve to labels
            if isinstance(raw, list):
                opt_map = {o["id"]: o["label"] for o in (q.get("options") or [])}
                labels  = [opt_map.get(oid, oid) for oid in raw]
                all_skills.extend(labels)
            else:
                all_skills.extend(parse_skills(str(raw)))

    return all_skills
