"""
PRISM Analyst — Data Visualizer Tool
======================================
Modular proxy for the Financial Data Visualization API.

Detects chart/graph/plot intent → proxies to DATA_VIZ_BASE_URL → returns Plotly JSON.
Follows the same architecture as presentation.py for consistency.

Usage:
    from api.tools.visualizer import (
        detect_visualizer_intent,
        chat_visualizer,
        list_datasets,
        get_dataset_info,
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

DATA_VIZ_BASE_URL = os.getenv("DATA_VIZ_BASE_URL", "http://34.47.250.116:8080")


# ─────────────────────────────────────────────────────────────────
# INTENT DETECTION
# ─────────────────────────────────────────────────────────────────

_VISUALIZER_PATTERNS = [
    # Direct chart/graph requests
    r"\b(create|make|generate|build|draw|show|give)\s+(me\s+)?(a\s+)?(bar|line|pie|scatter|area|histogram|heatmap|column|donut|waterfall|funnel|treemap|radar|bubble)\s*(chart|graph|plot|diagram|visualization)?\b",
    r"\b(bar|line|pie|scatter|area|histogram|heatmap|column|donut|waterfall|funnel|treemap|radar|bubble)\s*(chart|graph|plot|diagram)\b",
    # Generic plot/chart/graph requests
    r"\b(plot|chart|graph|visualize|visualise)\s+",
    r"\b(create|make|generate|build|draw|show)\s+(me\s+)?(a\s+)?(chart|graph|plot|visualization|visualisation)\b",
    # "show me a chart of..."
    r"\bshow\s+me\s+(a\s+)?(chart|graph|plot|visualization)\s+(of|for|showing)\b",
    # Explicit visualization requests
    r"\bvisualize\s+",
    r"\bvisualise\s+",
    r"\bdata\s+visualization\b",
    r"\bplot\s+(the\s+)?(data|revenue|profit|income|expense|growth|trend|sales|price|volume)\b",
    r"\b(revenue|profit|income|sales|price|growth)\s+(chart|graph|plot|trend)\b",
    # Compare visually
    r"\bcompare\s+.*\s+(visually|graphically|in\s+a\s+chart)\b",
    r"\b(trend|trends)\s+(chart|graph|line|analysis|plot)\b",
]

_COMPILED_VIZ_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _VISUALIZER_PATTERNS]

# Chart type extraction
_CHART_TYPE_MAP = {
    "bar": "bar", "column": "bar",
    "line": "line", "trend": "line",
    "pie": "pie", "donut": "pie",
    "scatter": "scatter", "bubble": "scatter",
    "area": "area",
    "histogram": "histogram",
    "heatmap": "heatmap",
    "waterfall": "waterfall",
    "funnel": "funnel",
    "treemap": "treemap",
    "radar": "radar",
}


def _extract_chart_type(text: str) -> Optional[str]:
    """Extract the requested chart type from user text."""
    text_lower = text.lower()
    for keyword, chart_type in _CHART_TYPE_MAP.items():
        if keyword in text_lower:
            return chart_type
    return None


def _extract_viz_topic(text: str) -> str:
    """Extract the visualization topic/subject from the user's message."""
    # Remove the chart-request preamble to isolate the topic
    cleaned = re.sub(
        r"^(please\s+)?(can\s+you\s+)?(create|make|generate|build|draw|show|plot|chart|graph|visualize|visualise)\s+"
        r"(me\s+)?(a\s+)?(bar|line|pie|scatter|area|histogram|heatmap|column|donut)?\s*"
        r"(chart|graph|plot|diagram|visualization|visualisation)?\s*(of|for|showing|about|on)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    ).strip()
    return cleaned if cleaned else text


def detect_visualizer_intent(question: str) -> Optional[Dict[str, Any]]:
    """
    Detect if a user message is requesting data visualization.
    
    Returns a tool-call dict if visualization intent is detected, None otherwise.
    The dict follows the same shape as presentation tool calls for consistency.
    """
    for pattern in _COMPILED_VIZ_PATTERNS:
        if pattern.search(question):
            chart_type = _extract_chart_type(question)
            topic = _extract_viz_topic(question)
            return {
                "tool": "visualizer",
                "topic": topic,
                "chart_type_hint": chart_type,
                "message": question,  # send the full original question to the Viz API
            }
    return None


# ─────────────────────────────────────────────────────────────────
# FILE UPLOAD & DATASET MANAGEMENT
# ─────────────────────────────────────────────────────────────────

# Allowed extensions for client-side validation
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".html", ".md", ".json", ".txt"}
MAX_FILE_SIZE_MB = 50


def upload_files(file_tuples: list) -> dict:
    """
    Proxy file upload to DataViz API POST /api/upload.
    
    Args:
        file_tuples: List of (filename, file_bytes, content_type) tuples
    
    Returns:
        { dataset_ids, datasets, message } on success
        { error: str } on failure
    """
    try:
        import uuid
        boundary = f"----PRISMBoundary{uuid.uuid4().hex}"
        url = f"{DATA_VIZ_BASE_URL}/api/upload"
        
        # Build multipart/form-data body manually
        body_parts = []
        for filename, file_bytes, content_type in file_tuples:
            body_parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            )
            body_parts.append(file_bytes)
            body_parts.append(b"\r\n")
        body_parts.append(f"--{boundary}--\r\n")
        
        # Combine string and bytes parts
        body = b""
        for part in body_parts:
            if isinstance(part, str):
                body += part.encode("utf-8")
            else:
                body += part
        
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            print(f"[VISUALIZER] Upload success: {result.get('message')}, dataset_ids: {result.get('dataset_ids')}")
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"[VISUALIZER] Upload HTTP Error {e.code}: {error_body}")
        try:
            detail = json.loads(error_body)
            return {"error": detail.get("detail", {}).get("message", error_body)}
        except Exception:
            return {"error": error_body}
    except Exception as e:
        print(f"[VISUALIZER] Upload failed: {e}")
        return {"error": f"Failed to upload files: {str(e)}"}


def delete_dataset(dataset_id: str) -> dict:
    """Proxy dataset deletion to DataViz API DELETE /api/dataset/{id}."""
    try:
        url = f"{DATA_VIZ_BASE_URL}/api/dataset/{dataset_id}"
        req = urllib.request.Request(url, method="DELETE")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[VISUALIZER] Delete failed for {dataset_id}: {e}")
        return {"error": str(e)}


def list_datasets() -> List[Dict[str, Any]]:
    """List all uploaded datasets from the Data Visualization API."""
    try:
        url = f"{DATA_VIZ_BASE_URL}/api/datasets"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[VISUALIZER] Failed to list datasets: {e}")
        return []


def get_dataset_info(dataset_id: str, rows: int = 5) -> Optional[Dict[str, Any]]:
    """Get metadata and preview for a specific dataset."""
    try:
        url = f"{DATA_VIZ_BASE_URL}/api/dataset/{dataset_id}?rows={rows}"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"[VISUALIZER] Failed to get dataset {dataset_id}: {e}")
        return None


def match_datasets_from_context(
    conversation_context: Optional[str] = None,
    nse_code: Optional[str] = None
) -> Optional[List[str]]:
    """
    Intelligently match datasets based on conversation context.
    
    Strategy:
      1. If nse_code provided → search for datasets with matching company name/ticker
      2. If conversation mentions a company → search for matching datasets
      3. If no match found → return None (caller should ask for clarification)
    """
    datasets = list_datasets()
    if not datasets:
        return None

    # Build search terms from context
    search_terms = []
    if nse_code:
        search_terms.append(nse_code.lower())
    
    if conversation_context:
        # Extract potential company names / keywords from context
        context_lower = conversation_context.lower()
        for ds in datasets:
            filename = ds.get("filename", "").lower()
            # Check if any dataset filename is mentioned in the conversation
            base_name = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")
            if base_name and base_name in context_lower:
                return [ds["dataset_id"]]

    # Try matching nse_code against dataset filenames
    if search_terms:
        matched = []
        for ds in datasets:
            filename = ds.get("filename", "").lower()
            for term in search_terms:
                if term in filename:
                    matched.append(ds["dataset_id"])
                    break
        if matched:
            return matched

    # If only 1 dataset exists, use it by default
    if len(datasets) == 1:
        return [datasets[0]["dataset_id"]]

    # No match — caller should ask for clarification
    return None


# ─────────────────────────────────────────────────────────────────
# CHART GENERATION (Proxy to Data Viz API)
# ─────────────────────────────────────────────────────────────────

def chat_visualizer(
    message: str,
    dataset_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Send a natural language message to the Data Visualization API.
    
    Returns the full ChatResponse including:
      - intent: "chart" | "analysis" | "query" | "clarify"
      - message: AI explanation
      - chart: Plotly figure JSON (when intent == "chart")
      - chart_type: "bar", "line", "pie", etc.
      - chart_config: Additional chart configuration
      - analysis: Statistical analysis object
      - data: Raw data
      - datasets_used: List of dataset IDs used
    """
    try:
        url = f"{DATA_VIZ_BASE_URL}/api/chat"
        payload: Dict[str, Any] = {"message": message}
        if dataset_ids:
            payload["dataset_ids"] = dataset_ids

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            print(f"[VISUALIZER] Chat response intent: {result.get('intent')}, chart_type: {result.get('chart_type')}")
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"[VISUALIZER] HTTP Error {e.code}: {error_body}")
        return {
            "intent": "error",
            "message": f"Data Visualization API error: {error_body}",
            "chart": None,
        }
    except Exception as e:
        print(f"[VISUALIZER] Request failed: {e}")
        return {
            "intent": "error",
            "message": f"Failed to connect to Data Visualization service: {str(e)}",
            "chart": None,
        }


# ─────────────────────────────────────────────────────────────────
# CONVERSATION TEXT EXTRACTION  (for /api/text fallback)
# ─────────────────────────────────────────────────────────────────

def chat_has_chartable_data(chat_history: List[Dict[str, str]]) -> bool:
    """
    Check whether the conversation history contains assistant messages
    with actual data that could be charted (tables, numbers, metrics).
    
    Returns False if the only content is the user's current question
    (i.e., no prior RAG response with data).
    """
    if not chat_history:
        return False
    
    for msg in chat_history:
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", "")
        # Skip tool-call UI messages
        if content.startswith(("📊", "🔧", "✅")):
            continue
        # Check for indicators of chartable data
        has_table = "|---" in content or "|–" in content
        has_numbers = any(c.isdigit() for c in content)
        has_financial_keywords = any(kw in content.lower() for kw in [
            "revenue", "profit", "crore", "lakh", "million", "billion",
            "₹", "$", "growth", "fy", "quarter", "q1", "q2", "q3", "q4",
            "income", "net", "total", "ebitda", "margin"
        ])
        if has_numbers and (has_table or has_financial_keywords):
            return True
    return False

def extract_conversation_text(chat_history: List[Dict[str, str]]) -> str:
    """
    Extract meaningful data content from the conversation history.
    
    Focuses on assistant responses that contain tables, numbers, and
    structured data that the DataViz API can parse.
    
    Strategy:
      1. Walk messages in reverse (most recent first)
      2. Prefer messages with markdown tables (|---|) or CSV-like data
      3. Include all user+assistant text as context
      4. Cap at a reasonable size for the API
    """
    if not chat_history:
        return ""

    MAX_CHARS = 12000  # /api/text can handle large text
    parts = []
    total = 0

    # Walk in reverse — most recent messages are most relevant
    for msg in reversed(chat_history):
        role = msg.get("role", "")
        content = msg.get("content", "").strip()
        if not content or role not in ("user", "assistant"):
            continue

        # Skip tool-call UI messages (📊, 🔧, ✅ prefixed)
        if content.startswith(("📊", "🔧", "✅")):
            continue

        chunk = f"[{role.upper()}]: {content}\n\n"
        if total + len(chunk) > MAX_CHARS:
            break
        parts.append(chunk)
        total += len(chunk)

    # Reverse back to chronological order
    parts.reverse()
    return "".join(parts)


# ─────────────────────────────────────────────────────────────────
# TEXT-BASED VISUALIZATION  (no upload required)
# ─────────────────────────────────────────────────────────────────

def text_visualizer(
    text: str,
    question: str,
    name: str = "conversation_data"
) -> Dict[str, Any]:
    """
    Send raw text + question to /api/text for instant visualization.
    
    This endpoint parses the text (CSV, TSV, markdown table, or natural
    language), answers the question or generates a chart, and returns
    the result.  Data is NOT stored on the server.
    
    Returns the same shape as chat_visualizer (intent, message, chart, etc).
    """
    try:
        url = f"{DATA_VIZ_BASE_URL}/api/text"
        payload: Dict[str, Any] = {
            "text": text,
            "question": question,
            "name": name,
        }

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            print(f"[VISUALIZER/TEXT] Response intent: {result.get('intent')}, "
                  f"chart_type: {result.get('chart_type')}, "
                  f"has_chart: {result.get('chart') is not None}")
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"[VISUALIZER/TEXT] HTTP Error {e.code}: {error_body}")
        return {
            "intent": "error",
            "message": f"Text visualization API error: {error_body}",
            "chart": None,
        }
    except Exception as e:
        print(f"[VISUALIZER/TEXT] Request failed: {e}")
        return {
            "intent": "error",
            "message": f"Failed to connect to Text Visualization service: {str(e)}",
            "chart": None,
        }


def get_playground_url(dataset_id: Optional[str] = None) -> str:
    """Get the interactive playground URL."""
    if dataset_id:
        return f"{DATA_VIZ_BASE_URL}/api/playground/{dataset_id}"
    return f"{DATA_VIZ_BASE_URL}/api/playground"
