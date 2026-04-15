"""
PRISM Analyst — 3D Business Model Canvas Tool
================================================
AI-powered BMC generation with dual-framework architecture:
  • Primary:  Claude Agent SDK  (if ANTHROPIC_API_KEY is set)
  • Fallback: LangChain + Gemini (always available via existing keys)

Generates structured 9-block BMC analysis for any company,
persists results in PostgreSQL, and supports follow-up Q&A.

Usage:
    from api.tools.bmc import get_bmc_agent, save_bmc, load_bmc, list_library
"""

import json
import os
import uuid
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Any, List, Optional

import psycopg2
import psycopg2.extras
import urllib.request
import urllib.error

from dotenv import load_dotenv
load_dotenv()

# ─────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
BMC_LLM_PROVIDER = os.getenv("BMC_LLM_PROVIDER", "auto")  # auto | claude | gemini

_GEMINI_KEYS_RAW = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_1", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
    os.getenv("GEMINI_API_KEY_4", ""),
]
GEMINI_API_KEYS = [k for k in _GEMINI_KEYS_RAW if k]
GEMINI_MODEL = "gemini-3.1-flash-lite-preview"

# Database config (reuse from database/config.py)
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from database.config import DB_CONFIG


# ─────────────────────────────────────────────────────────────────
# BMC SCHEMA CONSTANTS
# ─────────────────────────────────────────────────────────────────

BMC_BLOCKS = [
    {"id": "customer_segments",      "title": "Customer Segments",      "icon": "👥", "color": "#4FC3F7"},
    {"id": "value_propositions",     "title": "Value Propositions",     "icon": "💎", "color": "#7C4DFF"},
    {"id": "channels",               "title": "Channels",               "icon": "📡", "color": "#00E676"},
    {"id": "customer_relationships", "title": "Customer Relationships", "icon": "🤝", "color": "#FF4081"},
    {"id": "revenue_streams",        "title": "Revenue Streams",        "icon": "💰", "color": "#FFD740"},
    {"id": "key_resources",          "title": "Key Resources",          "icon": "🔑", "color": "#FF6E40"},
    {"id": "key_activities",         "title": "Key Activities",         "icon": "⚙️", "color": "#18FFFF"},
    {"id": "key_partners",           "title": "Key Partners",           "icon": "🤝", "color": "#B388FF"},
    {"id": "cost_structure",         "title": "Cost Structure",         "icon": "📊", "color": "#FF5252"},
]

BMC_SYSTEM_PROMPT = """You are a senior business strategy analyst specializing in Business Model Canvas (BMC) analysis. 
You analyze companies using the standard 9-block BMC framework developed by Alexander Osterwalder.

For each block, provide:
1. A rigorous bullet-point summary containing numerical data, precise metrics, and hard facts wherever possible. USE MAX 3 BULLET POINTS. Each point MUST start with "• " or "-". Do NOT use paragraph text.
2. Supporting evidence (specific facts, numbers, products, partnerships)
3. A confidence score (0.0 to 1.0) based on how well-established this information is
4. Key strategic insights

You MUST respond with valid JSON only. No markdown, no explanation outside the JSON."""

BMC_USER_PROMPT_TEMPLATE = """Analyze the business model of "{company}" and map it to the Business Model Canvas framework.

Return a JSON object with this exact structure:
{{
  "company": "{company}",
  "nodes": [
    {{
      "id": "customer_segments",
      "title": "Customer Segments",
      "summary": "• First key metric/fact\n• Second key metric\n• Third metric",
      "evidence": ["fact 1", "fact 2", "fact 3"],
      "confidence": 0.85,
      "key_insights": ["insight 1", "insight 2"],
      "sources": ["source 1", "source 2"]
    }},
    {{
      "id": "value_propositions",
      "title": "Value Propositions",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "channels",
      "title": "Channels",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "customer_relationships",
      "title": "Customer Relationships",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "revenue_streams",
      "title": "Revenue Streams",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "key_resources",
      "title": "Key Resources",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "key_activities",
      "title": "Key Activities",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "key_partners",
      "title": "Key Partners",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }},
    {{
      "id": "cost_structure",
      "title": "Cost Structure",
      "summary": "...",
      "evidence": ["..."],
      "confidence": 0.0,
      "key_insights": ["..."],
      "sources": ["..."]
    }}
  ]
}}

Provide detailed, insightful analysis for ALL 9 blocks. Be specific with real facts."""


BMC_CHAT_PROMPT_TEMPLATE = """You are a senior business strategy analyst assisting with Business Model Canvas analysis for "{company}".

The user is viewing the "{node_title}" block. Existing analysis:
{node_context}

User message: "{question}"

RESPONSE RULES:
- If the user sends a casual greeting (hi, hello, hey, etc.), reply with a SHORT friendly greeting (1-2 sentences max). Do NOT dump analysis unprompted.
- Match the depth of your response to the complexity of the question. Simple question = short answer. Deep question = detailed answer.
- When providing analysis, use concise bullet points (max 5 bullets). Include numbers and metrics where available.
- Keep responses focused and scannable. Avoid long paragraphs.
- Use markdown formatting: **bold** for key terms, bullet points for lists.
- Maximum response length: 150 words for simple questions, 300 words for complex analytical questions."""


# ─────────────────────────────────────────────────────────────────
# ABSTRACT AGENT INTERFACE
# ─────────────────────────────────────────────────────────────────

class BMCAgent(ABC):
    """Abstract base for BMC generation agents. Swap implementations by changing config."""

    @abstractmethod
    def generate(self, company: str) -> Dict[str, Any]:
        """Generate a full 9-block BMC analysis for a company."""
        ...

    @abstractmethod
    def chat(self, company: str, node_title: str, node_context: str, question: str, history: List[Dict[str, str]] = None) -> str:
        """Answer a follow-up question regarding a specific BMC block, with optional conversation history."""
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...


# ─────────────────────────────────────────────────────────────────
# CLAUDE AGENT SDK IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────
#
# Architecture: Uses the official Claude Agent SDK (pip install claude-agent-sdk)
# which wraps the Claude Code CLI and provides a full agentic loop with:
#   • query()         — stateless, one-shot async prompt (used for BMC generation)
#   • ClaudeSDKClient — stateful, multi-turn client (used for BMC chat follow-ups)
#   • @tool decorator — define custom Python functions as MCP tools
#   • Hooks           — intercept tool calls for logging/security
#
# NOTE (Docker image size): The claude-agent-sdk package bundles the Claude Code
# CLI binary (~100MB). This increases the Docker image size. If image size is a
# concern, consider using a multi-stage build or the --no-deps flag for the CLI.
#
# FALLBACK: When ANTHROPIC_API_KEY is not set, the system automatically falls
# back to GeminiAgentBMC (see get_bmc_agent() factory below).
# ─────────────────────────────────────────────────────────────────

# ┌─────────────────────────────────────────────────────────────────┐
# │  CUSTOM MCP TOOLS (COMMENTED OUT — uncomment to activate)      │
# │  These tools give Claude access to PRISM's data layer so it    │
# │  can ground BMC analysis in real company data from our DB.     │
# └─────────────────────────────────────────────────────────────────┘
#
# from claude_agent_sdk import tool, create_sdk_mcp_server
#
# @tool("lookup_company", "Look up company information from the PRISM database", {"company_name": str})
# async def lookup_company(args):
#     """Query our PostgreSQL database for company fundamentals."""
#     company_name = args["company_name"]
#     try:
#         conn = _get_db_conn()
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute(
#             "SELECT * FROM companies WHERE name ILIKE %s LIMIT 1",
#             (f"%{company_name}%",)
#         )
#         row = cur.fetchone()
#         conn.close()
#         if row:
#             return {"content": [{"type": "text", "text": json.dumps(dict(row), default=str)}]}
#         return {"content": [{"type": "text", "text": f"No company data found for '{company_name}'"}]}
#     except Exception as e:
#         return {"content": [{"type": "text", "text": f"DB lookup error: {str(e)}"}], "is_error": True}
#
#
# @tool("search_annual_reports", "Search annual reports for evidence about a company", {"query": str, "company": str})
# async def search_annual_reports(args):
#     """Use our existing RAG pipeline to find relevant annual report passages."""
#     from api.rag import retrieve_context
#     try:
#         results = retrieve_context(args["query"], company_filter=args.get("company"))
#         if results:
#             excerpts = [r.get("text", "")[:300] for r in results[:3]]
#             return {"content": [{"type": "text", "text": json.dumps(excerpts)}]}
#         return {"content": [{"type": "text", "text": "No relevant annual report excerpts found."}]}
#     except Exception as e:
#         return {"content": [{"type": "text", "text": f"RAG search error: {str(e)}"}], "is_error": True}
#
#
# @tool("get_financials", "Get financial metrics for a company", {"company_name": str, "metric": str})
# async def get_financials(args):
#     """Retrieve financial metrics (revenue, profit, etc.) from our data pipeline."""
#     try:
#         conn = _get_db_conn()
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute(
#             """SELECT metric_name, metric_value, period, source
#                FROM financial_metrics
#                WHERE company_name ILIKE %s AND metric_name ILIKE %s
#                ORDER BY period DESC LIMIT 5""",
#             (f"%{args['company_name']}%", f"%{args['metric']}%")
#         )
#         rows = cur.fetchall()
#         conn.close()
#         if rows:
#             return {"content": [{"type": "text", "text": json.dumps([dict(r) for r in rows], default=str)}]}
#         return {"content": [{"type": "text", "text": f"No financial data found for '{args['company_name']}'"}]}
#     except Exception as e:
#         return {"content": [{"type": "text", "text": f"Financial lookup error: {str(e)}"}], "is_error": True}
#
#
# # Bundle all custom tools into an in-process MCP server
# # (No subprocess management needed — runs directly in our FastAPI process)
# prism_tools_server = create_sdk_mcp_server(
#     name="prism-tools",
#     version="1.0.0",
#     tools=[lookup_company, search_annual_reports, get_financials]
# )


import asyncio


class ClaudeAgentBMC(BMCAgent):
    """
    BMC agent using the official Claude Agent SDK (claude-agent-sdk).

    Uses:
      • query()         — for one-shot BMC generation (stateless, async)
      • ClaudeSDKClient — for multi-turn chat follow-ups (stateful, async)

    The SDK manages the full agentic loop internally: reasoning → tool use → 
    re-prompting → final response. Even without custom tools, the agent can
    self-correct malformed JSON and refine its analysis across multiple turns.

    Requires: pip install claude-agent-sdk
    Requires: ANTHROPIC_API_KEY in environment
    """

    def __init__(self):
        try:
            from claude_agent_sdk import query as _sdk_query, ClaudeAgentOptions
            self._sdk_query = _sdk_query
            self._ClaudeAgentOptions = ClaudeAgentOptions
            print("[BMC] ✓ Claude Agent SDK initialized (claude-agent-sdk)")
        except ImportError:
            raise RuntimeError(
                "claude-agent-sdk package not installed. Run: pip install claude-agent-sdk\n"
                "Note: This bundles the Claude Code CLI (~100MB). "
                "If you only need the raw API, use 'pip install anthropic' instead."
            )

    @property
    def provider_name(self) -> str:
        return "claude-agent-sdk"

    def _build_options(self, system_prompt: str = "", max_turns: int = 3) -> 'ClaudeAgentOptions':
        """Build ClaudeAgentOptions with our configuration."""
        opts = self._ClaudeAgentOptions(
            system_prompt=system_prompt or BMC_SYSTEM_PROMPT,
            max_turns=max_turns,
            # ┌─────────────────────────────────────────────────────────────┐
            # │ FUTURE: Uncomment to enable custom MCP tools               │
            # │ mcp_servers={"prism": prism_tools_server},                 │
            # │ allowed_tools=[                                            │
            # │     "mcp__prism-tools__lookup_company",                    │
            # │     "mcp__prism-tools__search_annual_reports",             │
            # │     "mcp__prism-tools__get_financials",                    │
            # │ ],                                                         │
            # └─────────────────────────────────────────────────────────────┘
        )
        return opts

    def generate(self, company: str) -> Dict[str, Any]:
        """
        Generate BMC using Claude Agent SDK with the agentic loop.
        
        The SDK's query() is async, so we bridge it to sync for our
        existing FastAPI endpoint compatibility. For streaming, use
        generate_stream() instead.
        """
        print(f"[BMC] Generating BMC for '{company}' via Claude Agent SDK (agentic loop)")
        return asyncio.get_event_loop().run_until_complete(self._async_generate(company))

    async def _async_generate(self, company: str) -> Dict[str, Any]:
        """Async implementation of BMC generation using claude_agent_sdk.query()."""
        from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage

        options = self._build_options(max_turns=3)
        prompt = BMC_USER_PROMPT_TEMPLATE.format(company=company)

        result_text = ""
        async for message in self._sdk_query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        result_text += block.text
            elif isinstance(message, ResultMessage):
                if message.total_cost_usd:
                    print(f"[BMC] Claude Agent SDK cost: ${message.total_cost_usd:.6f}")

        # Parse JSON from response
        json_text = _extract_json(result_text)
        bmc_data = json.loads(json_text)

        # Enrich with metadata
        bmc_data["company"] = company
        bmc_data["generated_at"] = datetime.utcnow().isoformat()
        bmc_data["llm_provider"] = "claude-agent-sdk"
        bmc_data["overall_confidence"] = _calc_overall_confidence(bmc_data)
        _enrich_nodes_with_block_meta(bmc_data)

        return bmc_data

    async def generate_stream(self, company: str):
        """
        Streaming BMC generation — yields SSE-compatible events as the agent works.
        
        Yields dicts with:
          {"type": "status",  "message": "Analyzing customer segments..."}
          {"type": "text",    "content": "partial text..."}
          {"type": "tool",    "name": "lookup_company", "input": {...}}
          {"type": "cost",    "usd": 0.012345}
          {"type": "result",  "data": {full BMC JSON}}
        """
        from claude_agent_sdk import AssistantMessage, TextBlock, ToolUseBlock, ResultMessage

        options = self._build_options(max_turns=3)
        prompt = BMC_USER_PROMPT_TEMPLATE.format(company=company)

        yield {"type": "status", "message": f"Starting BMC analysis for {company}..."}

        result_text = ""
        async for message in self._sdk_query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        result_text += block.text
                        yield {"type": "text", "content": block.text[:200]}
                    elif isinstance(block, ToolUseBlock):
                        yield {"type": "tool", "name": block.name, "input": block.input}
            elif isinstance(message, ResultMessage):
                if message.total_cost_usd:
                    yield {"type": "cost", "usd": message.total_cost_usd}

        # Parse and enrich
        try:
            json_text = _extract_json(result_text)
            bmc_data = json.loads(json_text)
            bmc_data["company"] = company
            bmc_data["generated_at"] = datetime.utcnow().isoformat()
            bmc_data["llm_provider"] = "claude-agent-sdk"
            bmc_data["overall_confidence"] = _calc_overall_confidence(bmc_data)
            _enrich_nodes_with_block_meta(bmc_data)
            yield {"type": "result", "data": bmc_data}
        except Exception as e:
            yield {"type": "error", "message": f"Failed to parse BMC response: {str(e)}"}

    def chat(self, company: str, node_title: str, node_context: str, question: str, history: List[Dict[str, str]] = None) -> str:
        """Answer follow-up question using ClaudeSDKClient for multi-turn context."""
        print(f"[BMC] Chat via Claude Agent SDK: {question[:50]}...")
        return asyncio.get_event_loop().run_until_complete(
            self._async_chat(company, node_title, node_context, question, history)
        )

    async def _async_chat(self, company: str, node_title: str, node_context: str, question: str, history: List[Dict[str, str]] = None) -> str:
        """Async chat implementation using ClaudeSDKClient."""
        from claude_agent_sdk import ClaudeSDKClient, AssistantMessage, TextBlock

        prompt_parts = [
            BMC_CHAT_PROMPT_TEMPLATE.format(
                company=company, node_title=node_title,
                node_context=node_context, question=question
            )
        ]
        
        if history:
            prompt_parts.append("\n\n--- PREVIOUS CONVERSATION HISTORY ---")
            for msg in history:
                prompt_parts.append(f"{msg['role'].upper()}: {msg['content']}")
            prompt_parts.append(f"USER'S CURRENT QUESTION: {question}")
            
        prompt = "\n".join(prompt_parts)
        options = self._build_options(
            system_prompt="You are a senior business strategy analyst.",
            max_turns=2,
        )

        result_text = ""
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            result_text += block.text

        return result_text or "Unable to answer this question right now. Please try again."


# ─────────────────────────────────────────────────────────────────
# GEMINI (LANGCHAIN PATTERN) IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────

class GeminiAgentBMC(BMCAgent):
    """
    BMC agent using Gemini API with agentic prompt-chaining pattern.
    Uses the existing Gemini key rotation from PRISM's infrastructure.
    No additional dependencies beyond what PRISM already uses.
    """

    def __init__(self):
        if not GEMINI_API_KEYS:
            raise RuntimeError("No Gemini API keys found in environment")
        print(f"[BMC] Gemini agent initialized with {len(GEMINI_API_KEYS)} keys")

    @property
    def provider_name(self) -> str:
        return "gemini"

    def _call_gemini(self, prompt: str, system: str, max_tokens: int = 4096, is_json: bool = True) -> Optional[str]:
        """Call Gemini API with key rotation (same pattern as rag.py)."""
        for api_key in GEMINI_API_KEYS:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
                
                gen_config = {
                    "temperature": 0.2,
                    "maxOutputTokens": max_tokens,
                    "topP": 0.9
                }
                if is_json:
                    gen_config["responseMimeType"] = "application/json"
                    
                payload = json.dumps({
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": gen_config
                }).encode("utf-8")

                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=90) as resp:
                    data = json.loads(resp.read())
                    candidates = data.get("candidates", [])
                    if candidates:
                        return candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            except urllib.error.HTTPError as e:
                print(f"[BMC] Gemini HTTP Error {e.code} for key {api_key[:10]}...")
                if e.code == 429:
                    continue
            except Exception as e:
                print(f"[BMC] Gemini call failed for key {api_key[:10]}: {e}")
                continue

        print("[BMC] All Gemini keys exhausted")
        return None

    def generate(self, company: str) -> Dict[str, Any]:
        """Generate BMC using Gemini with JSON mode."""
        print(f"[BMC] Generating BMC for '{company}' via Gemini")

        raw_text = self._call_gemini(
            prompt=BMC_USER_PROMPT_TEMPLATE.format(company=company),
            system=BMC_SYSTEM_PROMPT,
        )
        if not raw_text:
            raise RuntimeError("Failed to generate BMC: all LLM providers exhausted")

        json_text = _extract_json(raw_text)
        bmc_data = json.loads(json_text)

        # Enrich with metadata
        bmc_data["company"] = company
        bmc_data["generated_at"] = datetime.utcnow().isoformat()
        bmc_data["llm_provider"] = "gemini"
        bmc_data["overall_confidence"] = _calc_overall_confidence(bmc_data)
        _enrich_nodes_with_block_meta(bmc_data)

        return bmc_data

    def chat(self, company: str, node_title: str, node_context: str, question: str, history: List[Dict[str, str]] = None) -> str:
        """Answer follow-up question via Gemini (without JSON wrapper)."""
        prompt_parts = [
            BMC_CHAT_PROMPT_TEMPLATE.format(
                company=company, node_title=node_title,
                node_context=node_context, question=question
            )
        ]
        
        if history:
            prompt_parts.append("\n\n--- PREVIOUS CONVERSATION HISTORY ---")
            for msg in history:
                prompt_parts.append(f"{msg['role'].upper()}: {msg['content']}")
            prompt_parts.append(f"USER'S CURRENT QUESTION: {question}")
            
        prompt = "\n".join(prompt_parts)
        
        result = self._call_gemini(
            prompt=prompt, 
            system="You are a senior business strategy analyst. Provide your response in clear text/markdown format. Do not use JSON.", 
            max_tokens=2048,
            is_json=False
        )
        return result or "I'm unable to answer this question right now. Please try again."


# ─────────────────────────────────────────────────────────────────
# AGENT FACTORY
# ─────────────────────────────────────────────────────────────────

def get_bmc_agent() -> BMCAgent:
    """
    Get the appropriate BMC agent based on configuration.
    Priority: Claude Agent SDK (if key available) → Gemini fallback
    """
    provider = BMC_LLM_PROVIDER.lower()

    if provider == "claude" or (provider == "auto" and ANTHROPIC_API_KEY):
        try:
            return ClaudeAgentBMC()
        except Exception as e:
            print(f"[BMC] Claude init failed ({e}), falling back to Gemini")

    # Default: Gemini with agentic pattern
    return GeminiAgentBMC()


# ─────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> str:
    """Extract JSON from LLM response that may contain markdown fences."""
    text = text.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _calc_overall_confidence(bmc_data: Dict) -> float:
    """Calculate average confidence across all nodes."""
    nodes = bmc_data.get("nodes", [])
    if not nodes:
        return 0.0
    scores = [n.get("confidence", 0.5) for n in nodes]
    return round(sum(scores) / len(scores), 2)


def _enrich_nodes_with_block_meta(bmc_data: Dict):
    """Add icon and color metadata to each node from BMC_BLOCKS."""
    block_map = {b["id"]: b for b in BMC_BLOCKS}
    for node in bmc_data.get("nodes", []):
        block = block_map.get(node.get("id"))
        if block:
            node["icon"] = block["icon"]
            node["color"] = block["color"]


# ─────────────────────────────────────────────────────────────────
# DATABASE — PERSISTENCE (Library feature)
# ─────────────────────────────────────────────────────────────────

def _get_db_conn():
    """Get a PostgreSQL connection using existing PRISM config."""
    return psycopg2.connect(**DB_CONFIG)


def save_bmc(bmc_data: Dict[str, Any]) -> str:
    """Save a BMC analysis to the database. Returns the UUID."""
    bmc_id = str(uuid.uuid4())
    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bmc_analyses (id, company_name, bmc_data, overall_confidence, llm_provider)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            bmc_id,
            bmc_data.get("company", "Unknown"),
            json.dumps(bmc_data),
            bmc_data.get("overall_confidence", 0.0),
            bmc_data.get("llm_provider", "gemini"),
        ))
        conn.commit()
        print(f"[BMC] Saved analysis {bmc_id} for {bmc_data.get('company')}")
        return bmc_id
    finally:
        conn.close()


def load_bmc(bmc_id: str) -> Optional[Dict[str, Any]]:
    """Load a saved BMC analysis from the database."""
    conn = _get_db_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM bmc_analyses WHERE id = %s", (bmc_id,))
        row = cur.fetchone()
        if not row:
            return None
        bmc_data = row["bmc_data"]
        if isinstance(bmc_data, str):
            bmc_data = json.loads(bmc_data)
        # Inject the DB id into the bmc_data so frontend always has access to it
        bmc_data["id"] = str(row["id"])
        return {
            "id": str(row["id"]),
            "company_name": row["company_name"],
            "bmc_data": bmc_data,
            "overall_confidence": row["overall_confidence"],
            "llm_provider": row["llm_provider"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
    finally:
        conn.close()


def list_library() -> List[Dict[str, Any]]:
    """List all saved BMC analyses (for the Library tab)."""
    conn = _get_db_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, company_name, overall_confidence, llm_provider, created_at
            FROM bmc_analyses
            ORDER BY created_at DESC
            LIMIT 50
        """)
        rows = cur.fetchall()
        return [
            {
                "id": str(row["id"]),
                "company_name": row["company_name"],
                "overall_confidence": row["overall_confidence"],
                "llm_provider": row["llm_provider"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ]
    finally:
        conn.close()


def delete_bmc(bmc_id: str) -> bool:
    """Delete a saved BMC analysis."""
    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM bmc_analyses WHERE id = %s", (bmc_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────
# CHAT HISTORY PERSISTENCE
# ─────────────────────────────────────────────────────────────────

def init_chat_table():
    """Create the bmc_chat_history table if it doesn't exist."""
    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bmc_chat_history (
                id SERIAL PRIMARY KEY,
                bmc_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                messages JSONB NOT NULL DEFAULT '[]'::jsonb,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bmc_id, node_id)
            )
        """)
        conn.commit()
        print("[BMC] Chat history table initialized")
    except Exception as e:
        print(f"[BMC] Chat table init warning: {e}")
    finally:
        conn.close()


def save_chat_history(bmc_id: str, node_id: str, messages: List[Dict[str, str]]) -> None:
    """Save/update chat history for a specific BMC node."""
    if not bmc_id or not node_id:
        return
    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bmc_chat_history (bmc_id, node_id, messages, updated_at)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (bmc_id, node_id)
            DO UPDATE SET messages = %s, updated_at = CURRENT_TIMESTAMP
        """, (bmc_id, node_id, json.dumps(messages), json.dumps(messages)))
        conn.commit()
    except Exception as e:
        print(f"[BMC] Save chat history error: {e}")
    finally:
        conn.close()


def load_chat_history(bmc_id: str, node_id: str) -> List[Dict[str, str]]:
    """Load chat history for a specific BMC node."""
    if not bmc_id or not node_id:
        return []
    conn = _get_db_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT messages FROM bmc_chat_history WHERE bmc_id = %s AND node_id = %s",
            (bmc_id, node_id)
        )
        row = cur.fetchone()
        if row and row["messages"]:
            return row["messages"] if isinstance(row["messages"], list) else json.loads(row["messages"])
        return []
    except Exception as e:
        print(f"[BMC] Load chat history error: {e}")
        return []
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────────────────────────

def export_bmc_json(bmc_data: Dict) -> str:
    """Export BMC data as formatted JSON string."""
    return json.dumps(bmc_data, indent=2, ensure_ascii=False)


def export_bmc_pdf(bmc_data: Dict) -> bytes:
    """
    Export BMC data as a PDF report.
    Uses fpdf2 for lightweight PDF generation.
    """
    try:
        from fpdf import FPDF
    except ImportError:
        raise RuntimeError("fpdf2 package not installed. Run: pip install fpdf2")

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 15, f"Business Model Canvas", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, bmc_data.get("company", "Unknown Company"), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 8, f"Generated: {bmc_data.get('generated_at', 'N/A')}  |  Provider: {bmc_data.get('llm_provider', 'N/A')}  |  Confidence: {bmc_data.get('overall_confidence', 0):.0%}", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)

    # Nodes
    for node in bmc_data.get("nodes", []):
        pdf.set_font("Helvetica", "B", 13)
        title = f"{node.get('icon', '')} {node.get('title', 'Unknown')}"
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "", 10)
        summary = node.get("summary", "")
        pdf.multi_cell(0, 6, summary)
        pdf.ln(2)

        # Evidence
        evidence = node.get("evidence", [])
        if evidence:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 7, "Evidence:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 9)
            for ev in evidence:
                pdf.multi_cell(0, 5, f"  - {ev}")

        # Confidence
        conf = node.get("confidence", 0)
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 7, f"Confidence: {conf:.0%}", new_x="LMARGIN", new_y="NEXT")

        # Key Insights
        insights = node.get("key_insights", [])
        if insights:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 7, "Key Insights:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 9)
            for ins in insights:
                pdf.multi_cell(0, 5, f"  - {ins}")

        pdf.ln(4)

    return pdf.output()
