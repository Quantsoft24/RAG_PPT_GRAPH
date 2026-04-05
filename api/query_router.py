"""
PRISM Analyst — Query Router v2 (Industry-Grade Intent Classification)
=======================================================================
Three-layer company detection:
  1. DETERMINISTIC — Scan query text against master_companies DB (instant, 100% reliable)
  2. LLM-ASSISTED  — Gemini → OpenRouter → Ollama (for edge cases)
  3. CLARIFICATION  — Only when query truly has no company context

This ensures "ICICI Bank revenue" ALWAYS works, even with no API keys.
"""

import json
import os
import re
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple

from dotenv import load_dotenv
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

_GEMINI_KEYS_RAW = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_1", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
    os.getenv("GEMINI_API_KEY_4", "")
]
GEMINI_API_KEYS = [k for k in _GEMINI_KEYS_RAW if k]
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
CLASSIFIER_MODEL = "gemma-3-27b-it"
OPENROUTER_MODEL = "google/gemma-3-27b-it:free"


class QueryIntent(str, Enum):
    COMPANY_SPECIFIC = "company_specific"
    COMPARISON = "comparison"
    AMBIGUOUS = "ambiguous"
    GENERAL = "general"  # For greetings and pure conversation


@dataclass
class ClassificationResult:
    intent: QueryIntent
    companies: List[str] = field(default_factory=list)  # resolved nse_codes
    original_question: str = ""
    clarification_message: Optional[str] = None
    suggestions: List[dict] = field(default_factory=list)
    follow_up_questions: List[dict] = field(default_factory=list)  # [{text, nse_code}]


# =============================================================================
# LAYER 1: DETERMINISTIC COMPANY DETECTION (No LLM — instant, reliable)
# =============================================================================

# Cache for company lookup data (loaded once from DB)
_company_cache: Optional[List[dict]] = None


def _load_company_cache(conn) -> List[dict]:
    """Load all companies from DB into memory for fast text matching."""
    global _company_cache
    if _company_cache is not None:
        return _company_cache

    cur = conn.cursor()
    cur.execute("SELECT nse_code, company_name FROM master_companies")
    rows = cur.fetchall()

    _company_cache = []
    for row in rows:
        nse_code = row[0]
        company_name = row[1]

        # Build all possible aliases a user might type
        aliases = set()

        # Full company name and NSE code
        aliases.add(company_name.lower())
        aliases.add(nse_code.lower())

        # Common fragments: "Infosys Limited" → "infosys"
        # "Mahindra & Mahindra Limited" → "mahindra"
        # "ICICI Bank Limited" → "icici bank", "icici"
        # "Adani Enterprises Limited" → "adani enterprises", "adani"
        name_lower = company_name.lower()

        # Remove common suffixes
        for suffix in [" limited", " ltd", " ltd.", " inc", " inc.", " corporation", " corp", " corp."]:
            if name_lower.endswith(suffix):
                short = name_lower[:-len(suffix)].strip()
                aliases.add(short)
                # Also add first word (e.g., "mahindra" from "mahindra & mahindra")
                first_word = short.split()[0] if short.split() else ""
                if len(first_word) >= 4:  # Avoid matching very short words
                    aliases.add(first_word)

        # Add words before "&" or "and" (e.g., "mahindra" from "mahindra & mahindra")
        for sep in [" & ", " and "]:
            if sep in name_lower:
                parts = name_lower.split(sep)
                for p in parts:
                    clean = p.strip()
                    for suffix in [" limited", " ltd", " ltd."]:
                        clean = clean.replace(suffix, "").strip()
                    if len(clean) >= 4:
                        aliases.add(clean)

        _company_cache.append({
            "nse_code": nse_code,
            "company_name": company_name,
            "aliases": aliases
        })

    print(f"[QueryRouter] Loaded {len(_company_cache)} companies into cache")
    for c in _company_cache:
        print(f"  -> {c['nse_code']}: {sorted(c['aliases'])}")
    return _company_cache


def _detect_company_from_text(conn, question: str) -> List[Tuple[str, str]]:
    """
    Deterministic company detection: scan query text against known companies.
    Returns list of (nse_code, company_name) tuples.
    
    This is the MOST RELIABLE detection layer — no API calls, instant response.
    Works even with zero API keys configured.
    """
    companies = _load_company_cache(conn)
    q_lower = question.lower()

    detected = []
    seen_codes = set()

    for company in companies:
        for alias in company["aliases"]:
            # Check if the alias appears as a distinct word/phrase in the query
            # Use word boundary matching to avoid false positives
            # e.g., "an" should not match inside "annual"
            pattern = r'(?:^|[\s,;:\'"(])' + re.escape(alias) + r'(?:[\s,;:\'")?!.]|$)'
            if re.search(pattern, q_lower):
                if company["nse_code"] not in seen_codes:
                    detected.append((company["nse_code"], company["company_name"]))
                    seen_codes.add(company["nse_code"])
                break  # Found a match for this company, move to next

    print(f"[QueryRouter] Deterministic detection: {detected}")
    return detected


# =============================================================================
# LAYER 1 EXPANDED: Deterministic General Detection
# =============================================================================

# Exact-match phrases that are always conversational / non-financial
GENERAL_EXACT_PHRASES = {
    # ── Greetings ──
    "hi", "hii", "hiii", "hello", "hey", "howdy", "yo", "sup",
    "good morning", "good evening", "good afternoon", "good night",
    "namaste", "hola", "bonjour",
    # ── Meta / Capability questions ──
    "who are you", "what are you", "what can you do", "help",
    "what is prism", "how do you work", "what do you know",
    "what are your capabilities", "tell me about yourself",
    "can you help me", "what is this tool", "how can you help",
    # ── Feedback / Acknowledgements ──
    "thank you", "thanks", "thanks a lot", "thank you so much",
    "that was helpful", "great", "nice", "ok", "okay", "cool",
    "got it", "understood", "perfect", "awesome", "good", "sure",
    "no", "yes", "yep", "nope", "alright", "fine", "wonderful",
    # ── Farewells ──
    "bye", "goodbye", "see you", "later", "see you later",
    "good bye", "take care",
    # ── Chitchat ──
    "how are you", "what's up", "tell me a joke",
    "what's your name", "are you ai", "are you human",
}

# Prefixes that indicate a definition/conceptual question (NOT a data request)
# Key insight: "What is A balance sheet?" = definition vs "What is THE balance sheet?" = data request
DEFINITION_PREFIXES = [
    "what is a ", "what is an ", "what are ",
    "define ", "explain ", "meaning of ",
    "what does ", "how does ", "how do ",
    "difference between ", "what is the difference between ",
    "tell me about the concept of ",
]


def _is_general_query(question: str) -> bool:
    """
    Deterministic check: Is this a general/conversational query?
    Covers greetings, meta, feedback, farewells, definitions, and chitchat.
    Returns True if the query should be routed to GENERAL (no company needed).
    """
    lower_q = question.lower().strip().rstrip("!?.,;")

    # 1. Exact match against the comprehensive general phrases set
    if lower_q in GENERAL_EXACT_PHRASES:
        return True

    # 2. Very short queries (≤2 words, purely alphabetic) — likely greetings
    words = lower_q.split()
    if len(words) <= 2 and all(w.isalpha() for w in words):
        return True

    # 3. Definition/conceptual questions: "What is a/an X?" (not "What is the X?")
    for prefix in DEFINITION_PREFIXES:
        if lower_q.startswith(prefix):
            return True

    return False


# =============================================================================
# LAYER 3: LLM CLASSIFICATION with Few-Shot Examples (edge cases only)
# =============================================================================

CLASSIFICATION_PROMPT = """You are a query intent classifier for a financial analyst system that analyzes company annual reports.

Given the user's question, classify it into ONE of these categories:

RULES:
- "company_specific": The user mentions ONE specific company (by name, ticker, or abbreviation).
- "comparison": The user mentions TWO OR MORE companies to compare.
- "ambiguous": The user is clearly requesting financial DATA or analysis, but did NOT mention which company. This query NEEDS a company to answer.
- "general": Conversational greetings, chitchat, general knowledge questions, definitions, or questions NOT requesting specific company data.

Here are labeled examples to guide your classification:

"What is the revenue?" → ambiguous (requesting data, no company specified)
"Show me the profit trends" → ambiguous (requesting data, no company specified)
"How are they performing?" → ambiguous (requesting data, no company specified)
"Tell me about Q3 results" → ambiguous (requesting data, no company specified)
"What is the balance sheet?" → ambiguous (requesting specific data)
"What is the debt to equity ratio?" → ambiguous (requesting data)
"Revenue of Infosys" → company_specific
"Compare Adani and ICICI" → comparison
"What is EBITDA?" → general (asking for a definition, not company data)
"How does the stock market work?" → general (general knowledge question)
"What's the weather?" → general (off-topic, not financial data)
"Tell me about ESG investing" → general (conceptual/educational topic)

IMPORTANT: When in doubt between "ambiguous" and "general", choose "ambiguous". It is safer to ask the user to specify a company than to give a vague answer.

Respond in STRICT JSON (no markdown):
{{
  "intent": "company_specific" | "comparison" | "ambiguous" | "general",
  "company_mentions": ["exact company name/ticker as written by user"],
  "topic": "core topic"
}}

User question: "{question}"
"""



def _call_gemini(question: str) -> Optional[dict]:
    """Call Gemini for intent classification."""
    if not GEMINI_API_KEYS:
        return None

    prompt = CLASSIFICATION_PROMPT.format(question=question)
    for api_key in GEMINI_API_KEYS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{CLASSIFIER_MODEL}:generateContent?key={api_key}"
            payload = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.0,
                    "maxOutputTokens": 256,
                    "responseMimeType": "application/json"
                }
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                candidates = data.get("candidates", [])
                if candidates:
                    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    text = text.strip()
                    if text.startswith("```"):
                        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
                    result = json.loads(text)
                    print(f"[QueryRouter] Gemini classified: {result}")
                    return result
        except urllib.error.HTTPError as e:
            if e.code == 429:
                continue
        except Exception as e:
            print(f"[QueryRouter] Gemini failed: {e}")
            continue
    return None


def _call_openrouter(question: str) -> Optional[dict]:
    """Call OpenRouter free models for intent classification."""
    if not OPENROUTER_API_KEY:
        return None

    prompt = CLASSIFICATION_PROMPT.format(question=question)
    try:
        url = "https://openrouter.ai/api/v1/chat/completions"
        payload = json.dumps({
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 256,
            "response_format": {"type": "json_object"}
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://prism-analyst.local",
            "X-Title": "PRISM Analyst"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            choices = data.get("choices", [])
            if choices:
                text = choices[0].get("message", {}).get("content", "")
                text = text.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0]
                result = json.loads(text)
                print(f"[QueryRouter] OpenRouter classified: {result}")
                return result
    except Exception as e:
        print(f"[QueryRouter] OpenRouter failed: {e}")
    return None


def _call_ollama(question: str) -> Optional[dict]:
    """Fallback: Ollama classification."""
    prompt = CLASSIFICATION_PROMPT.format(question=question)
    try:
        url = f"{OLLAMA_BASE_URL}/api/generate"
        payload = json.dumps({
            "model": os.getenv("LLM_MODEL", "tinyllama"),
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0, "num_predict": 256}
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            text = data.get("response", "")
            result = json.loads(text)
            print(f"[QueryRouter] Ollama classified: {result}")
            return result
    except Exception as e:
        print(f"[QueryRouter] Ollama failed: {e}")
    return None


# =============================================================================
# DATABASE FUZZY MATCHING (for LLM-extracted mentions)
# =============================================================================

def _resolve_company_mentions(conn, mentions: List[str]) -> List[Tuple[str, str]]:
    """Fuzzy-match extracted company names against master_companies."""
    if not mentions:
        return []

    cur = conn.cursor()
    resolved = []

    for mention in mentions:
        mention = mention.strip()
        if not mention:
            continue

        # 1. Exact match on nse_code
        cur.execute(
            "SELECT nse_code, company_name FROM master_companies WHERE UPPER(nse_code) = UPPER(%s)",
            (mention,)
        )
        row = cur.fetchone()
        if row:
            resolved.append((row[0], row[1]))
            continue

        # 2. Partial match on company_name
        cur.execute(
            "SELECT nse_code, company_name FROM master_companies WHERE company_name ILIKE %s LIMIT 1",
            (f"%{mention}%",)
        )
        row = cur.fetchone()
        if row:
            resolved.append((row[0], row[1]))
            continue

        # 3. Partial match on nse_code
        cur.execute(
            "SELECT nse_code, company_name FROM master_companies WHERE nse_code ILIKE %s LIMIT 1",
            (f"%{mention}%",)
        )
        row = cur.fetchone()
        if row:
            resolved.append((row[0], row[1]))

    return resolved


def _get_top_companies(conn, limit: int = 6) -> List[dict]:
    """Get a sample set of companies for suggestion chips."""
    cur = conn.cursor()
    cur.execute(
        "SELECT nse_code, company_name FROM master_companies ORDER BY company_name LIMIT %s",
        (limit,)
    )
    return [{"nse_code": row[0], "company_name": row[1], "label": f"{row[1]} ({row[0]})"} for row in cur.fetchall()]


# =============================================================================
# TOPIC EXTRACTION (deterministic — no LLM needed)
# =============================================================================

def _extract_topic(question: str) -> str:
    """Extract the core financial topic from a question."""
    lower = question.lower().strip().rstrip("?").rstrip(".")

    # Remove common question starters
    for prefix in [
        "what is the", "what are the", "what is", "what are",
        "tell me about the", "tell me about", "tell me the",
        "show me the", "show me", "show the",
        "how is the", "how are the", "how is", "how are",
        "describe the", "give me the", "give me",
        "what does the", "what do the",
        "can you tell me the", "can you tell me about",
        "can you show me the", "can you show me",
        "i want to know about the", "i want to know about",
        "i want to know the", "i want to see the",
    ]:
        if lower.startswith(prefix):
            lower = lower[len(prefix):].strip()
            break

    # Remove trailing company name references
    for marker in [" for ", " of ", " from "]:
        if marker in lower:
            lower = lower[:lower.index(marker)].strip()
            break

    return lower if lower else question.strip().rstrip("?")


# =============================================================================
# MAIN CLASSIFICATION FUNCTION (3-Layer Intelligence)
# =============================================================================

def classify_query(
    conn,
    question: str,
    selected_nse_code: Optional[str] = None
) -> ClassificationResult:
    """
    Industry-grade 4-Layer Cascading Query Classification:

      Layer 1: Deterministic General Detection
               (Expanded whitelist + definition patterns + feedback/farewells)
               Cost: 0 API calls | Latency: <1ms

      Layer 2: Deterministic Company Detection
               (Regex against company alias cache)
               Cost: 0 API calls | Latency: <1ms

      Layer 3: Few-Shot LLM Classification
               (Gemma 3 with 12+ labeled examples, biased toward AMBIGUOUS)
               Cost: 1 API call | Latency: ~1-2s

      Layer 4: Safe Fallback
               (Default to AMBIGUOUS — asking for clarification is always safe)
               Cost: 0 API calls
    """
    print(f"\n[QueryRouter] Classifying: '{question}' | dropdown: '{selected_nse_code}'")

    # ── Layer 0: User selected a company in the dropdown ──
    if selected_nse_code:
        print(f"[QueryRouter] -> Layer 0 (dropdown): {selected_nse_code}")
        return ClassificationResult(
            intent=QueryIntent.COMPANY_SPECIFIC,
            companies=[selected_nse_code],
            original_question=question
        )

    # ── Layer 1: Deterministic General Detection ──
    # Catches greetings, meta-questions, feedback, farewells, definitions,
    # and short conversational inputs. Zero API calls, <1ms.
    if _is_general_query(question):
        print(f"[QueryRouter] -> Layer 1 (deterministic general): '{question}' -> GENERAL. Bypassing LLM.")
        return ClassificationResult(
            intent=QueryIntent.GENERAL,
            original_question=question
        )

    # ── Layer 2: Deterministic Company Detection ──
    detected = _detect_company_from_text(conn, question)

    if len(detected) == 1:
        print(f"[QueryRouter] -> Layer 2 (deterministic company): COMPANY_SPECIFIC -> {detected[0][0]}")
        return ClassificationResult(
            intent=QueryIntent.COMPANY_SPECIFIC,
            companies=[d[0] for d in detected],
            original_question=question
        )

    if len(detected) >= 2:
        print(f"[QueryRouter] -> Layer 2 (deterministic company): COMPARISON -> {[d[0] for d in detected]}")
        return ClassificationResult(
            intent=QueryIntent.COMPARISON,
            companies=[d[0] for d in detected],
            original_question=question
        )

    # ── Layer 3: Few-Shot LLM Classification (edge cases only) ──
    # Only reached when: NOT a greeting/meta/feedback AND NO company detected.
    # Uses Gemma 3 with explicit few-shot examples biased toward AMBIGUOUS.
    print("[QueryRouter] -> Layer 3 (Few-Shot LLM): No company detected, calling LLM...")
    llm_result = _call_gemini(question)
    if llm_result is None:
        llm_result = _call_openrouter(question)
    if llm_result is None:
        llm_result = _call_ollama(question)

    if llm_result:
        intent_str = llm_result.get("intent", "ambiguous")
        mentions = llm_result.get("company_mentions", [])

        # Resolve LLM-extracted mentions against DB
        resolved = _resolve_company_mentions(conn, mentions)

        if intent_str == "company_specific" and len(resolved) >= 1:
            print(f"[QueryRouter] -> Layer 3 (LLM): COMPANY_SPECIFIC -> {resolved[0][0]}")
            return ClassificationResult(
                intent=QueryIntent.COMPANY_SPECIFIC,
                companies=[r[0] for r in resolved],
                original_question=question
            )

        if intent_str == "comparison" and len(resolved) >= 2:
            return ClassificationResult(
                intent=QueryIntent.COMPARISON,
                companies=[r[0] for r in resolved],
                original_question=question
            )

        # LLM found a company name but DB couldn't match
        # IMPORTANT: Only show "I couldn't find company X" if the user ACTUALLY
        # typed that company name. If the LLM hallucinated a name (e.g. "Ada Networks")
        # that doesn't appear in the original query, skip to generic clarification.
        if intent_str == "company_specific" and len(resolved) == 0 and mentions:
            mention_lower = mentions[0].lower()
            if mention_lower in question.lower():
                return _build_clarification(
                    conn, question,
                    message=f"I couldn't find a company matching '{mentions[0]}'. Did you mean one of these?"
                )

        if intent_str == "general":
            print(f"[QueryRouter] -> Layer 3 (LLM): GENERAL")
            return ClassificationResult(
                intent=QueryIntent.GENERAL,
                original_question=question
            )

    # ── Layer 4: Safe Fallback — Default to AMBIGUOUS ──
    # If we reach here, either the LLM said "ambiguous" or all LLM providers
    # failed. Asking for clarification is ALWAYS safer than guessing.
    print("[QueryRouter] -> Layer 4 (Safe Fallback): AMBIGUOUS -- asking for clarification")
    return _build_clarification(conn, question)


def _build_clarification(
    conn,
    question: str,
    message: str = "Which company are you interested in? Please select one below or refine your question."
) -> ClassificationResult:
    """Build a clarification response with follow-ups that carry nse_code."""
    top_companies = _get_top_companies(conn, limit=6)
    topic = _extract_topic(question)

    follow_ups = []
    for c in top_companies[:4]:
        follow_ups.append({
            "text": f"What is the {topic} for {c['company_name']}?",
            "nse_code": c["nse_code"]
        })

    return ClassificationResult(
        intent=QueryIntent.AMBIGUOUS,
        companies=[],
        original_question=question,
        clarification_message=message,
        suggestions=[
            {"label": c["label"], "nse_code": c["nse_code"]}
            for c in top_companies
        ],
        follow_up_questions=follow_ups
    )
