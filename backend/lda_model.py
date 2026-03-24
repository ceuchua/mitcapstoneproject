"""
lda_model.py
─────────────────────────────────────────────────────────────────────────────
Graduate Tracer System — LDA Skills-Gap Analyzer
─────────────────────────────────────────────────────────────────────────────

PURPOSE
  Given a graduate's job text (title + description + required skills) and
  their degree program, this module:

    1. Runs LDA to discover SKILL CLUSTERS present in the job text.
    2. Extracts individual skill keywords from those clusters.
    3. Compares against a PROGRAM SKILL PROFILE (what the degree teaches).
    4. Returns:
         • gap_skills    — demanded by the job but NOT covered by the program
         • surplus_skills— covered by the program but NOT demanded by the job
         • alignment_score (0–1) — Jaccard overlap between job skills & program

ARCHITECTURE
  • sklearn TfidfVectorizer + LatentDirichletAllocation
  • Topics represent SKILL DOMAINS (e.g. "Data & Analytics", "Soft Skills")
  • PROGRAM_SKILL_PROFILES maps degree names → expected skill keywords
  • Bootstrapped from a seed corpus; call retrain() when real data grows

EXTENDING
  1. Accumulate job_title + job_description + job_skills_required texts.
  2. Call POST /api/lda/retrain to hot-swap the model.
  3. Inspect returned top-words; update SKILL_TOPIC_LABELS.
  4. Expand PROGRAM_SKILL_PROFILES with your institution's actual curricula.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import re
import logging
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import LatentDirichletAllocation

logger = logging.getLogger(__name__)

# ── Hyperparameters ───────────────────────────────────────────────────────────

N_TOPICS      = 10    # skill domain clusters
MAX_ITER      = 25
RANDOM_STATE  = 42
TOP_WORDS_N   = 10    # keywords shown per topic
MIN_DF        = 1
MAX_DF        = 0.95
MAX_FEATURES  = 600

# ── Skill Domain Labels ───────────────────────────────────────────────────────
# Update after retraining on real data.

SKILL_TOPIC_LABELS: dict[int, str] = {
    0:  "Programming & Software Development",
    1:  "Data Analysis & Statistics",
    2:  "Communication & Interpersonal Skills",
    3:  "Leadership & Management",
    4:  "Engineering & Technical Operations",
    5:  "Healthcare & Clinical Skills",
    6:  "Business, Finance & Accounting",
    7:  "Research & Academic Skills",
    8:  "Digital Tools & Office Productivity",
    9:  "Teaching & Facilitation",
}

# ── Program Skill Profiles ────────────────────────────────────────────────────
# Maps canonical program name fragments → set of expected skill keywords.
# Matching is case-insensitive substring; e.g. "computer science" matches
# "BS Computer Science", "Bachelor of Science in Computer Science", etc.
#
# Expand this dict with your institution's actual curriculum outcomes.

PROGRAM_SKILL_PROFILES: dict[str, list[str]] = {
    "computer science": [
        "programming", "python", "java", "algorithms", "data structures",
        "software development", "web development", "database", "sql",
        "operating systems", "networking", "oop", "version control", "git",
        "problem solving", "logic", "machine learning", "data analysis",
    ],
    "information technology": [
        "networking", "system administration", "cybersecurity", "it support",
        "hardware", "troubleshooting", "sql", "database", "web development",
        "programming", "cloud", "virtualization", "project management",
    ],
    "information systems": [
        "systems analysis", "database design", "business analysis",
        "project management", "sql", "erp", "it governance", "networking",
        "programming", "data management", "documentation",
    ],
    "nursing": [
        "patient care", "clinical assessment", "medication administration",
        "vital signs", "wound care", "health education", "documentation",
        "infection control", "emergency response", "compassion", "communication",
    ],
    "education": [
        "lesson planning", "curriculum development", "classroom management",
        "student assessment", "teaching strategies", "communication",
        "mentoring", "facilitation", "differentiated instruction",
    ],
    "accountancy": [
        "financial reporting", "auditing", "taxation", "bookkeeping",
        "accounting standards", "financial analysis", "budgeting",
        "excel", "erp", "compliance", "analytical thinking",
    ],
    "business administration": [
        "management", "marketing", "human resources", "operations",
        "business strategy", "financial analysis", "communication",
        "leadership", "project management", "customer relations",
    ],
    "civil engineering": [
        "structural analysis", "construction management", "autocad",
        "materials testing", "surveying", "project planning",
        "drafting", "cost estimation", "environmental compliance",
    ],
    "electrical engineering": [
        "circuit design", "power systems", "plc programming",
        "automation", "electronics", "matlab", "electrical codes",
        "troubleshooting", "instrumentation",
    ],
    "mechanical engineering": [
        "machine design", "manufacturing processes", "thermodynamics",
        "autocad", "solidworks", "quality control", "maintenance",
        "materials science", "project management",
    ],
    "psychology": [
        "counseling", "psychological assessment", "research methods",
        "statistics", "communication", "empathy", "case management",
        "behavioral analysis", "report writing",
    ],
    "social work": [
        "case management", "community organizing", "counseling",
        "social services", "advocacy", "report writing",
        "needs assessment", "crisis intervention", "empathy",
    ],
    "communication": [
        "writing", "editing", "public speaking", "media production",
        "social media", "journalism", "photography", "broadcasting",
        "public relations", "content creation",
    ],
    "pharmacy": [
        "drug dispensing", "pharmacology", "patient counseling",
        "medication safety", "clinical pharmacy", "inventory management",
        "drug interaction", "compounding", "healthcare regulations",
    ],
    # fallback for unrecognized programs
    "_default": [
        "communication", "critical thinking", "problem solving",
        "teamwork", "time management", "computer literacy",
    ],
}

# ── Seed Corpus ───────────────────────────────────────────────────────────────
# Each entry represents a job posting or skills description for a skill domain.

SEED_CORPUS: list[tuple[int, str]] = [
    # 0 — Programming & Software Development
    (0, "python java javascript react nodejs programming coding software development git version control api rest backend frontend"),
    (0, "mobile development flutter android ios swift kotlin firebase app development deployment"),
    (0, "devops docker kubernetes ci cd pipeline deployment cloud aws azure gcp infrastructure automation"),
    (0, "database sql postgresql mongodb orm query optimization schema design normalization"),
    (0, "cybersecurity penetration testing vulnerability assessment network security linux firewall encryption"),

    # 1 — Data Analysis & Statistics
    (1, "data analysis statistics excel tableau power bi data visualization reporting dashboard kpi"),
    (1, "machine learning deep learning tensorflow pytorch sklearn predictive modeling classification regression"),
    (1, "research quantitative qualitative survey spss r stata hypothesis testing data collection analysis"),
    (1, "business intelligence data warehouse etl pipeline sql analytics insights decision making"),

    # 2 — Communication & Interpersonal Skills
    (2, "communication interpersonal skills teamwork collaboration presentation public speaking client relations"),
    (2, "writing report documentation technical writing copywriting editing proofreading content"),
    (2, "customer service client management relationship building negotiation conflict resolution"),

    # 3 — Leadership & Management
    (3, "leadership management team lead supervisor project management planning coordination"),
    (3, "strategic planning operations management decision making resource allocation budget management"),
    (3, "human resources recruitment training performance evaluation compensation hr management"),

    # 4 — Engineering & Technical Operations
    (4, "civil engineering structural construction autocad site supervision cost estimation surveying"),
    (4, "electrical engineering circuit design power systems plc automation instrumentation maintenance"),
    (4, "mechanical engineering manufacturing machining maintenance equipment repair quality control"),
    (4, "quality assurance testing iso standards inspection process improvement root cause analysis"),

    # 5 — Healthcare & Clinical Skills
    (5, "patient care nursing clinical assessment vital signs medication administration hospital ward"),
    (5, "diagnosis treatment physician doctor medical specialist imaging laboratory interpretation"),
    (5, "rehabilitation physical therapy occupational therapy exercise program patient education"),
    (5, "pharmacy dispensing drug interaction medication counseling prescription compounding"),

    # 6 — Business, Finance & Accounting
    (6, "accounting bookkeeping financial statements tax auditing cpa compliance reporting"),
    (6, "finance investment banking portfolio risk management financial modeling valuation"),
    (6, "supply chain logistics procurement inventory operations management erp sap"),
    (6, "marketing social media advertising campaign seo content strategy brand management"),

    # 7 — Research & Academic Skills
    (7, "research methodology literature review data collection analysis publication thesis dissertation"),
    (7, "grant writing academic writing journal publishing conference presentation peer review"),
    (7, "laboratory experiment analysis testing scientific method protocol documentation"),

    # 8 — Digital Tools & Office Productivity
    (8, "microsoft office word excel powerpoint google workspace tools productivity documentation"),
    (8, "crm erp sap oracle system tools software applications digital literacy"),
    (8, "social media management scheduling content calendar analytics engagement community"),

    # 9 — Teaching & Facilitation
    (9, "teaching lesson plan curriculum classroom management student assessment evaluation"),
    (9, "training facilitation workshop adult learning instructional design onboarding"),
    (9, "tutoring mentoring coaching academic support review center learning development"),
]

# ── Text cleaner ──────────────────────────────────────────────────────────────

_STOPWORDS = {
    "the","and","is","in","it","of","to","a","an","for","on","with",
    "as","at","by","from","or","be","are","was","were","this","that",
    "i","my","we","our","you","your","he","she","they","their","its",
    "have","has","had","will","do","does","did","not","but","if","so",
    "can","may","must","shall","should","would","could","also","other",
    "such","than","more","very","well","good","able","need","use","used",
}

def _clean(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in text.split() if t not in _STOPWORDS and len(t) > 2]
    return " ".join(tokens)


def _match_program_profile(program: str) -> list[str]:
    """Return the skill profile for a given program name (substring match)."""
    pl = program.lower()
    for key, skills in PROGRAM_SKILL_PROFILES.items():
        if key != "_default" and key in pl:
            return skills
    return PROGRAM_SKILL_PROFILES["_default"]


# ── LDA Skills-Gap Classifier ─────────────────────────────────────────────────

class LDASkillsGapAnalyzer:
    """
    Discovers skill clusters in job text via LDA, then computes
    a skills gap against the graduate's degree program profile.
    """

    def __init__(self) -> None:
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.lda: Optional[LatentDirichletAllocation] = None
        self.is_trained: bool = False
        self._fit_seed()

    # ── Training ──────────────────────────────────────────────────────────────

    def _fit_seed(self) -> None:
        texts = [_clean(text) for _, text in SEED_CORPUS]
        self._fit(texts)
        logger.info(
            "LDA skills-gap model bootstrapped from seed corpus (%d docs, %d topics).",
            len(texts), N_TOPICS,
        )

    def _fit(self, cleaned_texts: list[str]) -> None:
        self.vectorizer = TfidfVectorizer(
            max_features=MAX_FEATURES,
            min_df=MIN_DF,
            max_df=MAX_DF,
            ngram_range=(1, 2),
        )
        X = self.vectorizer.fit_transform(cleaned_texts)

        self.lda = LatentDirichletAllocation(
            n_components=N_TOPICS,
            max_iter=MAX_ITER,
            learning_method="batch",
            random_state=RANDOM_STATE,
            doc_topic_prior=0.1,
            topic_word_prior=0.01,
        )
        self.lda.fit(X)
        self.is_trained = True

    def retrain(self, raw_texts: list[str]) -> dict:
        """Re-fit on real employment record texts (≥30 recommended)."""
        if len(raw_texts) < 10:
            return {"status": "skipped", "reason": "Need at least 10 texts to retrain."}
        cleaned = [_clean(t) for t in raw_texts]
        self._fit(cleaned)
        logger.info("LDA retrained on %d real texts.", len(raw_texts))
        return {
            "status": "ok",
            "n_texts": len(raw_texts),
            "topics": {i: self._top_words_for_topic(i) for i in range(N_TOPICS)},
            "message": "Review top words above and update SKILL_TOPIC_LABELS in lda_model.py",
        }

    # ── Core inference ────────────────────────────────────────────────────────

    def analyze(self, job_text: str, program: str, top_k: int = 3) -> dict:
        """
        Full skills-gap analysis for one employment record.

        Returns
        -------
        {
          skill_topics        : list of {topic_id, label, score, top_words}
          skills_in_job       : list[str]   — extracted skill keywords
          skills_from_program : list[str]   — program curriculum keywords
          gap_skills          : list[str]   — in job, NOT in program
          surplus_skills      : list[str]   — in program, NOT in job
          alignment_score     : float 0–1
          lda_topic_distribution: {label: score}
        }
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained.")

        cleaned = _clean(job_text)
        if not cleaned:
            return self._empty_result(program)

        # 1. Get LDA topic distribution
        X = self.vectorizer.transform([cleaned])
        topic_dist = self.lda.transform(X)[0]

        # 2. Top-k skill topics
        ranked_idx = np.argsort(topic_dist)[::-1][:top_k]
        total = topic_dist[ranked_idx].sum() or 1.0

        skill_topics = []
        for idx in ranked_idx:
            skill_topics.append({
                "topic_id":  int(idx),
                "label":     SKILL_TOPIC_LABELS.get(int(idx), f"Skill Domain {idx}"),
                "score":     float(topic_dist[idx] / total),
                "top_words": self._top_words_for_topic(int(idx)),
            })

        # 3. Extract skill keywords from job text
        skills_in_job = self._extract_skill_keywords(cleaned)

        # 4. Program curriculum profile
        skills_from_program = _match_program_profile(program)

        # 5. Gap analysis
        job_set     = set(k.lower() for k in skills_in_job)
        program_set = set(k.lower() for k in skills_from_program)

        gap_skills     = sorted(job_set - program_set)
        surplus_skills = sorted(program_set - job_set)

        # Jaccard-like alignment
        union = job_set | program_set
        alignment_score = len(job_set & program_set) / len(union) if union else 0.0

        # Full topic distribution dict
        topic_dist_labeled = {
            SKILL_TOPIC_LABELS.get(i, f"Topic {i}"): round(float(topic_dist[i]), 4)
            for i in range(N_TOPICS)
        }

        return {
            "skill_topics":           skill_topics,
            "skills_in_job":          skills_in_job,
            "skills_from_program":    skills_from_program,
            "gap_skills":             gap_skills,
            "surplus_skills":         surplus_skills,
            "alignment_score":        round(alignment_score, 4),
            "lda_topic_distribution": topic_dist_labeled,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _top_words_for_topic(self, topic_id: int, n: int = TOP_WORDS_N) -> list[str]:
        feature_names = self.vectorizer.get_feature_names_out()
        topic_vec = self.lda.components_[topic_id]
        top_idx = np.argsort(topic_vec)[::-1][:n]
        return [feature_names[i] for i in top_idx]

    def _extract_skill_keywords(self, cleaned_text: str) -> list[str]:
        """
        Extract skill-like terms by intersecting job text tokens with the
        model vocabulary, biased toward high-TF-IDF terms.
        Returns deduplicated list of up to 20 skill keywords.
        """
        vocab = set(self.vectorizer.get_feature_names_out())
        tokens = cleaned_text.split()

        # single-word matches
        matched = [t for t in tokens if t in vocab]

        # bigram matches
        bigrams = [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens)-1)]
        matched += [b for b in bigrams if b in vocab]

        # Deduplicate preserving order, cap at 20
        seen, result = set(), []
        for t in matched:
            if t not in seen:
                seen.add(t)
                result.append(t)
            if len(result) >= 20:
                break
        return result

    def _empty_result(self, program: str) -> dict:
        return {
            "skill_topics":           [],
            "skills_in_job":          [],
            "skills_from_program":    _match_program_profile(program),
            "gap_skills":             [],
            "surplus_skills":         _match_program_profile(program),
            "alignment_score":        0.0,
            "lda_topic_distribution": {},
        }

    def topic_summary(self) -> list[dict]:
        return [
            {
                "topic_id":  i,
                "label":     SKILL_TOPIC_LABELS.get(i, f"Skill Domain {i}"),
                "top_words": self._top_words_for_topic(i),
            }
            for i in range(N_TOPICS)
        ]

    def get_program_profile(self, program: str) -> dict:
        skills = _match_program_profile(program)
        return {"program": program, "expected_skills": skills}


# ── Singleton ─────────────────────────────────────────────────────────────────

lda_analyzer = LDASkillsGapAnalyzer()
