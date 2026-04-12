"""
PRISM Analyst — FastAPI Backend
===================================
Production-grade API for AI analyst agent with RAG pipeline.

Endpoints:
    GET  /health                    → Health check
    GET  /api/v1/companies          → List companies
    GET  /api/v1/companies/{ticker} → Company details
    POST /api/v1/search             → Hybrid search
    POST /api/v1/ask                → RAG Q&A with citations
    GET  /api/v1/citations/{ref}    → Resolve citation

Run:
    uvicorn api.main:app --reload --port 8000
    OR: python -m api.main
"""

import json
import os
import sys
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.models import (
    SearchRequest, SearchResponse, SearchResult,
    AskRequest, RAGResponse, RAGCitation,
    CompanyInfo, CitationDetail, FinancialMetric,
    HealthResponse, SearchMode,
    ClarificationResponse, ClarificationSuggestion,
    PresentationGenerateRequest, PresentationStatusResponse, PresentationExportRequest,
    BMCGenerateRequest, BMCChatRequest, BMCChatResponse, BMCResponse
)
from api.database import get_db, init_pool, close_pool, check_db_health
from api.rag import ask as rag_ask, check_ollama_health, retrieve_context, LLM_MODEL, EMBEDDING_MODEL
from api.query_router import classify_query, QueryIntent
from api.tools.presentation import (
    detect_presentation_intent,
    generate_presentation_async,
    poll_presentation_status,
    get_presentation,
    export_presentation,
    summarize_chat_for_presentation,
    get_download_url,
    get_edit_url,
    PRESENTON_BASE_URL
)
from api.tools.visualizer import (
    detect_visualizer_intent,
    chat_visualizer,
    text_visualizer,
    extract_conversation_text,
    chat_has_chartable_data,
    list_datasets as viz_list_datasets,
    match_datasets_from_context,
    get_playground_url,
    upload_files as viz_upload_files,
    delete_dataset as viz_delete_dataset,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE_MB,
)
from api.tools.bmc import (
    get_bmc_agent,
    save_bmc,
    load_bmc,
    list_library,
    delete_bmc,
    export_bmc_json,
    export_bmc_pdf,
)


# =============================================================================
# APP INITIALIZATION
# =============================================================================

app = FastAPI(
    title="PRISM Analyst API",
    description="AI-powered financial annual report analysis with citation-grounded answers",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS — allow local development + future cloud
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# =============================================================================
# LIFECYCLE
# =============================================================================

@app.on_event("startup")
async def startup():
    init_pool()


@app.on_event("shutdown")
async def shutdown():
    close_pool()


# =============================================================================
# GLOBAL ERROR HANDLER
# =============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "path": str(request.url)
        }
    )


# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Health check with DB and Ollama connectivity."""
    db_health = check_db_health()
    ollama_health = check_ollama_health()

    companies = 0
    total_chunks = 0
    embedded_chunks = 0

    if db_health["status"] == "healthy":
        try:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM master_companies")
                companies = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM document_chunks")
                total_chunks = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL")
                embedded_chunks = cur.fetchone()[0]
        except Exception:
            pass

    return HealthResponse(
        status="healthy" if db_health["status"] == "healthy" else "degraded",
        database=db_health["status"],
        ollama=ollama_health.get("status", "unknown"),
        companies=companies,
        total_chunks=total_chunks,
        embedded_chunks=embedded_chunks,
        llm_model=LLM_MODEL,
        embedding_model=EMBEDDING_MODEL
    )


# =============================================================================
# COMPANIES
# =============================================================================

@app.get("/api/v1/companies", response_model=list[CompanyInfo], tags=["Companies"])
def list_companies():
    """List all companies with document statistics."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                c.nse_code, c.company_name, c.sector,
                COALESCE(d.total_pages, 0) AS total_pages,
                COALESCE(chunk_stats.total, 0) AS total_chunks,
                COALESCE(chunk_stats.embedded, 0) AS embedded_chunks,
                COALESCE(block_stats.total, 0) AS total_blocks
            FROM master_companies c
            LEFT JOIN documents d ON d.company_id = c.company_id
            LEFT JOIN (
                SELECT nse_code,
                       COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                FROM document_chunks GROUP BY nse_code
            ) chunk_stats ON chunk_stats.nse_code = c.nse_code
            LEFT JOIN (
                SELECT c2.nse_code, COUNT(*) AS total
                FROM content_blocks cb
                JOIN pages p ON p.page_id = cb.page_id
                JOIN documents d2 ON d2.document_id = p.document_id
                JOIN master_companies c2 ON c2.company_id = d2.company_id
                GROUP BY c2.nse_code
            ) block_stats ON block_stats.nse_code = c.nse_code
            ORDER BY c.nse_code
        """)

        results = []
        for row in cur.fetchall():
            results.append(CompanyInfo(
                nse_code=row[0], company_name=row[1], sector=row[2],
                total_pages=row[3], total_chunks=row[4],
                embedded_chunks=row[5], total_blocks=row[6]
            ))
        return results


@app.get("/api/v1/companies/{ticker}", response_model=CompanyInfo, tags=["Companies"])
def get_company(ticker: str):
    """Get a specific company's details."""
    companies = list_companies()
    for c in companies:
        if c.nse_code.upper() == ticker.upper():
            return c
    raise HTTPException(status_code=404, detail=f"Company '{ticker}' not found")


# =============================================================================
# SEARCH
# =============================================================================

@app.post("/api/v1/search", response_model=SearchResponse, tags=["Search"])
def search(req: SearchRequest):
    """Search across annual report chunks (hybrid, semantic, or keyword)."""
    start = time.time()

    with get_db() as conn:
        chunks = retrieve_context(
            conn,
            req.query,
            company_ticker=req.nse_code,
            max_chunks=req.max_results
        )

    elapsed = (time.time() - start) * 1000

    results = []
    for chunk in chunks:
        results.append(SearchResult(
            chunk_id=chunk.get("chunk_id", 0),
            nse_code=chunk.get("nse_code", "?"),
            page_number=chunk.get("page_number", 0),
            chunk_type=chunk.get("chunk_type", "text"),
            content=chunk.get("content", ""),
            citation_ref=chunk.get("citation_ref", ""),
            score=float(chunk.get("rrf_score", chunk.get("relevance", chunk.get("similarity", 0))) or 0),
            bm25_rank=chunk.get("bm25_rank"),
            semantic_rank=chunk.get("semantic_rank")
        ))

    return SearchResponse(
        query=req.query,
        mode=req.mode.value,
        total_results=len(results),
        elapsed_ms=round(elapsed, 2),
        results=results
    )


# =============================================================================
# RAG Q&A
# =============================================================================

@app.post("/api/v1/ask", tags=["RAG"])
def ask_question(req: AskRequest):
    """
    Ask a question about company annual reports.
    Routes through intent classification first:
    - COMPANY_SPECIFIC → direct RAG with that company
    - COMPARISON → multi-company RAG
    - AMBIGUOUS → return clarification suggestions
    """
    print(f"\n[ASK] Question: '{req.question}' | nse_code: '{req.nse_code}' | stream: {req.stream} | dataset_ids: {req.dataset_ids}")

    # ══════════════════════════════════════════════════════════════════
    # PRIORITY 0: If dataset_ids are present, route EVERYTHING through DataViz
    # This handles all file-upload scenarios — chart, query, clarify
    # ══════════════════════════════════════════════════════════════════
    if req.dataset_ids and len(req.dataset_ids) > 0:
        print(f"[ASK] Dataset IDs present ({req.dataset_ids}) — routing through DataViz API")

        if req.stream:
            def dataset_viz_stream():
                import time
                topic = req.question
                yield f"event: viz_status\ndata: {json.dumps('Processing your data question...')}\n\n"
                time.sleep(0.2)
                yield f"event: viz_status\ndata: {json.dumps('Querying uploaded datasets...')}\n\n"

                viz_result = chat_visualizer(req.question, req.dataset_ids)
                intent = viz_result.get("intent", "query")
                print(f"[ASK/DATASET] DataViz response intent: {intent}")

                if intent == "chart" and viz_result.get("chart"):
                    # Chart response → open in Agent Panel (two-phase: generating → ready)
                    # Phase 1: Init agent panel
                    init_data = json.dumps({
                        "tool": "visualizer",
                        "status": "generating",
                        "topic": topic,
                        "chart_type_hint": viz_result.get("chart_type", "bar"),
                    })
                    yield f"event: tool_call\ndata: {init_data}\n\n"
                    yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                    time.sleep(0.3)
                    final_data = json.dumps({
                        "tool": "visualizer",
                        "status": "ready",
                        "topic": topic,
                        "chart_type_hint": viz_result.get("chart_type", "bar"),
                        "viz_intent": "chart",
                        "viz_message": viz_result.get("message", ""),
                        "chart": viz_result.get("chart"),
                        "chart_type": viz_result.get("chart_type"),
                        "chart_config": viz_result.get("chart_config"),
                        "analysis": viz_result.get("analysis"),
                        "data": viz_result.get("data"),
                        "datasets_used": viz_result.get("datasets_used", req.dataset_ids),
                        "playground_url": get_playground_url(),
                    })
                    yield f"event: tool_call\ndata: {final_data}\n\n"
                elif intent == "clarify":
                    # Clarification needed (e.g. pick a dataset column)
                    msg = viz_result.get("message", "Could you clarify your question?")
                    options = viz_result.get("options", [])
                    if options:
                        msg += "\n\n**Available options:**\n"
                        for opt in options:
                            if isinstance(opt, dict):
                                msg += f"- {opt.get('filename', opt.get('dataset_id', '?'))}\n"
                            else:
                                msg += f"- {opt}\n"
                    yield f"event: token\ndata: {json.dumps(msg)}\n\n"
                elif intent == "error":
                    err_msg = viz_result.get("message", "Something went wrong while analyzing your data.")
                    yield f"event: token\ndata: {json.dumps(err_msg)}\n\n"
                else:
                    # Query response — return as text (may include data table)
                    msg = viz_result.get("message", "")
                    data = viz_result.get("data")
                    if data and isinstance(data, list) and len(data) > 0:
                        # Format tabular data as markdown table
                        headers = list(data[0].keys())
                        table = "\n\n| " + " | ".join(headers) + " |\n"
                        table += "| " + " | ".join(["---"] * len(headers)) + " |\n"
                        for row in data[:50]:  # cap at 50 rows
                            table += "| " + " | ".join([str(row.get(h, "")) for h in headers]) + " |\n"
                        msg += table
                    elif data and isinstance(data, dict):
                        msg += "\n\n```json\n" + json.dumps(data, indent=2) + "\n```"
                    yield f"event: token\ndata: {json.dumps(msg)}\n\n"

                yield f"event: done\ndata: {json.dumps({'model_used': 'PRISM Data Agent'})}\n\n"

            return StreamingResponse(
                dataset_viz_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
            )
        else:
            viz_result = chat_visualizer(req.question, req.dataset_ids)
            return JSONResponse(content=viz_result)

    # ── Tool-Use Intent Detection (before RAG) ──
    # 1. Check presentation intent
    tool_intent = detect_presentation_intent(req.question)
    
    # 2. Check visualizer intent (only if not a presentation request)
    if not tool_intent:
        viz_intent = detect_visualizer_intent(req.question)
        if viz_intent and req.stream:
            # ── Streaming Visualizer Flow (with progress steps) ──
            print(f"[ASK] Visualizer intent detected (streaming): {viz_intent}")

            def viz_progress_stream():
                chart_type_hint = viz_intent.get("chart_type_hint", "chart")
                topic = viz_intent.get("topic", "")

                # Step 1: Open panel in generating state
                init_data = json.dumps({
                    "tool": "visualizer",
                    "status": "generating",
                    "topic": topic,
                    "chart_type_hint": chart_type_hint,
                })
                yield f"event: tool_call\ndata: {init_data}\n\n"

                # Step 2: Analyzing query
                yield f"event: viz_status\ndata: {json.dumps('Analyzing chart request...')}\n\n"
                import time; time.sleep(0.3)

                # Step 3: Match datasets
                yield f"event: viz_status\ndata: {json.dumps('Searching for matching datasets...')}\n\n"
                context_hint = req.nse_code or None
                dataset_ids = match_datasets_from_context(
                    conversation_context=req.question,
                    nse_code=context_hint
                )

                if dataset_ids is None:
                    all_datasets = viz_list_datasets()

                    # ── Helper: Run RAG-to-Chart pipeline (compound query) ──
                    def _try_rag_then_chart():
                        """
                        For compound queries like 'What is Infosys revenue? chart it'
                        in a single message — run RAG first to get data, then chart.
                        """
                        # Strip chart keywords to extract the data question
                        import re as _re
                        data_question = _re.sub(
                            r'(?:please\s+)?(?:plot|chart|graph|visuali[sz]e|draw|show|create|make|generate|build)'
                            r'(?:\s+(?:a|an|the|this|that|me|it))?'
                            r'(?:\s+(?:bar|line|pie|scatter|area|histogram|heatmap|donut|funnel|waterfall|treemap|bubble|radar|chart|graph|plot|visualization))*'
                            r'(?:\s+(?:of|for|from|on|with|using|about))?'
                            r'(?:\s+(?:this|that|the|above|my|it|data|information|numbers|results|data))?'
                            r'(?:\s*(?:please|pls))?',
                            '', req.question, flags=_re.IGNORECASE
                        ).strip()
                        
                        # Force RAG to return structured data
                        table_prompt = f"{data_question}. Provide the raw data ONLY in a markdown table format without conversational padding."
                        
                        # If after stripping chart words, we still have a real question
                        if len(data_question) > 5:
                            from api.database import get_db
                            from api.rag import ask as rag_ask
                            try:
                                with get_db() as conn:
                                    rag_answer, rag_citations, _ = rag_ask(
                                        conn, table_prompt,
                                        company_ticker=req.nse_code or None,
                                        max_chunks=max(3, req.max_context_chunks),
                                        stream=False,
                                        use_web_search=req.use_web_search
                                    )
                                if rag_answer and len(rag_answer) > 20:
                                    return rag_answer
                            except Exception as e:
                                print(f"[VIZ] RAG-to-Chart query failed: {e}")
                        return None

                    # ── Determine if we have chartable data in chat history ──
                    has_prior_data = req.chat_history and chat_has_chartable_data(req.chat_history)

                    if not all_datasets:
                        # ── /api/text FALLBACK: extract data from conversation ──
                        if has_prior_data:
                            yield f"event: viz_status\ndata: {json.dumps('Extracting data from conversation...')}\n\n"
                            conv_text = extract_conversation_text(req.chat_history)
                            if conv_text.strip():
                                yield f"event: viz_status\ndata: {json.dumps('Generating chart from conversation data...')}\n\n"
                                viz_result = text_visualizer(conv_text, viz_intent["message"])

                                if viz_result.get("intent") != "error":
                                    yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                                    time.sleep(0.2)
                                    final_data = json.dumps({
                                        "tool": "visualizer",
                                        "status": "ready",
                                        "topic": topic,
                                        "chart_type_hint": chart_type_hint,
                                        "viz_intent": viz_result.get("intent", "chart"),
                                        "viz_message": viz_result.get("message", ""),
                                        "chart": viz_result.get("chart"),
                                        "chart_type": viz_result.get("chart_type"),
                                        "chart_config": viz_result.get("chart_config"),
                                        "analysis": viz_result.get("analysis"),
                                        "data": viz_result.get("data"),
                                        "datasets_used": [],
                                        "playground_url": get_playground_url(),
                                    })
                                    yield f"event: tool_call\ndata: {final_data}\n\n"
                                    yield "event: done\ndata: {}\n\n"
                                    return

                        # ── RAG-TO-CHART: Compound query ──
                        yield f"event: viz_status\ndata: {json.dumps('Searching knowledge base for data...')}\n\n"
                        rag_data = _try_rag_then_chart()
                        if rag_data:
                            yield f"event: viz_status\ndata: {json.dumps('Data retrieved — generating chart...')}\n\n"
                            viz_result = text_visualizer(rag_data, viz_intent["message"])
                            if viz_result.get("intent") != "error":
                                yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                                time.sleep(0.2)
                                
                                # Append RAG data context for the UI
                                augmented_message = viz_result.get("message", "")
                                augmented_message += f"\n\n**Data retrieved from knowledge base:**\n\n{rag_data}"                                
                                
                                final_data = json.dumps({
                                    "tool": "visualizer",
                                    "status": "ready",
                                    "topic": topic,
                                    "chart_type_hint": chart_type_hint,
                                    "viz_intent": viz_result.get("intent", "chart"),
                                    "viz_message": augmented_message,
                                    "chart": viz_result.get("chart"),
                                    "chart_type": viz_result.get("chart_type"),
                                    "chart_config": viz_result.get("chart_config"),
                                    "analysis": viz_result.get("analysis"),
                                    "data": viz_result.get("data"),
                                    "datasets_used": [],
                                    "playground_url": get_playground_url(),
                                })
                                yield f"event: tool_call\ndata: {final_data}\n\n"
                                yield "event: done\ndata: {}\n\n"
                                return

                        # No chat history and no datasets — show upload prompt
                        yield f"event: viz_status\ndata: {json.dumps('No datasets found')}\n\n"
                        clarify_msg = "📊 I'd love to create that visualization! However, no datasets are currently uploaded to the Data Playground and there's no data in our conversation to chart. Please either:\n\n1. Ask me a data question first (e.g., 'What is Infosys revenue?'), then say 'chart that'\n2. Upload a CSV or Excel file via the Data Playground"
                        error_data = json.dumps({"tool": "visualizer", "status": "error", "error": clarify_msg})
                        yield f"event: tool_call\ndata: {error_data}\n\n"
                        yield "event: done\ndata: {}\n\n"
                        return
                    else:
                        # ── Multiple datasets exist but couldn't auto-match ──
                        # Try /api/text with conversation data if available
                        if has_prior_data:
                            conv_text = extract_conversation_text(req.chat_history)
                            if conv_text.strip():
                                yield f"event: viz_status\ndata: {json.dumps('Using conversation data for chart...')}\n\n"
                                viz_result = text_visualizer(conv_text, viz_intent["message"])
                                if viz_result.get("intent") != "error":
                                    yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                                    time.sleep(0.2)
                                    final_data = json.dumps({
                                        "tool": "visualizer",
                                        "status": "ready",
                                        "topic": topic,
                                        "chart_type_hint": chart_type_hint,
                                        "viz_intent": viz_result.get("intent", "chart"),
                                        "viz_message": viz_result.get("message", ""),
                                        "chart": viz_result.get("chart"),
                                        "chart_type": viz_result.get("chart_type"),
                                        "chart_config": viz_result.get("chart_config"),
                                        "analysis": viz_result.get("analysis"),
                                        "data": viz_result.get("data"),
                                        "datasets_used": [],
                                        "playground_url": get_playground_url(),
                                    })
                                    yield f"event: tool_call\ndata: {final_data}\n\n"
                                    yield "event: done\ndata: {}\n\n"
                                    return
                        # Try RAG-to-chart compound query
                        yield f"event: viz_status\ndata: {json.dumps('Searching knowledge base for data...')}\n\n"
                        rag_data = _try_rag_then_chart()
                        if rag_data:
                            yield f"event: viz_status\ndata: {json.dumps('Data retrieved — generating chart...')}\n\n"
                            viz_result = text_visualizer(rag_data, viz_intent["message"])
                            if viz_result.get("intent") != "error":
                                yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                                time.sleep(0.2)
                                
                                # Append RAG data context for the UI
                                augmented_message = viz_result.get("message", "")
                                augmented_message += f"\n\n**Data retrieved from knowledge base:**\n\n{rag_data}"
                                
                                final_data = json.dumps({
                                    "tool": "visualizer",
                                    "status": "ready",
                                    "topic": topic,
                                    "chart_type_hint": chart_type_hint,
                                    "viz_intent": viz_result.get("intent", "chart"),
                                    "viz_message": augmented_message,
                                    "chart": viz_result.get("chart"),
                                    "chart_type": viz_result.get("chart_type"),
                                    "chart_config": viz_result.get("chart_config"),
                                    "analysis": viz_result.get("analysis"),
                                    "data": viz_result.get("data"),
                                    "datasets_used": [],
                                    "playground_url": get_playground_url(),
                                })
                                yield f"event: tool_call\ndata: {final_data}\n\n"
                                yield "event: done\ndata: {}\n\n"
                                return

                        # Ask for dataset clarification
                        ds_list = "\\n".join([f"- **{ds.get('filename', 'Unknown')}** ({ds.get('row_count', '?')} rows)" for ds in all_datasets])
                        clarify_msg = f"📊 I can create that visualization! But I'm not sure which dataset to use. Here are the datasets available in the Data Playground:\\n\\n{ds_list}\\n\\nPlease specify which dataset you'd like me to visualize, or mention a company name so I can match it automatically."
                        error_data = json.dumps({"tool": "visualizer", "status": "error", "error": clarify_msg})
                        yield f"event: tool_call\ndata: {error_data}\n\n"
                        yield "event: done\ndata: {}\n\n"
                        return

                yield f"event: viz_status\ndata: {json.dumps('Datasets matched successfully')}\n\n"
                time.sleep(0.2)

                # Step 4: Call Data Viz API
                yield f"event: viz_status\ndata: {json.dumps('Generating chart from data...')}\n\n"
                viz_result = chat_visualizer(viz_intent["message"], dataset_ids)

                # Step 5: Processing result
                yield f"event: viz_status\ndata: {json.dumps('Rendering visualization...')}\n\n"
                time.sleep(0.2)

                # Step 6: Send final chart data
                final_data = json.dumps({
                    "tool": "visualizer",
                    "status": "ready",
                    "topic": topic,
                    "chart_type_hint": chart_type_hint,
                    "viz_intent": viz_result.get("intent", "chart"),
                    "viz_message": viz_result.get("message", ""),
                    "chart": viz_result.get("chart"),
                    "chart_type": viz_result.get("chart_type"),
                    "chart_config": viz_result.get("chart_config"),
                    "analysis": viz_result.get("analysis"),
                    "data": viz_result.get("data"),
                    "datasets_used": viz_result.get("datasets_used", []),
                    "playground_url": get_playground_url(),
                })
                yield f"event: tool_call\ndata: {final_data}\n\n"
                yield "event: done\ndata: {}\n\n"

            return StreamingResponse(
                viz_progress_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
            )

        elif viz_intent and not req.stream:
            # Non-streaming fallback (direct JSON)
            context_hint = req.nse_code or None
            dataset_ids = match_datasets_from_context(conversation_context=req.question, nse_code=context_hint)
            if dataset_ids is None:
                all_datasets = viz_list_datasets()
                if not all_datasets:
                    return JSONResponse(content={"answer": "📊 No datasets uploaded. Please upload data first."})
                ds_list = "\n".join([f"- {ds.get('filename', '?')} ({ds.get('row_count', '?')} rows)" for ds in all_datasets])
                return JSONResponse(content={"answer": f"📊 Which dataset? Available:\n\n{ds_list}"})
            viz_result = chat_visualizer(viz_intent["message"], dataset_ids)
            tool_intent = {
                "tool": "visualizer", "status": "ready",
                "topic": viz_intent.get("topic", ""),
                "viz_intent": viz_result.get("intent", "chart"),
                "viz_message": viz_result.get("message", ""),
                "chart": viz_result.get("chart"),
                "chart_type": viz_result.get("chart_type"),
                "datasets_used": viz_result.get("datasets_used", []),
                "playground_url": get_playground_url(),
            }

    if tool_intent:
        print(f"[ASK] Tool intent detected: {tool_intent.get('tool')}")
        if req.stream:
            tool_data = json.dumps(tool_intent)
            def tool_event_stream():
                yield f"event: tool_call\ndata: {tool_data}\n\n"
                yield "event: done\ndata: {}\n\n"
            return StreamingResponse(
                tool_event_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
            )
        else:
            return JSONResponse(content={"type": "tool_call", **tool_intent})

    with get_db() as conn:
        # Step 1: Classify intent
        classification = classify_query(conn, req.question, req.nse_code)
        print(f"[ASK] Classification: intent={classification.intent}, companies={classification.companies}")

        # Step 2: Handle ambiguous queries — return clarification
        if classification.intent == QueryIntent.AMBIGUOUS:
            follow_ups_serialized = [
                {"text": q["text"], "nse_code": q["nse_code"]} if isinstance(q, dict) else q
                for q in classification.follow_up_questions
            ]
            return JSONResponse(content={
                "type": "clarification",
                "message": classification.clarification_message,
                "suggestions": classification.suggestions,
                "follow_up_questions": follow_ups_serialized
            })


        # Step 3: Determine target company/companies
        target_company = None
        if classification.intent == QueryIntent.COMPANY_SPECIFIC:
            target_company = classification.companies[0] if classification.companies else req.nse_code
        elif classification.intent == QueryIntent.GENERAL:
            from api.rag import _call_gemini_stream, _call_openrouter_stream, _call_ollama_stream
            
            general_sys = "You are PRISM, a highly conversational, friendly, and helpful financial AI assistant. The user is just chatting playfully or saying hello. Respond briefly and cheerfully, offering to help them analyze company filings, financial metrics, or stock data."
            
            if req.stream:
                def orchestrate_general_stream():
                    yield {"type": "status", "text": "Formulating response..."}
                    gen = _call_gemini_stream(req.question, general_sys)
                    if gen is not None:
                        yield from gen
                        return
                    
                    yield {"type": "status", "text": "Routing to OpenRouter fallback..."}
                    gen = _call_openrouter_stream(req.question, general_sys)
                    if gen is not None:
                        yield from gen
                        return
                        
                    yield {"type": "status", "text": "Initializing local edge models..."}
                    gen = _call_ollama_stream(req.question, general_sys)
                    if gen is not None:
                        yield from gen
                    else:
                        yield "⚠️ Error: All language models (Gemini, OpenRouter, Ollama) failed."

                general_gen = orchestrate_general_stream()
                def event_stream_general():
                    yield "event: citations\ndata: []\n\n"
                    for item in general_gen:
                        if isinstance(item, dict) and item.get("type") == "status":
                            yield f"event: status\ndata: {json.dumps(item['text'])}\n\n"
                        else:
                            escaped = json.dumps(item)
                            yield f"event: token\ndata: {escaped}\n\n"
                    yield "event: done\ndata: {}\n\n"
                
                return StreamingResponse(
                    event_stream_general(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
                )
            else:
                from api.rag import _call_gemini_generate, _call_openrouter_generate
                import time as _t
                _start = _t.time()
                answer = _call_gemini_generate(req.question, SYSTEM_PROMPT)
                if answer is None: answer = _call_openrouter_generate(req.question, SYSTEM_PROMPT)
                elapsed = (_t.time() - _start) * 1000
                return RAGResponse(
                    question=req.question, answer=answer, citations=[], model="gemini-2.0-flash", elapsed_ms=round(elapsed, 2)
                )

        elif classification.intent == QueryIntent.COMPARISON:
            # For comparison: retrieve per-company, merge results
            target_company = None  # Will handle below

        # Step 4: Run RAG pipeline
        # For COMPARISON: retrieve from each company separately, merge
        if classification.intent == QueryIntent.COMPARISON and len(classification.companies) >= 2:
            from api.rag import retrieve_context, retrieve_structured_metrics, build_rag_context, detect_query_type
            from api.rag import _build_user_prompt, SYSTEM_PROMPT as SYS
            from api.rag import _call_gemini_stream, _call_openrouter_stream, _call_ollama_stream
            from api.rag import _fetch_tavily_results, _call_gemini_generate, _call_openrouter_generate

            if req.stream:
                def event_stream_compare():
                    # Phase 1: Retrieval — runs inside the generator so status events flow immediately
                    companies_str = " vs ".join(classification.companies)
                    yield f"event: status\ndata: {json.dumps(f'Retrieving data for {companies_str}...')}\n\n"

                    query_type = detect_query_type(req.question)
                    all_chunks = []
                    all_metrics = []
                    for i, comp in enumerate(classification.companies):
                        yield f"event: status\ndata: {json.dumps(f'Searching {comp} filings ({i+1}/{len(classification.companies)})...')}\n\n"
                        chunks = retrieve_context(
                            conn, req.question, comp,
                            max_chunks=req.max_context_chunks // len(classification.companies) + 1,
                            prefer_tables=(query_type == "quantitative")
                        )
                        all_chunks.extend(chunks)
                        if query_type == "quantitative":
                            metrics = retrieve_structured_metrics(conn, req.question, comp)
                            all_metrics.extend(metrics)

                    yield f"event: status\ndata: {json.dumps('Building analysis context...')}\n\n"
                    context, citations = build_rag_context(all_chunks, all_metrics if all_metrics else None)

                    if req.use_web_search:
                        yield f"event: status\ndata: {json.dumps('Augmenting with web search...')}\n\n"
                        web_results = _fetch_tavily_results(req.question)
                        if web_results:
                            context += "\n\nCONTEXT FROM LIVE WEB SEARCH:\n"
                            for w in web_results:
                                context += f"\n- [{w['ref']}] {w['preview']}"
                                citations.append(w)

                    # Send citations
                    citation_data = json.dumps([c for c in citations])
                    yield f"event: citations\ndata: {citation_data}\n\n"

                    if not context:
                        yield f"event: token\ndata: {json.dumps('I could not find sufficient data in the uploaded documents for this comparison.')}\n\n"
                        yield "event: done\ndata: {}\n\n"
                        return

                    prompt = _build_user_prompt(req.question, context)

                    # Phase 2: LLM generation with orchestrated fallback
                    yield f"event: status\ndata: {json.dumps('Querying primary Gemini cognitive engine...')}\n\n"
                    gen = _call_gemini_stream(prompt, SYS)
                    if gen is not None:
                        for token in gen:
                            yield f"event: token\ndata: {json.dumps(token)}\n\n"
                        yield "event: done\ndata: {}\n\n"
                        return

                    yield f"event: status\ndata: {json.dumps('Gemini rate limits active. Rerouting to OpenRouter fallback...')}\n\n"
                    gen = _call_openrouter_stream(prompt, SYS)
                    if gen is not None:
                        for token in gen:
                            yield f"event: token\ndata: {json.dumps(token)}\n\n"
                        yield "event: done\ndata: {}\n\n"
                        return

                    yield f"event: status\ndata: {json.dumps('Cloud models exhausted. Initializing local Ollama edge inference...')}\n\n"
                    gen = _call_ollama_stream(prompt, SYS)
                    if gen is not None:
                        for token in gen:
                            yield f"event: token\ndata: {json.dumps(token)}\n\n"
                    else:
                        yield f"event: token\ndata: {json.dumps('⚠️ Error: All language models failed. Please try again when Cloud rate-limits reset.')}\n\n"
                    yield "event: done\ndata: {}\n\n"

                return StreamingResponse(
                    event_stream_compare(),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
                )
            else:
                query_type = detect_query_type(req.question)
                all_chunks = []
                all_metrics = []
                for comp in classification.companies:
                    chunks = retrieve_context(
                        conn, req.question, comp,
                        max_chunks=req.max_context_chunks // len(classification.companies) + 1,
                        prefer_tables=(query_type == "quantitative")
                    )
                    all_chunks.extend(chunks)
                    if query_type == "quantitative":
                        metrics = retrieve_structured_metrics(conn, req.question, comp)
                        all_metrics.extend(metrics)
                context, citations = build_rag_context(all_chunks, all_metrics if all_metrics else None)
                prompt = _build_user_prompt(req.question, context)
                import time as _t
                _start = _t.time()
                answer = _call_gemini_generate(prompt, SYS)
                if answer is None:
                    answer = _call_openrouter_generate(prompt, SYS)
                if answer is None:
                    answer = "".join(_call_ollama_stream(prompt, SYS))
                elapsed = (_t.time() - _start) * 1000
                return RAGResponse(question=req.question, answer=answer, citations=[RAGCitation(**c) for c in citations], model=LLM_MODEL, elapsed_ms=round(elapsed, 2))

        if req.stream:
            # === STREAMING SSE — entire pipeline runs INSIDE the generator ===
            # This ensures status events reach the browser IMMEDIATELY
            # instead of blocking until retrieval + LLM fallback completes.
            def event_stream_rag():
                # Phase 1: Retrieval (yields status events as it works)
                yield f"event: status\ndata: {json.dumps('Searching knowledge base...')}\n\n"
                
                generator, citations = rag_ask(
                    conn, req.question,
                    company_ticker=target_company,
                    max_chunks=req.max_context_chunks,
                    stream=True,
                    use_web_search=req.use_web_search
                )

                # Send citations
                citation_data = json.dumps([c for c in citations])
                yield f"event: citations\ndata: {citation_data}\n\n"

                # Phase 2: Stream LLM tokens + status
                for item in generator:
                    if isinstance(item, dict) and item.get("type") == "status":
                        yield f"event: status\ndata: {json.dumps(item['text'])}\n\n"
                    else:
                        escaped = json.dumps(item)
                        yield f"event: token\ndata: {escaped}\n\n"
                yield "event: done\ndata: {}\n\n"

            return StreamingResponse(
                event_stream_rag(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            # Non-streaming response
            answer, citations, elapsed = rag_ask(
                conn, req.question,
                company_ticker=target_company,
                max_chunks=req.max_context_chunks,
                stream=False,
                use_web_search=req.use_web_search
            )

            return RAGResponse(
                question=req.question,
                answer=answer,
                citations=[RAGCitation(**c) for c in citations],
                model=LLM_MODEL,
                elapsed_ms=round(elapsed, 2)
            )


# =============================================================================
# CITATION RESOLVER
# =============================================================================

@app.get("/api/v1/citations/{citation_ref:path}", response_model=CitationDetail, tags=["Citations"])
def resolve_citation(citation_ref: str):
    """Resolve a citation reference to its source content."""
    with get_db() as conn:
        cur = conn.cursor()

        # Try document_chunks first
        cur.execute("""
            SELECT
                dc.citation_ref, dc.nse_code, c.company_name,
                dc.page_number, dc.chunk_type,
                dc.content, d.source_filename
            FROM document_chunks dc
            JOIN documents d ON d.document_id = dc.document_id
            JOIN master_companies c ON c.company_id = d.company_id
            WHERE dc.citation_ref = %s
            LIMIT 1
        """, (citation_ref,))

        row = cur.fetchone()
        if not row:
            # Try content_blocks
            cur.execute("""
                SELECT
                    cb.citation_ref, co.nse_code, co.company_name,
                    p.page_number, cb.block_type,
                    cb.content, d.source_filename
                FROM content_blocks cb
                JOIN pages p ON p.page_id = cb.page_id
                JOIN documents d ON d.document_id = p.document_id
                JOIN master_companies co ON co.company_id = d.company_id
                WHERE cb.citation_ref = %s
                LIMIT 1
            """, (citation_ref,))
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Citation '{citation_ref}' not found")

        return CitationDetail(
            citation_ref=row[0],
            nse_code=row[1],
            company_name=row[2],
            page_number=row[3],
            chunk_type=row[4],
            content=row[5],
            pdf_filename=row[6]
        )


# =============================================================================
# FINANCIAL METRICS (from content_blocks tables)
# =============================================================================

@app.get("/api/v1/financials/{ticker}", response_model=list[FinancialMetric], tags=["Financials"])
def get_financials(
    ticker: str,
    category: str = Query(None, description="Filter by category: Income Statement, Balance Sheet, Cash Flow, Per Share, Ratios"),
    limit: int = Query(100, ge=1, le=500)
):
    """Get extracted structured financial metrics for a company."""
    with get_db() as conn:
        cur = conn.cursor()

        if category:
            cur.execute("""
                SELECT nse_code, metric_name, metric_category, value, raw_value,
                       unit, period, year, page_number, citation_ref
                FROM financial_metrics
                WHERE nse_code = %s AND metric_category = %s
                ORDER BY metric_name, year DESC
                LIMIT %s
            """, (ticker.upper(), category, limit))
        else:
            cur.execute("""
                SELECT nse_code, metric_name, metric_category, value, raw_value,
                       unit, period, year, page_number, citation_ref
                FROM financial_metrics
                WHERE nse_code = %s
                ORDER BY metric_category, metric_name, year DESC
                LIMIT %s
            """, (ticker.upper(), limit))

        results = []
        for row in cur.fetchall():
            results.append(FinancialMetric(
                nse_code=row[0],
                metric_name=row[1],
                metric_category=row[2],
                value=float(row[3]) if row[3] is not None else None,
                raw_value=row[4],
                unit=row[5],
                period=row[6],
                year=row[7],
                page_number=row[8],
                citation_ref=row[9]
            ))

        if not results:
            raise HTTPException(status_code=404, detail=f"No financial data for '{ticker}'")

        return results


# =============================================================================
# TOOL ROUTES — Presentation Maker
# =============================================================================

@app.post("/api/v1/tools/presentation/generate")
async def tool_generate_presentation(req: PresentationGenerateRequest):
    """Trigger async presentation generation via Presenton."""
    # Build content from either topic or chat context
    content = req.topic or ""
    if req.chat_messages:
        content = summarize_chat_for_presentation(req.chat_messages, topic_hint=req.topic)
    
    if not content.strip():
        raise HTTPException(status_code=400, detail="Either topic or chat_messages must be provided")
    
    try:
        result = generate_presentation_async(
            content=content,
            n_slides=req.n_slides,
            tone=req.tone,
            verbosity=req.verbosity,
            instructions=req.instructions,
        )
        return {
            "task_id": result.get("id", ""),
            "status": result.get("status", "pending"),
            "message": result.get("message", "Queued for generation"),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Presenton API error: {str(e)}")


@app.get("/api/v1/tools/presentation/status/{task_id}")
async def tool_presentation_status(task_id: str):
    """Poll async presentation generation status."""
    try:
        result = poll_presentation_status(task_id)
        response = {
            "task_id": task_id,
            "status": result.get("status", "pending"),
            "message": result.get("message", ""),
        }
        
        if result.get("status") == "completed" and result.get("data"):
            data = result["data"]
            response["presentation_id"] = data.get("presentation_id", "")
            response["edit_url"] = get_edit_url(data.get("edit_path", ""))
            response["download_url"] = get_download_url(data.get("path", ""))
        
        if result.get("status") == "error":
            response["error"] = result.get("error", "Unknown error")
        
        return response
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Presenton API error: {str(e)}")


@app.get("/api/v1/tools/presentation/{presentation_id}")
async def tool_get_presentation(presentation_id: str):
    """Get a full presentation with all slides."""
    try:
        return get_presentation(presentation_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Presenton API error: {str(e)}")


@app.post("/api/v1/tools/presentation/export")
async def tool_export_presentation(req: PresentationExportRequest):
    """Export a presentation as PPTX or PDF."""
    try:
        result = export_presentation(req.presentation_id, req.export_as)
        return {
            "presentation_id": result.get("presentation_id", req.presentation_id),
            "download_url": get_download_url(result.get("path", "")),
            "edit_url": get_edit_url(result.get("edit_path", "")),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Presenton API error: {str(e)}")


# =============================================================================
# DATA VISUALIZER ENDPOINTS
# =============================================================================

from pydantic import BaseModel as _VizBase

class VisualizerChatRequest(_VizBase):
    message: str
    dataset_ids: Optional[list] = None


@app.get("/api/v1/datasets")
async def get_viz_datasets():
    """List all uploaded datasets from the Data Visualization API."""
    datasets = viz_list_datasets()
    return datasets


@app.post("/api/v1/visualize")
async def visualize_data(req: VisualizerChatRequest):
    """
    Proxy endpoint: Send a natural language message to the Data Viz API.
    Returns chart JSON (Plotly), analysis, or clarification.
    """
    result = chat_visualizer(req.message, req.dataset_ids)
    result["playground_url"] = get_playground_url()
    return result


@app.post("/api/v1/upload", tags=["Data Visualizer"])
async def upload_data_files(files: list[UploadFile] = File(...)):
    """
    Upload CSV/Excel/JSON/MD/HTML/TXT files for data visualization.
    Proxies to the DataViz API and returns dataset_ids for future queries.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Validate files before proxying
    file_tuples = []
    errors = []
    for f in files:
        # Extension check
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            errors.append(f"{f.filename}: Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
            continue

        # Read bytes
        content = await f.read()

        # Size check
        size_mb = len(content) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            errors.append(f"{f.filename}: File too large ({size_mb:.1f}MB). Max: {MAX_FILE_SIZE_MB}MB")
            continue

        file_tuples.append((f.filename, content, f.content_type or "application/octet-stream"))

    if not file_tuples:
        raise HTTPException(status_code=400, detail={"message": "All uploads failed validation", "errors": errors})

    result = viz_upload_files(file_tuples)

    if "error" in result:
        raise HTTPException(status_code=400, detail={"message": result["error"], "errors": errors})

    # Append any validation warnings
    if errors:
        result["warnings"] = errors

    return result


@app.delete("/api/v1/dataset/{dataset_id}", tags=["Data Visualizer"])
async def delete_viz_dataset(dataset_id: str):
    """Delete an uploaded dataset from the Data Visualization API."""
    result = viz_delete_dataset(dataset_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# =============================================================================
# BUSINESS MODEL CANVAS (BMC) ENDPOINTS
# =============================================================================

@app.post("/api/v1/bmc/generate")
async def bmc_generate(req: BMCGenerateRequest):
    """Generate a Business Model Canvas analysis for a company."""
    try:
        agent = get_bmc_agent()
        bmc_data = agent.generate(req.company)
        # Auto-save to library
        bmc_id = save_bmc(bmc_data)
        bmc_data["id"] = bmc_id
        return bmc_data
    except Exception as e:
        print(f"[BMC] Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"BMC generation failed: {str(e)}")


@app.post("/api/v1/bmc/chat")
async def bmc_chat(req: BMCChatRequest):
    """Ask a follow-up question about a specific BMC node."""
    try:
        agent = get_bmc_agent()
        answer = agent.chat(req.company, req.node_title, req.node_context, req.question)
        return BMCChatResponse(answer=answer, node_title=req.node_title, company=req.company)
    except Exception as e:
        print(f"[BMC] Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"BMC chat failed: {str(e)}")


@app.get("/api/v1/bmc/library")
async def bmc_library():
    """List all saved BMC analyses."""
    return list_library()


@app.get("/api/v1/bmc/{bmc_id}")
async def bmc_load(bmc_id: str):
    """Load a specific saved BMC analysis."""
    result = load_bmc(bmc_id)
    if not result:
        raise HTTPException(status_code=404, detail="BMC analysis not found")
    return result


@app.delete("/api/v1/bmc/{bmc_id}")
async def bmc_delete(bmc_id: str):
    """Delete a saved BMC analysis."""
    if delete_bmc(bmc_id):
        return {"status": "deleted", "id": bmc_id}
    raise HTTPException(status_code=404, detail="BMC analysis not found")


@app.get("/api/v1/bmc/{bmc_id}/export")
async def bmc_export(bmc_id: str, format: str = "json"):
    """Export a BMC analysis as JSON or PDF."""
    result = load_bmc(bmc_id)
    if not result:
        raise HTTPException(status_code=404, detail="BMC analysis not found")

    bmc_data = result["bmc_data"]

    if format == "pdf":
        pdf_bytes = export_bmc_pdf(bmc_data)
        return JSONResponse(
            content={"pdf_base64": __import__('base64').b64encode(pdf_bytes).decode(), "filename": f"bmc_{result['company_name']}.pdf"},
            media_type="application/json"
        )
    else:
        return JSONResponse(content=bmc_data)


# =============================================================================
# FRONTEND STATIC FILES (Deprecated)
# =============================================================================

@app.get("/")
def read_root():
    return {"message": "PRISM API is running. Frontend is available at http://localhost:3001"}


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
