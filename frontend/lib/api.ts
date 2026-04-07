/**
 * PRISM Intelligence — API Client
 * ================================
 * Wires the SIGMA Chat UI to the FastAPI backend.
 *
 * Conversations are stored client-side (localStorage).
 * Message sending streams via SSE from POST /api/v1/ask.
 */

const API_BASE = '/api/v1';

// ── Types ──
export interface Company {
  nse_code: string;
  company_name: string;
  sector: string;
  total_pages: number;
  total_chunks: number;
  embedded_chunks: number;
}

export interface Citation {
  ref: string;
  nse_code: string;
  page: number;
  chunk_type: string;
  preview: string;
  url?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string;
  citations?: Citation[];
  // Visualizer chart data — stored on message for re-opening the panel
  vizData?: {
    chartData: any;
    chartType: string;
    topic: string;
    vizMessage?: string;
    analysisData?: any;
    playgroundUrl?: string;
  };
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onSources: (citations: Citation[]) => void;
  onDone: (data: { model_used?: string }) => void;
  onError: (error: string) => void;
  onToolCall?: (data: ToolCallData) => void;
  onStatus?: (status: string) => void;
  onVizStatus?: (step: string) => void;
  onClarification?: (data: { message: string; suggestions: any[]; follow_up_questions: any[] }) => void;
}

export interface ToolCallData {
  tool: 'presentation' | 'visualizer';
  topic: string | null;
  // Presentation fields
  use_chat_context?: boolean;
  n_slides?: number;
  // Visualizer fields
  chart?: any;             // Plotly figure JSON {data, layout}
  chart_type?: string;     // "bar", "line", "pie", etc.
  chart_type_hint?: string;
  viz_intent?: string;     // "chart" | "analysis" | "query" | "clarify"
  viz_message?: string;    // AI explanation text
  chart_config?: any;
  analysis?: any;          // Statistical analysis data
  data?: any;              // Raw data
  datasets_used?: string[];
  playground_url?: string;
}

export interface PresentationStatus {
  task_id: string;
  status: 'pending' | 'completed' | 'error';
  message?: string;
  presentation_id?: string;
  edit_url?: string;
  download_url?: string;
  error?: string;
}

// ── localStorage Conversation Store ──
const STORAGE_KEY = 'prism_conversations';

function loadConversationsFromStorage(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversationsToStorage(convs: Conversation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
}

// ── API Methods ──
export const api = {
  // Companies (real API)
  async listCompanies(): Promise<Company[]> {
    const res = await fetch(`${API_BASE}/companies`);
    if (!res.ok) throw new Error('Failed to load companies');
    return res.json();
  },

  // Health
  async health() {
    const res = await fetch('/health');
    return res.json();
  },

  // Conversations (localStorage)
  async listConversations(): Promise<Conversation[]> {
    return loadConversationsFromStorage();
  },

  async createConversation(opts: { title: string; context_company_ticker?: string }): Promise<Conversation> {
    const conv: Conversation = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
      title: opts.title,
      updated_at: new Date().toISOString(),
      messages: [],
    };
    const convs = loadConversationsFromStorage();
    convs.unshift(conv);
    saveConversationsToStorage(convs);
    return conv;
  },

  async getConversation(id: string): Promise<Conversation> {
    const convs = loadConversationsFromStorage();
    const conv = convs.find(c => c.id === id);
    if (!conv) throw new Error('Conversation not found');
    return conv;
  },

  async updateConversation(id: string, update: { title?: string }): Promise<void> {
    const convs = loadConversationsFromStorage();
    const idx = convs.findIndex(c => c.id === id);
    if (idx >= 0) {
      if (update.title) convs[idx].title = update.title;
      convs[idx].updated_at = new Date().toISOString();
      saveConversationsToStorage(convs);
    }
  },

  async deleteConversation(id: string): Promise<void> {
    const convs = loadConversationsFromStorage();
    saveConversationsToStorage(convs.filter(c => c.id !== id));
  },

  // Save messages to conversation
  saveMessages(convId: string, messages: ChatMessage[]) {
    const convs = loadConversationsFromStorage();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx >= 0) {
      convs[idx].messages = messages;
      convs[idx].updated_at = new Date().toISOString();
      saveConversationsToStorage(convs);
    }
  },

  // ── Presentation Tool API ──
  async generatePresentation(params: {
    topic?: string;
    n_slides?: number;
    chat_messages?: { role: string; content: string }[];
    tone?: string;
    verbosity?: string;
    instructions?: string;
  }): Promise<{ task_id: string; status: string; message: string }> {
    const res = await fetch(`${API_BASE}/tools/presentation/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to generate presentation');
    }
    return res.json();
  },

  async pollPresentationStatus(taskId: string): Promise<PresentationStatus> {
    const res = await fetch(`${API_BASE}/tools/presentation/status/${taskId}`);
    if (!res.ok) throw new Error('Failed to poll status');
    return res.json();
  },

  async exportPresentation(presentationId: string, exportAs: string = 'pptx'): Promise<{ download_url: string; edit_url: string }> {
    const res = await fetch(`${API_BASE}/tools/presentation/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentation_id: presentationId, export_as: exportAs }),
    });
    if (!res.ok) throw new Error('Failed to export');
    return res.json();
  },

  // ── Data Visualizer APIs ──

  async generateChart(message: string, datasetIds?: string[]): Promise<any> {
    const res = await fetch(`${API_BASE}/visualize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, dataset_ids: datasetIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to generate chart');
    }
    return res.json();
  },

  async listVizDatasets(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/datasets`);
    if (!res.ok) return [];
    return res.json();
  },

  // ── File Upload for DataViz ──
  async uploadFiles(files: File[]): Promise<{
    dataset_ids?: string[];
    datasets?: any[];
    message?: string;
    warnings?: string[];
    error?: string;
  }> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type — browser sets it with boundary
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      const msg = typeof detail === 'string' ? detail : detail?.message || 'Upload failed';
      const errors = typeof detail === 'object' ? detail?.errors : undefined;
      return { error: msg, warnings: errors };
    }
    return res.json();
  },

  async deleteDataset(datasetId: string): Promise<{ deleted?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/dataset/${datasetId}`, { method: 'DELETE' });
    if (!res.ok) {
      return { error: 'Failed to delete dataset' };
    }
    return res.json();
  },

  /**
   * Stream a chat message via SSE from POST /api/v1/ask
   *
   * SSE protocol:
   *   event: citations  → data: Citation[]
   *   event: token      → data: "escaped string"
   *   event: tool_call  → data: ToolCallData
   *   event: done       → data: {}
   */
  streamChatMessage(
    _convId: string,
    question: string,
    _files: File[],
    contextTicker: string | undefined,
    _aiProvider: string,
    callbacks: StreamCallbacks,
    useWebSearch?: boolean,
    chatHistory?: { role: string; content: string }[],
    datasetIds?: string[]
  ): { abort: () => void } {
    const controller = new AbortController();

    (async () => {
      try {
        const body: Record<string, unknown> = {
          question,
          stream: true,
          max_context_chunks: 8,
          use_web_search: !!useWebSearch
        };
        if (contextTicker) {
          body.nse_code = contextTicker;
        }
        // Include conversation history for context-based visualization
        if (chatHistory && chatHistory.length > 0) {
          body.chat_history = chatHistory;
        }
        // Include uploaded dataset IDs for DataViz routing
        if (datasetIds && datasetIds.length > 0) {
          body.dataset_ids = datasetIds;
        }

        const res = await fetch(`${API_BASE}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Check for clarification response
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (json.type === 'clarification') {
              if (callbacks.onClarification) {
                callbacks.onClarification({
                  message: json.message || 'Could you specify which company you mean?',
                  suggestions: json.suggestions || [],
                  follow_up_questions: json.follow_up_questions || [],
                });
              } else {
                callbacks.onToken(json.message || 'Could you specify which company you mean?');
                if (json.suggestions?.length) {
                  callbacks.onToken('\n\n**Suggestions:**\n');
                  json.suggestions.forEach((s: any) => {
                    const label = typeof s === 'string' ? s : s.label || s.company_name || 'Unknown Company';
                    callbacks.onToken(`- ${label}\n`);
                  });
                }
              }
              callbacks.onDone({});
              return;
            }
          }
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        // Check if response is JSON (clarification) vs SSE stream
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          if (json.type === 'clarification') {
            if (callbacks.onClarification) {
              callbacks.onClarification({
                message: json.message || 'Could you be more specific?',
                suggestions: json.suggestions || [],
                follow_up_questions: json.follow_up_questions || [],
              });
            } else {
              callbacks.onToken(json.message || 'Could you be more specific?');
              if (json.suggestions?.length) {
                callbacks.onToken('\n\n**Suggestions:**\n');
                json.suggestions.forEach((s: any) => {
                  const label = typeof s === 'string' ? s : s.label || s.company_name || 'Unknown Company';
                  callbacks.onToken(`- ${label}\n`);
                });
              }
            }
            callbacks.onDone({});
            return;
          }
          if (json.type === 'tool_call') {
            callbacks.onToolCall?.(json as ToolCallData);
            callbacks.onDone({});
            return;
          }
          // Non-streaming JSON response
          if (json.answer) {
            callbacks.onToken(json.answer);
            if (json.citations) callbacks.onSources(json.citations);
            callbacks.onDone({ model_used: json.model });
            return;
          }
        }

        // SSE stream parsing
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let model_used = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                if (currentEvent === 'citations') {
                  const citations: Citation[] = JSON.parse(data);
                  callbacks.onSources(citations);
                } else if (currentEvent === 'token') {
                  const token = JSON.parse(data);
                  callbacks.onToken(token);
                } else if (currentEvent === 'status') {
                  const statusText = JSON.parse(data);
                  callbacks.onStatus?.(statusText);
                } else if (currentEvent === 'viz_status') {
                  const vizStep = JSON.parse(data);
                  callbacks.onVizStatus?.(vizStep);
                } else if (currentEvent === 'tool_call') {
                  const toolData: ToolCallData = JSON.parse(data);
                  callbacks.onToolCall?.(toolData);
                } else if (currentEvent === 'done') {
                  try {
                    const doneData = JSON.parse(data);
                    model_used = doneData.model_used || 'PRISM RAG';
                  } catch {
                    model_used = 'PRISM RAG';
                  }
                }
              } catch {
                // Skip malformed data
              }
              currentEvent = '';
            }
          }
        }

        callbacks.onDone({ model_used });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          callbacks.onDone({ model_used: 'Aborted by user' });
          return;
        }
        callbacks.onError(err instanceof Error ? err.message : 'Unknown error');
      }
    })();

    return { abort: () => controller.abort() };
  },
};

