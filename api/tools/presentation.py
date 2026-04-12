"""
PRISM Analyst — Presenton Presentation Tool
=============================================
Modular proxy for the Presenton Presentation Maker API.

Provides async generation, polling, retrieval, and export.
All calls route to PRESENTON_BASE_URL (env or default).

Usage:
    from api.tools.presentation import (
        generate_presentation_async,
        poll_presentation_status,
        get_presentation,
        export_presentation,
        summarize_chat_for_presentation,
        detect_presentation_intent,
    )
"""

import json
import os
import re
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv
load_dotenv()

PRESENTON_BASE_URL = os.getenv("PRESENTON_BASE_URL", "http://34.47.250.116:5000")

# ─────────────────────────────────────────────────────────────────
# INTENT DETECTION
# ─────────────────────────────────────────────────────────────────

# Patterns that signal presentation-creation intent
_PRESENTATION_PATTERNS = [
    r"\bcreate\s+(a\s+)?presentation\b",
    r"\bmake\s+(a\s+)?presentation\b",
    r"\bgenerate\s+(a\s+)?presentation\b",
    r"\bcreate\s+(a\s+)?ppt\b",
    r"\bmake\s+(a\s+)?ppt\b",
    r"\bgenerate\s+(a\s+)?ppt\b",
    r"\bcreate\s+slides?\b",
    r"\bmake\s+slides?\b",
    r"\bgenerate\s+slides?\b",
    r"\bpresentation\s+on\b",
    r"\bslides?\s+on\b",
    r"\bppt\s+on\b",
    r"\bbuild\s+(a\s+)?presentation\b",
    r"\bprepare\s+(a\s+)?presentation\b",
    r"\bconvert\s+.*\s+to\s+presentation\b",
    r"\bturn\s+.*\s+into\s+(a\s+)?presentation\b",
    r"\bturn\s+.*\s+into\s+slides?\b",
    r"\bpresentation\s+from\s+(this\s+)?(conversation|chat|discussion)\b",
    r"\bslides?\s+from\s+(this\s+)?(conversation|chat|discussion)\b",
    r"\bppt\s+from\s+(this\s+)?(conversation|chat|discussion)\b",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _PRESENTATION_PATTERNS]

# Patterns that signal "based on conversation/chat context"
_CONTEXT_PATTERNS = [
    r"\b(from|based\s+on|using)\s+(this\s+)?(conversation|chat|discussion|above|context)\b",
    r"\b(this|the)\s+(conversation|chat|discussion)\b",
    r"\babove\s+(conversation|chat|discussion|analysis|response)\b",
]
_COMPILED_CONTEXT = [re.compile(p, re.IGNORECASE) for p in _CONTEXT_PATTERNS]


def detect_presentation_intent(question: str) -> Optional[Dict[str, Any]]:
    """
    Check if a user question is asking to create a presentation.
    
    Returns None if not a presentation request.
    Returns dict with parsed params if it is:
        {
            "tool": "presentation",
            "topic": str | None,
            "use_chat_context": bool,
            "n_slides": int
        }
    """
    matched = any(p.search(question) for p in _COMPILED_PATTERNS)
    if not matched:
        return None

    # Determine if they want to use conversation context
    use_context = any(p.search(question) for p in _COMPILED_CONTEXT)

    # Extract explicit slide count if mentioned
    n_slides = 6  # default
    slide_match = re.search(r"(\d+)\s*slides?", question, re.IGNORECASE)
    if slide_match:
        n = int(slide_match.group(1))
        if 2 <= n <= 30:
            n_slides = n

    # Extract topic: strip the command prefix to get the subject
    topic = question
    # Remove common command prefixes
    for prefix_pattern in [
        r"^(please\s+)?create\s+(a\s+)?presentation\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?make\s+(a\s+)?presentation\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?generate\s+(a\s+)?presentation\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?create\s+(a\s+)?ppt\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?make\s+(a\s+)?ppt\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?generate\s+(a\s+)?ppt\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?create\s+slides?\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?make\s+slides?\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?build\s+(a\s+)?presentation\s+(on|about|for|regarding)\s+",
        r"^(please\s+)?prepare\s+(a\s+)?presentation\s+(on|about|for|regarding)\s+",
    ]:
        topic = re.sub(prefix_pattern, "", topic, flags=re.IGNORECASE).strip()

    # Clean trailing slide count info
    topic = re.sub(r"\s*with\s+\d+\s*slides?\s*$", "", topic, flags=re.IGNORECASE).strip()
    topic = re.sub(r"\s*,?\s*\d+\s*slides?\s*$", "", topic, flags=re.IGNORECASE).strip()

    # If they want context-based, topic might be empty or just "this conversation"
    if use_context and (not topic or re.match(r"^(this|the)?\s*(conversation|chat|discussion)$", topic, re.IGNORECASE)):
        topic = None  # Will be filled from chat history

    return {
        "tool": "presentation",
        "topic": topic if topic else None,
        "use_chat_context": use_context,
        "n_slides": n_slides,
    }


# ─────────────────────────────────────────────────────────────────
# CHAT CONTEXT SUMMARIZATION
# ─────────────────────────────────────────────────────────────────

def summarize_chat_for_presentation(
    messages: List[Dict[str, str]],
    topic_hint: Optional[str] = None
) -> str:
    """
    Convert a list of chat messages into a content block suitable
    for Presenton's `content` field.

    Messages format: [{"role": "user"|"assistant", "content": "..."}]
    """
    parts = []
    if topic_hint:
        parts.append(f"Topic: {topic_hint}\n")

    parts.append("The following is a research conversation between a user and an AI financial analyst. "
                 "Create a professional presentation summarizing the key insights:\n\n")

    for msg in messages:
        role_label = "Analyst" if msg.get("role") == "assistant" else "User"
        content = msg.get("content", "").strip()
        if content:
            # Truncate very long messages to keep within API limits
            if len(content) > 2000:
                content = content[:2000] + "..."
            parts.append(f"**{role_label}:** {content}\n\n")

    combined = "".join(parts)
    # Cap total content to ~8000 chars for API safety
    if len(combined) > 8000:
        combined = combined[:8000] + "\n\n[Content truncated for presentation generation]"

    return combined


# ─────────────────────────────────────────────────────────────────
# PRESENTON API CALLS
# ─────────────────────────────────────────────────────────────────

def _presenton_request(
    method: str,
    path: str,
    body: Optional[dict] = None,
    timeout: int = 30
) -> dict:
    """Make an HTTP request to the Presenton API."""
    url = f"{PRESENTON_BASE_URL}{path}"
    print(f"[Presenton] {method} {url}")

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method=method
        )
    else:
        req = urllib.request.Request(url, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if raw:
                return json.loads(raw)
            return {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        print(f"[Presenton] HTTP {e.code}: {error_body[:500]}")
        raise RuntimeError(f"Presenton API error {e.code}: {error_body[:200]}")
    except Exception as e:
        print(f"[Presenton] Request failed: {e}")
        raise RuntimeError(f"Presenton connection failed: {e}")


def generate_presentation_async(
    content: str,
    n_slides: int = 6,
    language: str = "English",
    template: str = "general",
    tone: str = "default",
    verbosity: str = "standard",
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Trigger async presentation generation on Presenton.
    Returns: {"id": "task-uuid", "status": "pending", "message": "..."}
    """
    payload = {
        "content": content,
        "n_slides": n_slides,
        "language": language,
        "template": template,
        "export_as": "pptx",
        "tone": tone,
        "verbosity": verbosity,
        "include_title_slide": True,
        "include_table_of_contents": n_slides >= 5,
        "web_search": False,
    }
    if instructions:
        payload["instructions"] = instructions

    return _presenton_request("POST", "/api/v1/ppt/presentation/generate/async", payload, timeout=30)


def poll_presentation_status(task_id: str) -> Dict[str, Any]:
    """
    Poll the status of an async presentation generation task.
    Returns: {"id", "status": "pending"|"completed"|"error", "data": {...}, "error": ...}
    """
    return _presenton_request("GET", f"/api/v1/ppt/presentation/status/{task_id}", timeout=15)


def get_presentation(presentation_id: str) -> Dict[str, Any]:
    """Get a full presentation with all slides."""
    return _presenton_request("GET", f"/api/v1/ppt/presentation/{presentation_id}", timeout=15)


def export_presentation(presentation_id: str, export_as: str = "pptx") -> Dict[str, Any]:
    """
    Export a presentation as PPTX or PDF.
    Returns: {"presentation_id", "path", "edit_path"}
    """
    return _presenton_request("POST", "/api/v1/ppt/presentation/export", {
        "id": presentation_id,
        "export_as": export_as
    }, timeout=60)


def get_download_url(path: str) -> str:
    """Convert a Presenton relative path to a proxied download URL via nginx."""
    # Strip the base URL if it was already fully qualified
    if path.startswith("http"):
        from urllib.parse import urlparse
        parsed = urlparse(path)
        path = parsed.path
        if parsed.query:
            path += f"?{parsed.query}"
            
    clean_path = path.lstrip("/")
    
    import sys
    # If running locally (Windows), return absolute URL since we don't have Nginx sub_filter locally
    # and HTTP localhost doesn't trigger Mixed Content errors for HTTP iframes.
    if sys.platform == "win32":
        return f"{PRESENTON_BASE_URL}/{clean_path}"
        
    return f"/presenton/{clean_path}"


def get_edit_url(edit_path: str) -> str:
    """Convert a Presenton edit_path to a proxied editor URL via nginx."""
    if edit_path.startswith("http"):
        from urllib.parse import urlparse
        parsed = urlparse(edit_path)
        edit_path = parsed.path
        if parsed.query:
            edit_path += f"?{parsed.query}"
            
    clean_path = edit_path.lstrip("/")
    
    import sys
    if sys.platform == "win32":
        return f"{PRESENTON_BASE_URL}/{clean_path}"
        
    return f"/presenton/{clean_path}"
