"""
lda_model.py  —  Graduate Tracer System v3
─────────────────────────────────────────────────────────────────────────────
Single LDA model, two use cases:

  analyze_for_student(program)
      → Recommends skills the student should develop based on their degree
        by finding skill clusters common in jobs for similar programs.

  analyze_for_admin(job_texts)
      → Identifies top skill trends across all graduate employment data,
        giving admins insight into what industries are demanding.

Both use the same underlying LatentDirichletAllocation + TF-IDF pipeline.
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

N_TOPICS      = 10
MAX_ITER      = 25
RANDOM_STATE  = 42
TOP_WORDS_N   = 10
MIN_DF        = 1
MAX_DF        = 0.95
MAX_FEATURES  = 600

# ── Skill Domain Labels ───────────────────────────────────────────────────────

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

PROGRAM_SKILL_PROFILES: dict[str, list[str]] = {
    "computer science": [
        "programming", "python", "java", "algorithms", "data structures",
        "software development", "web development", "database", "sql",
        "operating systems", "networking", "oop", "version control", "git",
        "problem solving", "machine learning", "data analysis",
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
    "_default": [
        "communication", "critical thinking", "problem solving",
        "teamwork", "time management", "computer literacy",
    ],
}

# ── Seed Corpus ───────────────────────────────────────────────────────────────

SEED_CORPUS: list[tuple[int, str]] = [
    (0, "python java javascript react nodejs programming coding software development git version control api rest backend frontend"),
    (0, "mobile development flutter android ios swift kotlin firebase app deployment"),
    (0, "devops docker kubernetes ci cd pipeline cloud aws azure gcp infrastructure automation"),
    (0, "database sql postgresql mongodb orm query optimization schema design normalization"),
    (0, "cybersecurity penetration testing vulnerability network security linux firewall encryption"),
    (1, "data analysis statistics excel tableau power bi visualization reporting dashboard kpi"),
    (1, "machine learning deep learning tensorflow pytorch sklearn predictive modeling classification regression"),
    (1, "research quantitative qualitative survey spss r stata hypothesis testing data collection"),
    (1, "business intelligence data warehouse etl pipeline sql analytics insights decision making"),
    (2, "communication interpersonal skills teamwork collaboration presentation public speaking client relations"),
    (2, "writing report documentation technical writing copywriting editing proofreading content"),
    (2, "customer service client management relationship building negotiation conflict resolution"),
    (3, "leadership management team lead supervisor project management planning coordination"),
    (3, "strategic planning operations management decision making resource allocation budget"),
    (3, "human resources recruitment training performance evaluation compensation hr management"),
    (4, "civil engineering structural construction autocad site supervision cost estimation surveying"),
    (4, "electrical engineering circuit design power systems plc automation instrumentation maintenance"),
    (4, "mechanical engineering manufacturing machining maintenance equipment repair quality control"),
    (4, "quality assurance testing iso standards inspection process improvement root cause analysis"),
    (5, "patient care nursing clinical assessment vital signs medication administration hospital ward"),
    (5, "diagnosis treatment physician doctor medical specialist imaging laboratory interpretation"),
    (5, "rehabilitation physical therapy occupational therapy exercise program patient education"),
    (5, "pharmacy dispensing drug interaction medication counseling prescription compounding"),
    (6, "accounting bookkeeping financial statements tax auditing cpa compliance reporting"),
    (6, "finance investment banking portfolio risk management financial modeling valuation"),
    (6, "supply chain logistics procurement inventory operations management erp sap"),
    (6, "marketing social media advertising campaign seo content strategy brand management"),
    (7, "research methodology literature review data collection analysis publication thesis dissertation"),
    (7, "grant writing academic writing journal publishing conference presentation peer review"),
    (7, "laboratory experiment analysis testing scientific method protocol documentation"),
    (8, "microsoft office word excel powerpoint google workspace tools productivity documentation"),
    (8, "crm erp sap oracle system tools software applications digital literacy"),
    (8, "social media management scheduling content calendar analytics engagement community"),
    (9, "teaching lesson plan curriculum classroom management student assessment evaluation"),
    (9, "training facilitation workshop adult learning instructional design onboarding"),
    (9, "tutoring mentoring coaching academic support review center learning development"),
]

# ── Stopwords ─────────────────────────────────────────────────────────────────

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
    return " ".join(t for t in text.split() if t not in _STOPWORDS and len(t) > 2)

def _match_program_profile(program: str) -> list[str]:
    pl = program.lower()
    for key, skills in PROGRAM_SKILL_PROFILES.items():
        if key != "_default" and key in pl:
            return skills
    return PROGRAM_SKILL_PROFILES["_default"]


# ── LDA Analyzer ─────────────────────────────────────────────────────────────

class LDASkillsAnalyzer:

    def __init__(self) -> None:
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.lda: Optional[LatentDirichletAllocation] = None
        self.is_trained: bool = False
        self._fit_seed()

    def _fit_seed(self) -> None:
        texts = [_clean(text) for _, text in SEED_CORPUS]
        self._fit(texts)
        logger.info("LDA bootstrapped from seed corpus (%d docs, %d topics).", len(texts), N_TOPICS)

    def _fit(self, cleaned_texts: list[str]) -> None:
        self.vectorizer = TfidfVectorizer(
            max_features=MAX_FEATURES, min_df=MIN_DF, max_df=MAX_DF, ngram_range=(1, 2),
        )
        X = self.vectorizer.fit_transform(cleaned_texts)
        self.lda = LatentDirichletAllocation(
            n_components=N_TOPICS, max_iter=MAX_ITER, learning_method="batch",
            random_state=RANDOM_STATE, doc_topic_prior=0.1, topic_word_prior=0.01,
        )
        self.lda.fit(X)
        self.is_trained = True

    # ── Student use case ──────────────────────────────────────────────────────

    def recommend_for_student(self, program: str) -> dict:
        """
        Given a degree program, recommend skills the student should develop.
        Uses the program's profile to find relevant LDA topics, then surfaces
        the top skill keywords from those topics as recommendations.
        """
        profile = _match_program_profile(program)

        # Encode the program profile text through LDA to find relevant topics
        profile_text = _clean(" ".join(profile))
        if not profile_text or not self.is_trained:
            return {"program": program, "recommended_skills": profile, "skill_topics": [], "program_profile": profile}

        X = self.vectorizer.transform([profile_text])
        topic_dist = self.lda.transform(X)[0]

        # Top 3 most relevant topics for this program
        top_idx = np.argsort(topic_dist)[::-1][:3]
        total = topic_dist[top_idx].sum() or 1.0

        skill_topics = []
        recommended = set()
        for idx in top_idx:
            words = self._top_words_for_topic(int(idx))
            skill_topics.append({
                "topic_id":  int(idx),
                "label":     SKILL_TOPIC_LABELS.get(int(idx), f"Domain {idx}"),
                "score":     float(topic_dist[idx] / total),
                "top_words": words,
            })
            recommended.update(words[:5])

        # Merge with program profile, surface skills not already in profile
        profile_set = set(s.lower() for s in profile)
        extra_skills = [s for s in recommended if s not in profile_set]

        return {
            "program":            program,
            "recommended_skills": profile + extra_skills[:8],
            "skill_topics":       skill_topics,
            "program_profile":    profile,
        }

    # ── Admin use case ────────────────────────────────────────────────────────

    def analyze_industry_trends(self, job_texts: list[str]) -> dict:
        """
        Given all job texts from employment records, identify the top skill
        domains and most in-demand skills across all industries.
        Template for admin skill trend analysis.
        """
        if not job_texts or not self.is_trained:
            return {
                "status": "no_data",
                "message": "No employment records with job text found.",
                "top_skill_domains": [],
                "top_skills_overall": [],
                "skills_by_domain": {},
            }

        cleaned = [_clean(t) for t in job_texts if t.strip()]
        X = self.vectorizer.transform(cleaned)
        topic_matrix = self.lda.transform(X)   # shape (n_docs, n_topics)

        # Average topic distribution across all documents
        avg_dist = topic_matrix.mean(axis=0)
        ranked = np.argsort(avg_dist)[::-1]

        top_domains = []
        skills_by_domain = {}
        for idx in ranked:
            label = SKILL_TOPIC_LABELS.get(int(idx), f"Domain {idx}")
            words = self._top_words_for_topic(int(idx))
            top_domains.append({
                "topic_id":   int(idx),
                "label":      label,
                "prevalence": round(float(avg_dist[idx]), 4),
                "top_words":  words,
            })
            skills_by_domain[label] = words

        # Overall most frequent skill terms across all job texts
        from collections import Counter
        all_tokens: list[str] = []
        for t in cleaned:
            all_tokens.extend(t.split())
        vocab = set(self.vectorizer.get_feature_names_out())
        skill_counts = Counter(t for t in all_tokens if t in vocab)
        top_skills = [{"skill": s, "count": c} for s, c in skill_counts.most_common(20)]

        return {
            "status":            "ok",
            "n_records_analyzed": len(cleaned),
            "top_skill_domains": top_domains,
            "top_skills_overall": top_skills,
            "skills_by_domain":  skills_by_domain,
        }

    # ── Shared gap analysis (for employment record submission) ────────────────

    def analyze_gap(self, job_text: str, program: str, top_k: int = 3) -> dict:
        if not self.is_trained:
            raise RuntimeError("Model not trained.")

        cleaned = _clean(job_text)
        if not cleaned:
            return self._empty_gap(program)

        X = self.vectorizer.transform([cleaned])
        topic_dist = self.lda.transform(X)[0]
        ranked_idx = np.argsort(topic_dist)[::-1][:top_k]
        total = topic_dist[ranked_idx].sum() or 1.0

        skill_topics = [{
            "topic_id":  int(idx),
            "label":     SKILL_TOPIC_LABELS.get(int(idx), f"Domain {idx}"),
            "score":     float(topic_dist[idx] / total),
            "top_words": self._top_words_for_topic(int(idx)),
        } for idx in ranked_idx]

        skills_in_job     = self._extract_keywords(cleaned)
        skills_from_prog  = _match_program_profile(program)
        job_set           = set(k.lower() for k in skills_in_job)
        prog_set          = set(k.lower() for k in skills_from_prog)
        gap               = sorted(job_set - prog_set)
        surplus           = sorted(prog_set - job_set)
        union             = job_set | prog_set
        alignment         = len(job_set & prog_set) / len(union) if union else 0.0

        return {
            "skill_topics":           skill_topics,
            "skills_in_job":          skills_in_job,
            "skills_from_program":    skills_from_prog,
            "gap_skills":             gap,
            "surplus_skills":         surplus,
            "alignment_score":        round(alignment, 4),
            "lda_topic_distribution": {
                SKILL_TOPIC_LABELS.get(i, f"Topic {i}"): round(float(topic_dist[i]), 4)
                for i in range(N_TOPICS)
            },
        }

    # ── Retraining ────────────────────────────────────────────────────────────

    def retrain(self, raw_texts: list[str]) -> dict:
        if len(raw_texts) < 10:
            return {"status": "skipped", "reason": "Need at least 10 texts."}
        self._fit([_clean(t) for t in raw_texts])
        logger.info("LDA retrained on %d texts.", len(raw_texts))
        return {
            "status":  "ok",
            "n_texts": len(raw_texts),
            "topics":  {i: self._top_words_for_topic(i) for i in range(N_TOPICS)},
            "message": "Review top words and update SKILL_TOPIC_LABELS.",
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _top_words_for_topic(self, topic_id: int, n: int = TOP_WORDS_N) -> list[str]:
        names = self.vectorizer.get_feature_names_out()
        vec   = self.lda.components_[topic_id]
        return [names[i] for i in np.argsort(vec)[::-1][:n]]

    def _extract_keywords(self, cleaned_text: str) -> list[str]:
        vocab   = set(self.vectorizer.get_feature_names_out())
        tokens  = cleaned_text.split()
        matched = [t for t in tokens if t in vocab]
        bigrams = [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens)-1)]
        matched += [b for b in bigrams if b in vocab]
        seen, result = set(), []
        for t in matched:
            if t not in seen:
                seen.add(t); result.append(t)
            if len(result) >= 20:
                break
        return result

    def _empty_gap(self, program: str) -> dict:
        prof = _match_program_profile(program)
        return {
            "skill_topics": [], "skills_in_job": [], "skills_from_program": prof,
            "gap_skills": [], "surplus_skills": prof, "alignment_score": 0.0,
            "lda_topic_distribution": {},
        }

    def topic_summary(self) -> list[dict]:
        return [{"topic_id": i, "label": SKILL_TOPIC_LABELS.get(i, f"Domain {i}"), "top_words": self._top_words_for_topic(i)} for i in range(N_TOPICS)]

    def get_program_profile(self, program: str) -> dict:
        return {"program": program, "expected_skills": _match_program_profile(program)}


# ── Singleton ─────────────────────────────────────────────────────────────────

lda_analyzer = LDASkillsAnalyzer()
