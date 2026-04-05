"""
PRISM Analyst — Pydantic Request/Response Models
===================================================
Typed schemas for all API endpoints. Zero runtime type errors.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# ENUMS
# =============================================================================

class ChunkType(str, Enum):
    TEXT = "text"
    TABLE = "table"
    CHART = "chart"


class SearchMode(str, Enum):
    HYBRID = "hybrid"
    SEMANTIC = "semantic"
    KEYWORD = "keyword"


# =============================================================================
# REQUEST MODELS
# =============================================================================

class SearchRequest(BaseModel):
    """Search request with optional filters."""
    query: str = Field(..., min_length=2, max_length=1000, description="Search query text")
    nse_code: Optional[str] = Field(None, description="Filter by company NSE code")
    chunk_type: Optional[ChunkType] = Field(None, description="Filter by chunk type")
    max_results: int = Field(10, ge=1, le=50, description="Max results to return")
    mode: SearchMode = Field(SearchMode.HYBRID, description="Search mode")


class AskRequest(BaseModel):
    """RAG Q&A request."""
    question: str = Field(..., min_length=1, max_length=2000, description="Analyst question")
    nse_code: Optional[str] = Field(None, description="Focus on specific company NSE code")
    max_context_chunks: int = Field(5, ge=1, le=20, description="Max chunks for RAG context")
    stream: bool = Field(True, description="Stream response via SSE")
    use_web_search: bool = Field(False, description="Augment RAG with live Tavily Web Search")


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class CompanyInfo(BaseModel):
    """Company with document statistics."""
    nse_code: str
    company_name: str
    sector: Optional[str] = None
    total_pages: int = 0
    total_chunks: int = 0
    embedded_chunks: int = 0
    total_blocks: int = 0


class SearchResult(BaseModel):
    """A single search result with citation."""
    chunk_id: int
    nse_code: str
    page_number: int
    chunk_type: str
    content: str
    citation_ref: str
    score: float = 0.0
    bm25_rank: Optional[int] = None
    semantic_rank: Optional[int] = None


class SearchResponse(BaseModel):
    """Search response with results and metadata."""
    query: str
    mode: str
    total_results: int
    elapsed_ms: float
    results: List[SearchResult]


class CitationDetail(BaseModel):
    """Resolved citation with full source context."""
    citation_ref: str
    nse_code: str
    company_name: str
    page_number: int
    chunk_type: str
    content: str
    pdf_filename: Optional[str] = None


class RAGCitation(BaseModel):
    """Citation referenced in a RAG answer."""
    ref: str
    nse_code: str
    page: int
    chunk_type: str
    preview: str = Field(description="First 200 chars of source content")
    url: Optional[str] = Field(None, description="External URL for Web Search citations")


class RAGResponse(BaseModel):
    """RAG answer with citations (non-streaming)."""
    question: str
    answer: str
    citations: List[RAGCitation]
    model: str
    elapsed_ms: float


class FinancialMetric(BaseModel):
    """Extracted financial metric."""
    nse_code: str
    metric_name: str
    metric_category: Optional[str] = None
    value: Optional[float] = None
    raw_value: str
    unit: Optional[str] = None
    period: Optional[str] = None
    year: Optional[int] = None
    page_number: int
    citation_ref: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    database: str
    ollama: str
    companies: int
    total_chunks: int
    embedded_chunks: int
    llm_model: str
    embedding_model: str


class ClarificationSuggestion(BaseModel):
    """A clickable company suggestion for disambiguation."""
    label: str
    nse_code: str


class FollowUpQuestion(BaseModel):
    """A follow-up question that carries the associated nse_code."""
    text: str
    nse_code: str


class ClarificationResponse(BaseModel):
    """Returned when a query is ambiguous and needs user clarification."""
    type: str = "clarification"
    message: str
    suggestions: List[ClarificationSuggestion]
    follow_up_questions: List[FollowUpQuestion]


# =============================================================================
# TOOL MODELS — Presentation Maker
# =============================================================================

class PresentationGenerateRequest(BaseModel):
    """Request to generate a presentation via the agent."""
    topic: Optional[str] = Field(None, description="Presentation topic. If None, uses chat context.")
    n_slides: int = Field(6, ge=2, le=30, description="Number of slides")
    chat_messages: Optional[List[dict]] = Field(None, description="Chat history for context-based generation")
    tone: str = Field("default", description="Tone: default, formal, casual")
    verbosity: str = Field("standard", description="Verbosity: concise, standard, detailed")
    instructions: Optional[str] = Field(None, description="Additional instructions")


class PresentationStatusResponse(BaseModel):
    """Status of an async presentation generation task."""
    task_id: str
    status: str  # pending, completed, error
    message: Optional[str] = None
    presentation_id: Optional[str] = None
    edit_url: Optional[str] = None
    download_url: Optional[str] = None
    error: Optional[str] = None


class PresentationExportRequest(BaseModel):
    """Request to export a presentation."""
    presentation_id: str
    export_as: str = Field("pptx", description="Export format: pptx or pdf")
