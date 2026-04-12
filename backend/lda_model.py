"""
lda_model.py  —  Graduate Tracer System v3
─────────────────────────────────────────────────────────────────────────────
Loads lda_model.joblib (7 topics, 8000 features, bigrams).

Hybrid recommendation strategy:
  1. LDA-driven discovery  → top filtered words from relevant topic clusters
  2. Curated supplements   → pre-defined skills that the model either
                             under-ranks or lacks in its vocabulary
  3. Major specificity     → supplement keys support major/specialization
                             overrides so CS/Data Science ≠ CS/Network Security
  4. Merge + dedup         → LDA words fill first, supplements fill gaps
  5. Skill categorization  → technical / tool / soft / domain tags

Supplements live in PROGRAM_SKILL_SUPPLEMENTS and are easy to extend —
add a new key matching any program or major keyword, add categorized lists.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import re
import logging
import warnings
from pathlib import Path
from collections import Counter
from typing import Optional

import numpy as np
import joblib

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent / "lda_model.joblib"

# ── Program → Topic mapping ───────────────────────────────────────────────────
# Topic IDs (v2 model):
#   0 Healthcare and Medical    1 Business Governance
#   2 Information Technology    3 Business Development
#   4 Engineering/Manufacturing 5 Education
#   6 Data Analytics/Marketing

PROGRAM_TOPIC_MAP: dict[str, dict] = {
    # ── Topic index reference (NMF, 8 topics, trained on Philippine job postings) ──
    #   0  Information Technology & Security
    #   1  General Employment / Admin
    #   2  Engineering & Construction
    #   3  Education & Teaching
    #   4  Marketing, Media & Creative
    #   5  Data Analytics & Business Intelligence
    #   6  Healthcare & Medical
    #   7  Business Development & Sales

    # ── IT & Software ─────────────────────────────────────────────────────────
    "computer science":        {"topics": [0, 5],  "depth": 0},
    "information technology":  {"topics": [0, 5],  "depth": 4},
    "information systems":     {"topics": [0, 5],  "depth": 8},
    "computer engineering":    {"topics": [0, 2],  "depth": 4},
    "software":                {"topics": [0, 5],  "depth": 2},
    "data science":            {"topics": [5, 0],  "depth": 0},
    "statistics":              {"topics": [5, 7],  "depth": 4},
    "mathematics":             {"topics": [5, 7],  "depth": 8},

    # ── Business ──────────────────────────────────────────────────────────────
    "business administration": {"topics": [7, 5],  "depth": 0},
    "management":              {"topics": [7, 5],  "depth": 4},
    "entrepreneurship":        {"topics": [7, 4],  "depth": 4},
    "accountancy":             {"topics": [5, 7],  "depth": 0},
    "accounting":              {"topics": [5, 7],  "depth": 4},
    "finance":                 {"topics": [5, 7],  "depth": 4},
    "economics":               {"topics": [5, 7],  "depth": 8},
    "marketing":               {"topics": [4, 7],  "depth": 0},
    "human resource":          {"topics": [7, 5],  "depth": 0},

    # ── Engineering ───────────────────────────────────────────────────────────
    "civil engineering":       {"topics": [2, 7],  "depth": 0},
    "electrical engineering":  {"topics": [2, 0],  "depth": 4},
    "mechanical engineering":  {"topics": [2, 7],  "depth": 4},
    "industrial engineering":  {"topics": [2, 7],  "depth": 8},
    "chemical engineering":    {"topics": [2, 7],  "depth": 8},
    "engineering":             {"topics": [2, 0],  "depth": 0},

    # ── Healthcare ────────────────────────────────────────────────────────────
    "nursing":                 {"topics": [6, 7],  "depth": 0},
    "medicine":                {"topics": [6, 7],  "depth": 4},
    "pharmacy":                {"topics": [6, 7],  "depth": 8},
    "medical":                 {"topics": [6, 7],  "depth": 4},
    "health":                  {"topics": [6, 7],  "depth": 8},
    "physical therapy":        {"topics": [6, 2],  "depth": 0},

    # ── Education ─────────────────────────────────────────────────────────────
    "education":               {"topics": [3, 7],  "depth": 0},
    "teaching":                {"topics": [3, 0],  "depth": 0},

    # ── Media & Communication ─────────────────────────────────────────────────
    "communication":           {"topics": [4, 7],  "depth": 0},
    "multimedia":              {"topics": [4, 5],  "depth": 0},
    "journalism":              {"topics": [4, 3],  "depth": 0},
    "mass communication":      {"topics": [4, 7],  "depth": 4},

    # ── Social & Public ───────────────────────────────────────────────────────
    "psychology":              {"topics": [6, 3],  "depth": 0},
    "social work":             {"topics": [6, 3],  "depth": 4},
    "political science":       {"topics": [7, 3],  "depth": 0},
    "public administration":   {"topics": [7, 3],  "depth": 4},

    "_default":                {"topics": [7, 5],  "depth": 0},
}

# NMF topic labels matching the 8-topic model
NMF_TOPIC_LABELS: dict[int, str] = {
    0: "Information Technology & Security",
    1: "General Employment",
    2: "Engineering & Construction",
    3: "Education & Teaching",
    4: "Marketing, Media & Creative",
    5: "Data Analytics & Business Intelligence",
    6: "Healthcare & Medical",
    7: "Business Development & Sales",
}

# Topic indices identified as noise/background topics.
# These absorb high-frequency boilerplate job-listing language (pay, location,
# benefits, permanent, month) rather than actual skill domains.
# Excluded from all student recommendations, admin charts, and market trends.
NOISE_TOPICS: set[int] = {1}

def _resolve_program(program: str, major: str = "") -> dict:
    """
    Match a degree program to its NMF topic configuration.
    Priority: program string → major string → default.
    """
    prog_lower  = program.lower()
    major_lower = (major or "").lower().strip()

    for key, cfg in PROGRAM_TOPIC_MAP.items():
        if key == "_default":
            continue
        if key in prog_lower:
            return cfg

    if major_lower:
        for key, cfg in PROGRAM_TOPIC_MAP.items():
            if key == "_default":
                continue
            if key in major_lower:
                return cfg

    return PROGRAM_TOPIC_MAP["_default"]


PROGRAM_SKILL_SUPPLEMENTS: dict[str, dict[str, list[str]]] = {

    # ── Computer Science ─────────────────────────────────────────────────────
    "computer science": {
        "technical": [
            "python", "java", "javascript", "c++", "algorithms",
            "data structures", "object oriented programming", "sql",
            "git", "rest api", "software development", "web development",
            "database design", "operating systems", "machine learning",
        ],
        "tool": [
            "github", "vs code", "docker", "linux", "postman",
        ],
        "soft": [
            "problem solving", "analytical thinking", "attention to detail",
            "logical reasoning", "teamwork",
        ],
        "domain": [
            "software architecture", "system design", "debugging",
            "code review", "version control",
        ],
    },

    # ── Major: Data Science (overrides/extends CS base) ──────────────────────
    "data science": {
        "technical": [
            "python", "r", "sql", "machine learning", "deep learning",
            "statistical analysis", "data visualization", "pandas",
            "scikit-learn", "data wrangling", "feature engineering",
            "regression", "classification", "neural networks",
        ],
        "tool": [
            "jupyter notebook", "tableau", "power bi", "excel",
            "google colab", "matplotlib", "seaborn",
        ],
        "soft": [
            "analytical thinking", "problem solving", "critical thinking",
            "data storytelling", "research skills",
        ],
        "domain": [
            "exploratory data analysis", "model evaluation",
            "a/b testing", "data pipelines", "business intelligence",
        ],
    },

    # ── Major: Network Security ───────────────────────────────────────────────
    "network security": {
        "technical": [
            "cybersecurity", "penetration testing", "network security",
            "firewall configuration", "encryption", "ethical hacking",
            "vulnerability assessment", "intrusion detection",
            "linux", "tcp ip", "python scripting",
        ],
        "tool": [
            "wireshark", "nmap", "kali linux", "metasploit",
            "splunk", "cisco",
        ],
        "soft": [
            "analytical thinking", "problem solving", "attention to detail",
            "risk assessment",
        ],
        "domain": [
            "security auditing", "incident response", "threat analysis",
            "compliance", "security protocols", "digital forensics",
        ],
    },

    # ── Information Technology ────────────────────────────────────────────────
    "information technology": {
        "technical": [
            "networking", "system administration", "it support",
            "troubleshooting", "cloud computing", "virtualization",
            "cybersecurity", "database management", "sql",
            "active directory", "tcp ip", "hardware configuration",
        ],
        "tool": [
            "microsoft azure", "aws", "google cloud", "vmware",
            "windows server", "linux", "cisco",
        ],
        "soft": [
            "communication", "problem solving", "customer service",
            "time management", "documentation",
        ],
        "domain": [
            "network infrastructure", "it governance", "helpdesk support",
            "disaster recovery", "it project management",
        ],
    },

    # ── Information Systems ───────────────────────────────────────────────────
    "information systems": {
        "technical": [
            "systems analysis", "database design", "sql",
            "business analysis", "erp implementation",
            "it governance", "data modeling", "requirements gathering",
            "process improvement",
        ],
        "tool": [
            "sap", "oracle", "microsoft dynamics", "excel",
            "visio", "jira",
        ],
        "soft": [
            "analytical thinking", "communication", "stakeholder management",
            "problem solving", "documentation",
        ],
        "domain": [
            "systems integration", "change management",
            "business process management", "data governance",
            "it infrastructure", "enterprise architecture",
        ],
    },

    # ── Accountancy ───────────────────────────────────────────────────────────
    "accountancy": {
        "technical": [
            "financial reporting", "auditing", "taxation",
            "bookkeeping", "financial analysis", "budgeting",
            "cost accounting", "management accounting",
            "internal controls", "financial statements",
            "accounts payable", "accounts receivable",
        ],
        "tool": [
            "excel", "quickbooks", "sap", "xero",
            "microsoft office", "oracle financials",
        ],
        "soft": [
            "attention to detail", "analytical thinking", "integrity",
            "communication", "time management",
        ],
        "domain": [
            "philippine tax law", "gaap", "ifrs",
            "audit procedures", "risk management",
            "compliance", "payroll processing",
        ],
    },

    # ── Business Administration ───────────────────────────────────────────────
    "business administration": {
        "technical": [
            "financial analysis", "operations management",
            "strategic planning", "project management",
            "supply chain management", "market research",
            "business development",
        ],
        "tool": [
            "excel", "powerpoint", "salesforce", "microsoft office",
            "google workspace", "trello",
        ],
        "soft": [
            "leadership", "communication", "negotiation",
            "decision making", "teamwork", "problem solving",
            "critical thinking", "time management",
        ],
        "domain": [
            "organizational management", "human resources",
            "marketing strategy", "financial management",
            "customer relations", "business ethics",
        ],
    },

    # ── Marketing ─────────────────────────────────────────────────────────────
    "marketing": {
        "technical": [
            "digital marketing", "seo", "sem", "social media marketing",
            "content marketing", "email marketing", "google analytics",
            "data analytics", "market research", "campaign management",
        ],
        "tool": [
            "google ads", "facebook ads manager", "hubspot",
            "mailchimp", "canva", "hootsuite", "google analytics",
        ],
        "soft": [
            "creativity", "communication", "analytical thinking",
            "project management", "storytelling",
        ],
        "domain": [
            "brand management", "consumer behavior", "marketing strategy",
            "market segmentation", "competitive analysis", "roi analysis",
        ],
    },

    # ── Human Resource ────────────────────────────────────────────────────────
    "human resource": {
        "technical": [
            "recruitment", "talent acquisition", "payroll processing",
            "performance management", "training and development",
            "compensation and benefits", "labor law",
            "employee relations", "hris",
        ],
        "tool": [
            "workday", "sap hr", "excel", "applicant tracking systems",
            "microsoft office",
        ],
        "soft": [
            "communication", "empathy", "conflict resolution",
            "organizational skills", "confidentiality",
            "interpersonal skills",
        ],
        "domain": [
            "philippine labor code", "job evaluation",
            "organizational development", "workforce planning",
            "employee engagement", "succession planning",
        ],
    },

    # ── Civil Engineering ─────────────────────────────────────────────────────
    "civil engineering": {
        "technical": [
            "structural analysis", "construction management",
            "project planning", "cost estimation", "surveying",
            "materials testing", "site supervision", "drafting",
            "environmental compliance", "geotechnical engineering",
        ],
        "tool": [
            "autocad", "revit", "sketchup", "primavera",
            "microsoft project", "civil 3d",
        ],
        "soft": [
            "project management", "problem solving", "attention to detail",
            "communication", "leadership",
        ],
        "domain": [
            "building codes", "structural design", "road design",
            "drainage design", "quantity surveying",
            "construction safety", "nscp",
        ],
    },

    # ── Electrical Engineering ────────────────────────────────────────────────
    "electrical engineering": {
        "technical": [
            "circuit design", "power systems", "electrical installation",
            "plc programming", "automation", "instrumentation",
            "control systems", "electronics", "signal processing",
            "motor drives", "wiring design",
        ],
        "tool": [
            "autocad electrical", "matlab", "simulink",
            "multisim", "microsoft office", "eplan",
        ],
        "soft": [
            "problem solving", "analytical thinking", "attention to detail",
            "teamwork", "technical documentation",
        ],
        "domain": [
            "philippine electrical code", "load calculations",
            "electrical safety", "preventive maintenance",
            "energy management", "transformer design",
        ],
    },

    # ── Mechanical Engineering ────────────────────────────────────────────────
    "mechanical engineering": {
        "technical": [
            "machine design", "thermodynamics", "fluid mechanics",
            "manufacturing processes", "quality control",
            "welding", "cad modeling", "finite element analysis",
            "preventive maintenance", "materials science",
        ],
        "tool": [
            "autocad", "solidworks", "catia", "ansys",
            "microsoft office",
        ],
        "soft": [
            "problem solving", "analytical thinking", "teamwork",
            "technical writing", "attention to detail",
        ],
        "domain": [
            "iso standards", "six sigma", "lean manufacturing",
            "production planning", "equipment calibration",
            "safety protocols", "root cause analysis",
        ],
    },

    # ── Chemical Engineering ──────────────────────────────────────────────────
    "chemical engineering": {
        "technical": [
            "process design", "chemical process simulation",
            "mass and energy balance", "reaction engineering",
            "separation processes", "process safety",
            "quality control", "laboratory techniques",
        ],
        "tool": [
            "aspen plus", "chemcad", "matlab", "excel",
            "hysys",
        ],
        "soft": [
            "analytical thinking", "problem solving", "attention to detail",
            "teamwork", "technical writing",
        ],
        "domain": [
            "gmp", "hazop", "process optimization",
            "environmental compliance", "safety management",
            "materials handling",
        ],
    },

    # ── Nursing ───────────────────────────────────────────────────────────────
    "nursing": {
        "technical": [
            "patient care", "clinical assessment", "medication administration",
            "vital signs monitoring", "wound care", "iv therapy",
            "infection control", "emergency response",
            "health education", "documentation",
        ],
        "tool": [
            "electronic health records", "patient monitoring systems",
            "electronic medical records",
        ],
        "soft": [
            "compassion", "communication", "empathy",
            "critical thinking", "teamwork", "time management",
            "stress management",
        ],
        "domain": [
            "nursing process", "clinical procedures", "triage",
            "patient safety", "nursing ethics", "pharmacology",
            "anatomy and physiology",
        ],
    },

    # ── Pharmacy ──────────────────────────────────────────────────────────────
    "pharmacy": {
        "technical": [
            "drug dispensing", "pharmacology", "medication counseling",
            "compounding", "drug interaction checking",
            "inventory management", "prescription verification",
            "clinical pharmacy", "drug monitoring",
        ],
        "tool": [
            "pharmacy management systems", "electronic prescriptions",
            "microsoft office",
        ],
        "soft": [
            "patient counseling", "communication", "attention to detail",
            "integrity", "empathy",
        ],
        "domain": [
            "philippine pharmacy law", "drug regulatory affairs",
            "pharmacokinetics", "therapeutics", "healthcare regulations",
            "medication safety",
        ],
    },

    # ── Psychology ────────────────────────────────────────────────────────────
    "psychology": {
        "technical": [
            "psychological assessment", "counseling techniques",
            "behavioral analysis", "research methodology",
            "statistical analysis", "case management",
            "psychotherapy", "cognitive behavioral therapy",
        ],
        "tool": [
            "spss", "excel", "psychological testing instruments",
            "microsoft office",
        ],
        "soft": [
            "empathy", "active listening", "communication",
            "confidentiality", "critical thinking",
            "patience", "interpersonal skills",
        ],
        "domain": [
            "abnormal psychology", "developmental psychology",
            "psychological report writing", "ethics in psychology",
            "trauma-informed care", "mental health awareness",
        ],
    },

    # ── Education ─────────────────────────────────────────────────────────────
    "education": {
        "technical": [
            "lesson planning", "curriculum development",
            "instructional design", "student assessment",
            "differentiated instruction", "classroom management",
            "learning management systems",
        ],
        "tool": [
            "google classroom", "microsoft teams", "canva",
            "kahoot", "powerpoint", "zoom",
        ],
        "soft": [
            "communication", "patience", "creativity",
            "empathy", "leadership", "adaptability",
            "classroom management",
        ],
        "domain": [
            "k-12 curriculum", "deped standards",
            "educational psychology", "special education",
            "formative assessment", "summative assessment",
            "teaching strategies",
        ],
    },

    # ── Communication / Media ─────────────────────────────────────────────────
    "communication": {
        "technical": [
            "content writing", "copywriting", "media production",
            "video editing", "photography", "public relations",
            "journalism", "broadcast media", "social media management",
            "digital marketing",
        ],
        "tool": [
            "adobe premiere", "canva", "photoshop", "hootsuite",
            "wordpress", "mailchimp", "microsoft office",
        ],
        "soft": [
            "writing skills", "public speaking", "creativity",
            "storytelling", "critical thinking", "collaboration",
        ],
        "domain": [
            "media ethics", "news writing", "press releases",
            "brand communications", "crisis communications",
            "content strategy", "audience analysis",
        ],
    },

    # ── Multimedia ────────────────────────────────────────────────────────────
    "multimedia": {
        "technical": [
            "graphic design", "video editing", "animation",
            "ui ux design", "motion graphics", "3d modeling",
            "web design", "typography",
        ],
        "tool": [
            "adobe photoshop", "adobe illustrator", "adobe premiere",
            "after effects", "figma", "blender",
            "adobe xd", "final cut pro",
        ],
        "soft": [
            "creativity", "attention to detail", "collaboration",
            "time management", "client communication",
        ],
        "domain": [
            "visual communication", "brand identity",
            "user experience", "color theory",
            "print design", "digital illustration",
        ],
    },

    # ── Social Work ───────────────────────────────────────────────────────────
    "social work": {
        "technical": [
            "case management", "community organizing",
            "needs assessment", "crisis intervention",
            "program development", "social welfare services",
            "advocacy", "documentation",
        ],
        "tool": [
            "microsoft office", "case management systems",
        ],
        "soft": [
            "empathy", "communication", "active listening",
            "cultural sensitivity", "patience",
            "conflict resolution", "teamwork",
        ],
        "domain": [
            "philippine social welfare laws", "community development",
            "social casework", "group work", "family welfare",
            "child protection", "social research",
        ],
    },

    # ── Fallback supplement (applies to _default programs) ───────────────────
    "_default": {
        "technical": [
            "microsoft office", "data analysis", "report writing",
        ],
        "tool": [
            "excel", "powerpoint", "google workspace",
        ],
        "soft": [
            "communication", "teamwork", "problem solving",
            "time management", "adaptability",
        ],
        "domain": [
            "project coordination", "documentation",
        ],
    },
}

def _get_supplements(program: str, major: str = "") -> dict[str, list[str]]:
    """
    Return the curated supplement dict for a given program + major.
    First checks for a major-specific match, then program, then default.
    """
    combined = f"{program} {major}".lower()

    # Check major-specific keys first (more specific wins)
    if major and major.strip():
        for key, supp in PROGRAM_SKILL_SUPPLEMENTS.items():
            if key != "_default" and key in major.lower():
                return supp

    # Then check program
    for key, supp in PROGRAM_SKILL_SUPPLEMENTS.items():
        if key != "_default" and key in combined:
            return supp

    return PROGRAM_SKILL_SUPPLEMENTS["_default"]


# ── Domain-specific skill stopwords ──────────────────────────────────────────

SKILL_STOPWORDS = {
    "technology", "technologies", "information", "services", "service",
    "industry", "industries", "business", "businesses", "organization",
    "organizations", "company", "companies", "team", "teams", "work",
    "working", "environment", "role", "roles", "position", "opportunity",
    "build", "building", "develop", "developing", "provide", "providing",
    "support", "supporting", "ensure", "ensuring", "manage", "managing",
    "coordinate", "coordinating", "assist", "assisting", "handle",
    "maintain", "maintaining", "monitor", "monitoring", "review", "reviewing",
    "implement", "implementing", "delivery", "deliver", "delivering",
    "perform", "performing", "prepare", "preparing", "conduct", "conducting",
    "needs", "need", "required", "requirements", "ability", "skills",
    "experience", "knowledge", "understanding", "awareness",
    "strong", "excellent", "good", "great", "high", "new", "general",
    "various", "multiple", "different", "specific", "current", "existing",
    "overall", "relevant", "related", "necessary", "key", "critical",
    "effective", "efficient", "accurate", "timely", "professional",
    "year", "years", "type", "types", "internet", "application",
    "applications", "records", "inquiries", "staff", "activities",
    "procedures", "processes", "operations", "functions", "systems",
    "including", "etc", "per", "via", "well", "also", "plus",
    "engineer", "engineering", "science", "computer", "graduate",
    "teacher", "teachers", "student", "students",
}

def _is_skill_word(term: str) -> bool:
    parts = term.split()
    if len(parts) == 1:
        return term not in SKILL_STOPWORDS
    return any(p not in SKILL_STOPWORDS for p in parts)


# ── Skill category tagging ────────────────────────────────────────────────────

_TECHNICAL_KEYWORDS = {
    "python", "java", "javascript", "typescript", "c++", "sql", "html", "css",
    "react", "node", "django", "flask", "api", "rest", "cloud", "aws", "azure",
    "docker", "kubernetes", "git", "linux", "database", "postgresql", "mongodb",
    "machine learning", "deep learning", "tensorflow", "pytorch", "nlp",
    "data analysis", "data science", "statistical analysis", "algorithm",
    "programming", "software development", "web development", "mobile development",
    "networking", "cybersecurity", "penetration testing", "automation", "testing",
    "quality assurance", "devops", "ci cd", "agile", "scrum",
    "autocad", "solidworks", "matlab", "plc", "circuit", "electrical",
    "structural", "mechanical", "manufacturing", "construction",
    "financial modeling", "financial analysis", "accounting", "auditing",
    "taxation", "bookkeeping", "erp", "sap", "troubleshooting",
    "patient care", "clinical", "medication", "counseling", "assessment",
    "lesson planning", "curriculum", "instructional design",
    "research methodology", "data visualization", "digital marketing", "seo",
    "content writing", "graphic design", "video editing", "animation",
    "ui ux", "3d modeling", "circuit design", "power systems",
    "process design", "systems analysis", "database design",
    "penetration testing", "firewall", "encryption", "vulnerability",
}

_TOOLS_KEYWORDS = {
    "excel", "powerpoint", "word", "ms office", "microsoft office",
    "google sheets", "google workspace", "tableau", "power bi",
    "photoshop", "illustrator", "figma", "adobe", "after effects",
    "slack", "jira", "trello", "salesforce", "hubspot", "canva",
    "quickbooks", "xero", "oracle", "workday", "spss", "matlab",
    "autocad", "revit", "solidworks", "github", "vs code", "blender",
    "hootsuite", "mailchimp", "google analytics", "google ads",
    "zoom", "microsoft teams", "google classroom", "kahoot",
    "wireshark", "nmap", "kali linux", "metasploit", "splunk",
    "jupyter notebook", "google colab", "primavera", "hysys",
    "aspen plus", "eplan", "catia", "ansys", "civil 3d",
}

_SOFT_KEYWORDS = {
    "communication", "leadership", "teamwork", "problem solving",
    "critical thinking", "time management", "project management",
    "collaboration", "presentation", "negotiation", "conflict resolution",
    "adaptability", "creativity", "analytical thinking", "decision making",
    "interpersonal skills", "organizational skills", "attention to detail",
    "customer service", "relationship building", "empathy", "patience",
    "active listening", "public speaking", "writing skills",
    "stress management", "confidentiality", "integrity", "compassion",
    "cultural sensitivity", "storytelling", "data storytelling",
    "stakeholder management", "documentation", "technical writing",
}

def _tag_skill(skill: str) -> str:
    s = skill.lower()
    if any(k in s for k in _TOOLS_KEYWORDS):
        return "tool"
    if any(k in s for k in _TECHNICAL_KEYWORDS):
        return "technical"
    if any(k in s for k in _SOFT_KEYWORDS):
        return "soft"
    return "domain"


# ── Text cleaner ──────────────────────────────────────────────────────────────

_STOPWORDS = {
    "the", "and", "is", "in", "it", "of", "to", "a", "an", "for", "on",
    "with", "as", "at", "by", "from", "or", "be", "are", "was", "were",
    "this", "that", "i", "my", "we", "our", "you", "your", "he", "she",
    "they", "their", "its", "have", "has", "had", "will", "do", "does",
    "did", "not", "but", "if", "so", "can", "may", "must", "shall",
    "should", "would", "could", "also", "other", "such", "than", "more",
    "very", "well", "good", "able", "need", "use", "used",
}

def _clean(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return " ".join(t for t in text.split() if t not in _STOPWORDS and len(t) > 1)



# ── NMF Skills Analyzer ───────────────────────────────────────────────────────

class NMFSkillsAnalyzer:

    def __init__(self) -> None:
        self.model:          Optional[object]     = None   # NMF model
        self.vectorizer:     Optional[object]     = None
        self.topic_labels:   dict[int, str]       = {}
        self.n_topics:       int                  = 0
        self.is_trained:     bool                 = False
        self._feature_names: Optional[np.ndarray] = None
        self._top_words:     Optional[list]       = None   # pre-computed top words per topic
        self._discriminativeness: Optional[np.ndarray] = None
        self._load()

    # ── Loader ────────────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not MODEL_PATH.exists():
            logger.warning("lda_model.joblib not found at %s. NMF features disabled.", MODEL_PATH)
            return
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pipeline = joblib.load(MODEL_PATH)
        except Exception as e:
            logger.error(
                "Failed to load lda_model.joblib: %s. "
                "This is usually a numpy/scikit-learn version mismatch. "
                "Re-export the model on a machine with numpy==%s. NMF features disabled.",
                e, np.__version__,
            )
            return

        # Accept both new bundle key ("model") and old key ("lda") for backward compat
        model_obj = pipeline.get("model") or pipeline.get("lda")
        if not isinstance(pipeline, dict) or model_obj is None or "vectorizer" not in pipeline:
            logger.error("joblib bundle must have 'model' and 'vectorizer' keys. Features disabled.")
            return

        self.model      = model_obj
        self.vectorizer = pipeline["vectorizer"]
        self.n_topics   = pipeline.get("n_topics", self.model.n_components)

        # Vocabulary: use pre-exported list if available, else derive from vectorizer
        vocab = pipeline.get("vocabulary")
        if vocab is not None:
            self._feature_names = np.array(vocab)
        else:
            self._feature_names = self.vectorizer.get_feature_names_out()

        # Restore idf_ weights if the vectorizer lost its fitted state due to a
        # sklearn version mismatch during unpickling. The idf_ array is exported
        # from the Colab bundle and restored here so transform() works correctly.
        if not hasattr(self.vectorizer, "idf_") or self.vectorizer.idf_ is None:
            idf_list = pipeline.get("idf_")
            if idf_list is not None:
                self.vectorizer.idf_ = np.array(idf_list, dtype=np.float64)
                logger.info("Restored idf_ from bundle (%d values).", len(idf_list))
            else:
                logger.error(
                    "Vectorizer idf_ is missing and not in bundle. "
                    "Re-export lda_model.joblib with idf_ included — "
                    "add: \'idf_\': best_vectorizer.idf_.tolist() to the model_bundle dict. "
                    "skill-trends will be disabled until the model is re-exported."
                )
                return  # abort load — model unusable without idf_

        # Pre-computed top words per topic (list of lists, index = topic)
        self._top_words = pipeline.get("top_words")

        # Topic labels: prefer bundle labels, fall back to NMF_TOPIC_LABELS, then auto-generate
        raw_labels = pipeline.get("topic_labels", {})
        if isinstance(raw_labels, (list, tuple)):
            # List format: ["Topic 1", "Topic 2", ...]
            self.topic_labels = {i: str(v) for i, v in enumerate(raw_labels)}
        elif isinstance(raw_labels, dict):
            self.topic_labels = {int(k): str(v) for k, v in raw_labels.items()}
        else:
            self.topic_labels = {}

        # Override auto-generated "Topic N" labels with our curated NMF labels
        for i, label in NMF_TOPIC_LABELS.items():
            if i < self.n_topics:
                existing = self.topic_labels.get(i, "")
                if not existing or existing.startswith("Topic "):
                    self.topic_labels[i] = label

        # Discriminativeness matrix: how much each word belongs to each topic
        # vs the average across topics (used for ranking and market skills)
        comps = self.model.components_
        self._discriminativeness = comps / (comps.mean(axis=0, keepdims=True) + 1e-10)
        self.is_trained = True

        model_name = pipeline.get("model_name", type(self.model).__name__)
        logger.info(
            "Loaded %s: %d topics, %d features",
            model_name, self.n_topics, len(self._feature_names),
        )

    def reload(self) -> dict:
        self._load()
        return {
            "status":       "ok" if self.is_trained else "failed",
            "n_topics":     self.n_topics,
            "topic_labels": self.topic_labels,
        }

    # ── NMF normalization ─────────────────────────────────────────────────────

    @staticmethod
    def _normalize(matrix: np.ndarray) -> np.ndarray:
        """
        L1-normalize each row of a topic-activation matrix.
        NMF transform() outputs non-negative activations that do NOT sum to 1
        (unlike LDA). Normalizing makes them comparable percentages for display.
        Zero rows (no topic activation) stay as-is.
        """
        row_sums = matrix.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0   # avoid division by zero
        return matrix / row_sums

    # ── Student recommendations (hybrid NMF + curated supplements) ────────────

    def recommend_for_student(self, program: str, major: str = "") -> dict:
        """
        Hybrid recommendation:
          Step 1 — NMF: pull filtered, discriminative words from relevant topics
          Step 2 — Supplements: add curated program/major-specific skills
          Step 3 — Merge: NMF words first, supplements fill remaining slots
          Step 4 — Tag: categorize every skill as technical/tool/soft/domain
        """
        combined_label = program + (f" — {major}" if major and major.strip() else "")
        cfg            = _resolve_program(program, major)
        supplements    = _get_supplements(program, major)

        if not self.is_trained:
            return self._empty_rec(combined_label, major, supplements)

        weights      = [1.0, 0.55, 0.25, 0.1]
        total_weight = sum(weights[:len(cfg["topics"])])
        skill_topics = []
        nmf_candidates: list[tuple[float, str]] = []
        seen = set()

        for rank, tid in enumerate(cfg["topics"]):
            if tid >= self.n_topics or tid in NOISE_TOPICS:
                continue
            weight = weights[rank] if rank < len(weights) else 0.05
            words  = self._filtered_words_for_topic(tid, depth=cfg["depth"], n=30)

            scored    = []
            feat_list = list(self._feature_names)
            for w in words:
                is_bigram    = len(w.split()) > 1
                bigram_bonus = 1.6 if is_bigram else 1.0
                disc_score   = float(self._discriminativeness[tid, feat_list.index(w)])                                if w in feat_list else 1.0
                scored.append((weight * bigram_bonus * min(disc_score, 5.0), w))

            scored.sort(reverse=True)
            skill_topics.append({
                "topic_id":  tid,
                "label":     self.topic_labels.get(tid, f"Topic {tid}"),
                "score":     round(weight / total_weight, 4),
                "top_words": [w for _, w in scored[:10]],
            })
            for score, w in scored:
                if w not in seen:
                    seen.add(w)
                    nmf_candidates.append((score, w))

        nmf_candidates.sort(reverse=True)
        nmf_skills = [w for _, w in nmf_candidates]

        total = sum(t["score"] for t in skill_topics) or 1.0
        for t in skill_topics:
            t["score"] = round(t["score"] / total, 4)

        supp_skills: list[str] = []
        for cat_list in supplements.values():
            supp_skills.extend(cat_list)

        CAT_NMF_SLOTS  = {"technical": 5, "tool": 2, "soft": 2, "domain": 3}
        CAT_SUPP_SLOTS = {"technical": 5, "tool": 3, "soft": 3, "domain": 2}

        nmf_by_cat:  dict[str, list[str]] = {"technical":[], "tool":[], "soft":[], "domain":[]}
        supp_by_cat: dict[str, list[str]] = {"technical":[], "tool":[], "soft":[], "domain":[]}

        for w in nmf_skills:
            nmf_by_cat[_tag_skill(w)].append(w)

        for cat, lst in supplements.items():
            for w in lst:
                supp_by_cat.get(cat, supp_by_cat["domain"]).append(w)

        merged:     list[str] = []
        merged_set: set[str]  = set()

        def _add(word: str) -> None:
            wl = word.lower()
            if wl not in merged_set:
                merged_set.add(wl); merged.append(word)

        for cat in ["technical", "tool", "soft", "domain"]:
            added = 0
            for w in nmf_by_cat[cat]:
                if added >= CAT_NMF_SLOTS[cat]: break
                _add(w); added += 1
            added = 0
            for w in supp_by_cat[cat]:
                if added >= CAT_SUPP_SLOTS[cat]: break
                _add(w); added += 1

        tagged = [{"skill": w, "category": _tag_skill(w)} for w in merged]

        return {
            "program":            combined_label,
            "major":              major or "",
            "recommended_skills": merged[:24],
            "tagged_skills":      tagged[:24],
            "skill_topics":       skill_topics,
            "program_profile":    merged[:24],
            "lda_count":          len([w for w in merged
                                       if w.lower() in {x.lower() for x in nmf_skills}]),
            "supplement_count":   len([w for w in merged
                                       if w.lower() in {x.lower()
                                                        for lst in supplements.values()
                                                        for x in lst}]),
        }

    # ── Admin: graduate skill trends ──────────────────────────────────────────

    def analyze_industry_trends(self, job_texts: list[str]) -> dict:
        if not job_texts or not self.is_trained:
            return {
                "status": "no_data", "message": "No job text data found.",
                "top_skill_domains": [], "top_skills_overall": [], "skills_by_domain": {},
            }
        cleaned      = [_clean(t) for t in job_texts if t.strip()]
        X            = self.vectorizer.transform(cleaned)
        # NMF output must be normalized before computing averages
        topic_matrix = self._normalize(self.model.transform(X))
        avg_dist     = topic_matrix.mean(axis=0)
        ranked       = np.argsort(avg_dist)[::-1]

        top_domains, skills_by_domain = [], {}
        for idx in ranked:
            if int(idx) in NOISE_TOPICS:
                continue
            label = self.topic_labels.get(int(idx), f"Topic {idx}")
            words = self._filtered_words_for_topic(int(idx), depth=0, n=15)
            top_domains.append({
                "topic_id":   int(idx),
                "label":      label,
                "prevalence": round(float(avg_dist[idx]), 4),
                "top_words":  words,
            })
            skills_by_domain[label] = words

        all_tokens: list[str] = []
        for t in cleaned:
            toks = t.split()
            all_tokens.extend(toks)
            all_tokens.extend(f"{toks[i]} {toks[i+1]}" for i in range(len(toks)-1))
        vocab_set    = set(self._feature_names)
        skill_counts = Counter(t for t in all_tokens if t in vocab_set and _is_skill_word(t))
        top_skills   = [{"skill": s, "count": c} for s, c in skill_counts.most_common(20)]

        return {
            "status":             "ok",
            "n_records_analyzed": len(cleaned),
            "top_skill_domains":  top_domains,
            "top_skills_overall": top_skills,
            "skills_by_domain":   skills_by_domain,
        }

    # ── Gap analysis ──────────────────────────────────────────────────────────

    def analyze_gap(self, job_text: str, program: str, top_k: int = 3) -> dict:
        if not self.is_trained:
            raise RuntimeError("NMF model not loaded.")
        cleaned = _clean(job_text)
        if not cleaned:
            return self._empty_gap(program)

        X          = self.vectorizer.transform([cleaned])
        # Normalize NMF output before computing scores
        topic_dist = self._normalize(self.model.transform(X))[0]
        ranked_idx = np.argsort(topic_dist)[::-1][:top_k]
        total      = topic_dist[ranked_idx].sum() or 1.0

        skill_topics = [{
            "topic_id":  int(idx),
            "label":     self.topic_labels.get(int(idx), f"Topic {idx}"),
            "score":     float(topic_dist[idx] / total),
            "top_words": self._filtered_words_for_topic(int(idx), depth=0, n=10),
        } for idx in ranked_idx if int(idx) not in NOISE_TOPICS]

        skills_in_job  = self._extract_keywords(cleaned)
        cfg            = _resolve_program(program)
        supplements    = _get_supplements(program)
        supp_flat      = [w.lower() for lst in supplements.values() for w in lst]

        prog_seen, skills_from_prog = set(), []
        for tid in cfg["topics"]:
            if tid >= self.n_topics:
                continue
            for w in self._filtered_words_for_topic(tid, depth=cfg["depth"], n=12):
                if w not in prog_seen:
                    prog_seen.add(w); skills_from_prog.append(w)
        for w in supp_flat:
            if w not in prog_seen and len(skills_from_prog) < 20:
                prog_seen.add(w); skills_from_prog.append(w)

        job_set, prog_set = set(skills_in_job), set(skills_from_prog)
        union     = job_set | prog_set
        alignment = len(job_set & prog_set) / len(union) if union else 0.0

        return {
            "skill_topics":        skill_topics,
            "skills_in_job":       skills_in_job,
            "skills_from_program": skills_from_prog[:15],
            "gap_skills":          sorted(job_set - prog_set),
            "surplus_skills":      sorted(prog_set - job_set),
            "alignment_score":     round(alignment, 4),
            "lda_topic_distribution": {
                self.topic_labels.get(i, f"Topic {i}"): round(float(topic_dist[i]), 4)
                for i in range(self.n_topics)
            },
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _filtered_words_for_topic(self, topic_id: int, depth: int = 0, n: int = 15) -> list[str]:
        """
        Return the top n skill words for a topic.
        Sorting is always done via components_ (the full 1000-word distribution)
        so that depth-based offsets work correctly across all topic indices.
        Returns empty list for noise topics.
        """
        if topic_id >= self.n_topics or topic_id in NOISE_TOPICS:
            return []
        vec     = self.model.components_[topic_id]
        all_idx = np.argsort(vec)[::-1]
        result, skipped = [], 0
        for idx in all_idx:
            word = self._feature_names[idx]
            if not _is_skill_word(word):
                continue
            if skipped < depth:
                skipped += 1; continue
            result.append(word)
            if len(result) >= n:
                break
        return result

    def _extract_keywords(self, cleaned_text: str, max_results: int = 20) -> list[str]:
        vocab_set  = set(self._feature_names)
        tokens     = cleaned_text.split()
        candidates = list(tokens)
        candidates += [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens)-1)]
        seen, result = set(), []
        for term in candidates:
            if term in vocab_set and term not in seen and _is_skill_word(term):
                seen.add(term); result.append(term)
            if len(result) >= max_results:
                break
        return result

    def _empty_rec(self, program: str, major: str, supplements: dict) -> dict:
        supp_flat = [w for lst in supplements.values() for w in lst]
        tagged    = [{"skill": w, "category": _tag_skill(w)} for w in supp_flat[:20]]
        return {
            "program":            program,
            "major":              major or "",
            "recommended_skills": supp_flat[:20],
            "tagged_skills":      tagged,
            "skill_topics":       [],
            "program_profile":    supp_flat[:20],
            "lda_count":          0,
            "supplement_count":   len(supp_flat[:20]),
        }

    def _empty_gap(self, program: str) -> dict:
        cfg   = _resolve_program(program)
        supp  = _get_supplements(program)
        skills, seen = [], set()
        for tid in cfg["topics"]:
            if tid >= self.n_topics:
                continue
            for w in self._filtered_words_for_topic(tid, depth=cfg["depth"], n=12):
                if w not in seen: seen.add(w); skills.append(w)
        for w in [x for lst in supp.values() for x in lst]:
            if w.lower() not in seen and len(skills) < 20:
                seen.add(w.lower()); skills.append(w)
        return {
            "skill_topics":        [],
            "skills_in_job":       [],
            "skills_from_program": skills,
            "gap_skills":          [],
            "surplus_skills":      skills,
            "alignment_score":     0.0,
            "lda_topic_distribution": {},
        }

    def topic_summary(self) -> list[dict]:
        if not self.is_trained:
            return []
        return [
            {
                "topic_id": i,
                "label":    self.topic_labels.get(i, f"Topic {i}"),
                "top_words": self._filtered_words_for_topic(i, depth=0, n=10),
            }
            for i in range(self.n_topics)
            if i not in NOISE_TOPICS
        ]

    def market_skill_trends(self) -> dict:
        """
        In-demand skill clusters from the NMF model training corpus
        (Philippine job postings — NewMergedData.csv).
        """
        if not self.is_trained:
            return {
                "status":         "no_model",
                "message":        "Skill analysis model is not loaded.",
                "skill_clusters": [],
                "top_indemand":   [],
                "n_topics":       0,
                "model_source":   "Philippine job postings (NewMergedData.csv)",
            }

        total_mass = self.model.components_.sum()
        skill_clusters = []
        for i in range(self.n_topics):
            if i in NOISE_TOPICS:
                continue
            label      = self.topic_labels.get(i, f"Topic {i}")
            top_words  = self._filtered_words_for_topic(i, depth=0, n=12)
            topic_mass = self.model.components_[i].sum()
            prominence = round(topic_mass / total_mass, 4) if total_mass else 0.0
            skill_clusters.append({
                "topic_id":   i,
                "label":      label,
                "top_skills": top_words,
                "prominence": prominence,
            })
        skill_clusters.sort(key=lambda x: x["prominence"], reverse=True)

        disc_sum     = self._discriminativeness.sum(axis=0)
        top_idx      = np.argsort(disc_sum)[::-1]
        top_indemand = []
        for idx in top_idx:
            word = self._feature_names[idx]
            if not _is_skill_word(word):
                continue
            top_indemand.append({"skill": word, "score": round(float(disc_sum[idx]), 2)})
            if len(top_indemand) >= 20:
                break

        return {
            "status":         "ok",
            "skill_clusters": skill_clusters,
            "top_indemand":   top_indemand,
            "n_topics":       self.n_topics,
            "n_features":     len(self._feature_names),
            "model_source":   "Philippine job postings (NewMergedData.csv)",
        }

    def get_program_profile(self, program: str) -> dict:
        cfg  = _resolve_program(program)
        supp = _get_supplements(program)
        skills, seen = [], set()
        for tid in cfg["topics"]:
            if tid >= self.n_topics:
                continue
            for w in self._filtered_words_for_topic(tid, depth=cfg["depth"], n=10):
                if w not in seen: seen.add(w); skills.append(w)
        for w in [x for lst in supp.values() for x in lst]:
            if w.lower() not in seen: seen.add(w.lower()); skills.append(w)
        return {
            "program":         program,
            "relevant_topics": [self.topic_labels.get(t, f"Topic {t}") for t in cfg["topics"]
                                if t < self.n_topics],
            "expected_skills": skills[:20],
        }


# ── Singleton — kept as lda_analyzer for full API compatibility ───────────────

lda_analyzer = NMFSkillsAnalyzer()
