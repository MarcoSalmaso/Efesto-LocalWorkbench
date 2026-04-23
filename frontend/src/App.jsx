import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { avatarGradientStyle, bubbleStyle, getAgentColor } from './agents/agentColors';
import axios from 'axios';
const WorkflowEditor = lazy(() => import('./workflow/WorkflowEditor'));
const WorkflowList   = lazy(() => import('./workflow/WorkflowList'));
const McpPanel        = lazy(() => import('./mcp/McpPanel'));
const AgentsPanel     = lazy(() => import('./agents/AgentsPanel'));
const PromptLibrary   = lazy(() => import('./prompts/PromptLibrary'));
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import {
  MessageSquare,
  Settings,
  Database,
  Hammer,
  Plus,
  Send,
  Layers,
  Cpu,
  History,
  Loader2,
  ChevronDown,
  ChevronRight,
  Brain,
  User,
  Save,
  Terminal,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Square,
  Monitor,
  Code,
  Eye,
  ExternalLink,
  Copy,
  Check,
  Download,
  RefreshCw,
  TriangleAlert,
  Search,
  X,
  Pencil,
  Info,
  Thermometer,
  SlidersHorizontal,
  GitBranch,
  Plug,
  Bot,
  BookOpen,
} from 'lucide-react';

const API_BASE = "http://localhost:8006";

const App = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBackendLive, setIsBackendLive] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState({});
  const [settings, setSettings] = useState({
    user_name: '',
    system_prompt: '',
    context_length: 10,
    rag_embedding_model: 'qwen3-embedding:4b',
    rag_chunk_size: 800,
    rag_batch_size: 8,
    rag_search_limit: 3,
    gen_temperature: 0.8,
    gen_top_p: 0.9,
    gen_num_predict: -1,
    default_model: '',
  });

  // Workflow states
  const [workflows, setWorkflows] = useState([]);
  const [openWorkflow, setOpenWorkflow] = useState(null);

  // Agent states
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null); // { id, name, model, ... }

  // Prompt Library states
  const [prompts, setPrompts] = useState([]);

  // Chat tool panel: null | 'menu' | 'agents' | 'prompts'
  const [chatPanel, setChatPanel] = useState(null);
  const [promptSearch, setPromptSearch] = useState('');

  // RAG States
  const [knowledgeBase, setKnowledgeBase] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({ status: 'idle', message: '' });
  const fileInputRef = useRef(null);

  // Tools state
  const [tools, setTools] = useState([]);
  
  const [processingSteps, setProcessingSteps] = useState([]);
  const [tokenStats, setTokenStats] = useState({ count: 0, rate: null, elapsed: null, active: false });
  const tokenStartRef = useRef(null);

  const [artifactTabs, setArtifactTabs] = useState({});
  const [copiedArtifact, setCopiedArtifact] = useState(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const [reembedStatus, setReembedStatus] = useState({ status: 'idle', message: '' });
  const importFileInputRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = non attiva
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [runningModels, setRunningModels] = useState([]);
  const modelDropdownRef = useRef(null);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    fetchModels();
    fetchSessions();
    fetchSettings();
    fetchTools();
    fetchRunningModels();
    fetchAgents();
    fetchPrompts();

    const es = new EventSource(`${API_BASE}/ollama/ps/stream`);
    es.onmessage = (e) => {
      try { setRunningModels(JSON.parse(e.data).models || []); } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  useEffect(() => {
    if (activeTab === 'db') fetchKnowledgeBase();
    if (activeTab === 'workflow') fetchWorkflows();
    if (activeTab === 'chat') { fetchAgents(); fetchPrompts(); }
  }, [activeTab]);

  const fetchWorkflows = async () => {
    try { const r = await axios.get(`${API_BASE}/workflows/`); setWorkflows(r.data); } catch {}
  };

  const fetchAgents = async () => {
    try { const r = await axios.get(`${API_BASE}/agents/`); setAgents(r.data); } catch {}
  };

  const fetchPrompts = async () => {
    try { const r = await axios.get(`${API_BASE}/prompts/`); setPrompts(r.data); } catch {}
  };

  const createWorkflow = async () => {
    try {
      const r = await axios.post(`${API_BASE}/workflows/`);
      setWorkflows(prev => [r.data, ...prev]);
      setOpenWorkflow(r.data);
    } catch { addToast('Errore nella creazione del workflow.', 'error'); }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    if (!sessionSearch.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions/search`, { params: { q: sessionSearch } });
        setSearchResults(res.data);
      } catch { setSearchResults([]); }
      finally { setIsSearching(false); }
    }, 300);
  }, [sessionSearch]);

  useEffect(() => {
    if (models.length > 0 && settings.rag_embedding_model && !models.includes(settings.rag_embedding_model)) {
      setSettings(s => ({ ...s, rag_embedding_model: models[0] }));
    }
  }, [models, settings.rag_embedding_model]);

  useEffect(() => {
    if (models.length === 0) return;
    const preferred = settings.default_model && models.includes(settings.default_model)
      ? settings.default_model
      : models[0];
    setSelectedModel(preferred);
  }, [models, settings.default_model]);

  const fetchRunningModels = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ollama/ps`);
      setRunningModels(res.data.models || []);
    } catch { setRunningModels([]); }
  };

  const fetchModels = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ollama/list`);
      setModels(res.data.models || []);
      setIsBackendLive(true);
    } catch (err) { setIsBackendLive(false); }
  };

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions/`);
      setSessions(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/settings`);
      setSettings(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchTools = async () => {
    try {
      const res = await axios.get(`${API_BASE}/tools`);
      setTools(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchKnowledgeBase = async () => {
    try {
      const res = await axios.get(`${API_BASE}/knowledge/list`);
      setKnowledgeBase(res.data);
    } catch (err) { console.error(err); }
  };

  const saveSettings = async () => {
    try {
      const res = await axios.post(`${API_BASE}/settings`, settings);
      setSettings(res.data);
      addToast('Impostazioni salvate con successo!', 'success');
    } catch (err) { console.error(err); addToast('Errore nel salvataggio.', 'error'); }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    setUploadStatus({ status: 'loading', current: 0, total: null, filename: file.name });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/knowledge/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        setUploadStatus({ status: 'error', message: err.detail || 'Errore durante il caricamento.' });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.status === 'success') {
            setUploadStatus({ status: 'success', total: data.total, filename: data.filename });
            fetchKnowledgeBase();
            setTimeout(() => setUploadStatus({ status: 'idle' }), 4000);
          } else if (data.status === 'error') {
            setUploadStatus({ status: 'error', message: data.detail });
          } else {
            setUploadStatus({ status: 'loading', current: data.current, total: data.total, filename: file.name });
          }
        }
      }
    } catch (err) {
      setUploadStatus({ status: 'error', message: 'Errore di connessione.' });
      console.error(err);
    }
  };

  const handleDeleteDocument = async (filename) => {
    if (!confirm(`Rimuovere "${filename}" dalla Knowledge Base?`)) return;
    try {
      await axios.delete(`${API_BASE}/knowledge/${encodeURIComponent(filename)}`);
      fetchKnowledgeBase();
      addToast(`"${filename}" rimosso dalla Knowledge Base.`, 'success');
    } catch (err) {
      addToast('Errore durante la rimozione del documento.', 'error');
      console.error(err);
    }
  };

  const handleResetKnowledge = async () => {
    if (!confirm('Svuotare tutta la Knowledge Base? L\'operazione non è reversibile.')) return;
    try {
      await axios.delete(`${API_BASE}/knowledge`);
      fetchKnowledgeBase();
      addToast('Knowledge Base svuotata.', 'success');
    } catch (err) {
      addToast('Errore durante il reset della Knowledge Base.', 'error');
      console.error(err);
    }
  };

  const loadSession = async (sessionId) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    setActiveTab('chat');
    try {
      const res = await axios.get(`${API_BASE}/sessions/${sessionId}/messages`);
      setMessages(res.data);
    } catch (err) { console.error(err); }
    setIsLoading(false);
  };

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setActiveTab('chat');
  };

  const extractArtifact = (content) => {
    if (!content) return null;
    const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
    if (htmlMatch) return { type: 'html', code: htmlMatch[1].trim(), lang: 'HTML' };
    const svgMatch = content.match(/```svg\n([\s\S]*?)```/);
    if (svgMatch) return {
      type: 'html',
      code: `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#09090b">${svgMatch[1].trim()}</body></html>`,
      lang: 'SVG',
    };
    return null;
  };

  const renderArtifactCard = (artifact, msgKey, isStreaming) => {
    const tab = artifactTabs[msgKey] || 'preview';
    const isCopied = copiedArtifact === msgKey;

    const handleCopy = () => {
      navigator.clipboard.writeText(artifact.code);
      setCopiedArtifact(msgKey);
      setTimeout(() => setCopiedArtifact(null), 2000);
    };

    const handleOpenNew = () => {
      const blob = new Blob([artifact.code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    return (
      <div className="mt-2 rounded-2xl overflow-hidden border border-zinc-700/50 bg-zinc-800/50 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-700/40 border-b border-zinc-700/50">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Monitor size={13} className="text-orange-500" />
              <span className="text-xs font-semibold text-zinc-300">Artifact</span>
              <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded-full font-mono border border-zinc-600/60">{artifact.lang}</span>
            </div>
            <div className="flex items-center bg-zinc-700/50 rounded-lg p-0.5">
              {['preview', 'code'].map(t => (
                <button
                  key={t}
                  onClick={() => setArtifactTabs(prev => ({ ...prev, [msgKey]: t }))}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                    tab === t ? 'bg-zinc-500/80 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t === 'preview' ? <Eye size={11} /> : <Code size={11} />}
                  <span>{t === 'preview' ? 'Anteprima' : 'Codice'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-0.5">
            <button onClick={handleCopy} title="Copia codice"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600/50 transition-all">
              {isCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
            <button onClick={handleOpenNew} title="Apri in nuova scheda"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600/50 transition-all">
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === 'preview' ? (
          isStreaming ? (
            <div className="h-64 flex items-center justify-center text-zinc-600 text-xs space-x-2">
              <Loader2 size={14} className="animate-spin" />
              <span>Generazione in corso...</span>
            </div>
          ) : (
            <iframe
              srcDoc={artifact.code}
              sandbox="allow-scripts allow-modals"
              className="w-full border-0 bg-white"
              style={{ height: '420px' }}
              title={`artifact-${msgKey}`}
            />
          )
        ) : (
          <pre className="p-4 text-xs text-zinc-300 overflow-auto custom-scrollbar leading-relaxed" style={{ maxHeight: '420px' }}>
            <code>{artifact.code}</code>
          </pre>
        )}
      </div>
    );
  };

  const STEP_CONFIG = {
    receiving:      { label: 'Messaggio ricevuto',   Icon: MessageSquare },
    thinking:       { label: 'Ragionamento',          Icon: Brain },
    generating:     { label: 'Generazione risposta',  Icon: Cpu },
    tool_call:      { label: 'Selezione tool',        Icon: Hammer },
    tool_executing: { label: 'Esecuzione tool',       Icon: Terminal },
    tool_result:    { label: 'Risultato ricevuto',    Icon: CheckCircle2 },
    done:           { label: 'Completato',            Icon: CheckCircle2 },
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedModel || isLoading) return;

    const userMsg = { role: 'user', content: inputText, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    const textToSend = inputText;
    setInputText('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    setIsLoading(true);
    tokenStartRef.current = null;
    setTokenStats({ count: 0, rate: null, elapsed: null, active: false });
    setProcessingSteps([{
      id: 'receiving',
      type: 'receiving',
      label: 'Messaggio ricevuto',
      detail: undefined,
      status: 'done',
    }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeAgent?.model || selectedModel,
          message: textToSend,
          session_id: currentSessionId,
          agent_id: activeAgent?.id || null,
          temperature: settings.gen_temperature,
          top_p: settings.gen_top_p,
          num_predict: settings.gen_num_predict === -1 ? null : settings.gen_num_predict,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Errore di comunicazione');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMsg = {
        role: 'assistant',
        content: '',
        thinking: '',
        created_at: new Date().toISOString(),
        agent_name: activeAgent?.name ?? null,
        agent_color: activeAgent?.color ?? null,
      };

      setMessages(prev => [...prev, assistantMsg]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            // Handle processing steps sidebar
            if (data.step) {
              const toolNames = data.tool_calls?.map(tc => tc.function?.name).filter(Boolean) || [];
              const detail = data.tool || (toolNames.length > 0 ? toolNames.join(', ') : undefined);
              const cfg = STEP_CONFIG[data.step];
              const label = cfg?.label || data.step;
              if (data.step === 'done') {
                setProcessingSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
              } else {
                setProcessingSteps(prev => {
                  const updated = prev.map(s => ({ ...s, status: 'done' }));
                  return [...updated, { id: `${data.step}-${Date.now()}`, type: data.step, label, detail, status: 'active' }];
                });
              }
            }

            if (data.error) {
              assistantMsg.content += `\nErrore: ${data.error}`;
            } else if (data.tool_calls) {
              // Spezza il messaggio: la pill dei tool call + nuovo messaggio per la risposta finale
              const pillMsg = { ...assistantMsg, tool_calls: data.tool_calls, content: '' };
              assistantMsg = { role: 'assistant', content: '', thinking: '', created_at: new Date().toISOString(), agent_name: activeAgent?.name ?? null, agent_color: activeAgent?.color ?? null };
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = pillMsg;
                return [...updated, assistantMsg];
              });
              continue;
            } else {
              if (data.content) {
                assistantMsg.content += data.content;
                const now = performance.now();
                if (!tokenStartRef.current) tokenStartRef.current = now;
                const elapsed = (now - tokenStartRef.current) / 1000;
                setTokenStats(prev => {
                  const count = prev.count + 1;
                  return { count, rate: elapsed > 0.1 ? count / elapsed : null, elapsed, active: true };
                });
              }
              if (data.thinking) assistantMsg.thinking += data.thinking;
              if (data.session_id && !currentSessionId) {
                setCurrentSessionId(data.session_id);
                fetchSessions();
              }
            }

            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...assistantMsg };
              return updated;
            });
          } catch (e) { console.error("Errore parsing chunk:", e); }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        setMessages(prev => [...prev, { role: 'assistant', content: "Errore di comunicazione." }]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      setProcessingSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      setTokenStats(prev => ({ ...prev, active: false }));
    }
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const toggleThinking = (index) => {
    setExpandedThinking(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : `${dateStr}Z`;
    return new Date(normalized).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const saveSessionTitle = async (sessionId, newTitle) => {
    const trimmed = newTitle.trim();
    if (!trimmed) { setEditingSessionId(null); return; }
    try {
      await axios.patch(`${API_BASE}/sessions/${sessionId}`, { title: trimmed });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: trimmed } : s));
      setEditingSessionId(null);
      addToast('Conversazione rinominata.', 'success');
    } catch { addToast('Errore durante la rinomina.', 'error'); }
  };

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const renderToasts = () => (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const styles = {
          success: { bar: 'bg-green-500',  icon: <CheckCircle2 size={16} className="text-green-400 shrink-0" /> },
          error:   { bar: 'bg-red-500',    icon: <AlertCircle  size={16} className="text-red-400 shrink-0" /> },
          info:    { bar: 'bg-blue-500',   icon: <Info         size={16} className="text-blue-400 shrink-0" /> },
        }[t.type] || {};
        return (
          <div key={t.id} className="toast-enter pointer-events-auto flex items-start gap-3 bg-[#2a2a33] border border-zinc-700/60 rounded-xl shadow-xl shadow-black/40 px-4 py-3 min-w-[260px] max-w-[360px]">
            {styles.icon}
            <p className="text-sm text-zinc-200 leading-snug flex-1">{t.message}</p>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
              <X size={14} />
            </button>
            <div className={`absolute bottom-0 left-0 h-0.5 rounded-b-xl ${styles.bar} opacity-60`} style={{ width: '100%', animation: 'toast-shrink 4s linear forwards' }} />
          </div>
        );
      })}
    </div>
  );

  const highlightMatch = (text, query) => {
    if (!query?.trim() || !text) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-orange-500/30 text-orange-300 rounded-sm px-0.5 not-italic">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </span>
    );
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : `${dateStr}Z`;
    return new Date(normalized).toLocaleString('it-IT', { 
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/knowledge/export`);
      if (!res.ok) throw new Error('Errore export');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'efesto_kb.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { addToast('Errore durante l\'esportazione.', 'error'); console.error(err); }
  };

  const handleExportChat = () => {
    if (!messages.length) return;
    const session = sessions.find(s => s.id === currentSessionId);
    const title = session?.title || 'Conversazione';
    const now = new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const lines = [`# ${title}`, `*Esportato il ${now}*`, ''];
    for (const msg of messages) {
      if (msg.role === 'tool') continue;
      if (msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) continue;
      const author = msg.role === 'user' ? `**${settings.user_name || 'Tu'}**` : '**Efesto**';
      const time = formatTime(msg.created_at);
      lines.push('---', `${author}${time ? ` · ${time}` : ''}`, '', msg.content || '', '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    setReembedStatus({ status: 'loading', current: 0, total: null, message: 'Importazione in corso...' });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/knowledge/import`, { method: 'POST', body: formData });
      if (!response.ok) { const e = await response.json(); setReembedStatus({ status: 'error', message: e.detail }); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          const data = JSON.parse(line.slice(6));
          if (data.status === 'success') {
            setReembedStatus({ status: 'success', message: `Importati ${data.total} chunk e vettori rigenerati.` });
            fetchKnowledgeBase();
            fetchSettings();
            setTimeout(() => setReembedStatus({ status: 'idle' }), 5000);
          } else if (data.status === 'error') {
            setReembedStatus({ status: 'error', message: data.detail });
          } else if (data.phase === 'saved') {
            setReembedStatus({ status: 'loading', current: 0, total: data.total, message: 'Chunk salvati, embedding in corso...' });
          } else if (data.phase === 'embedding') {
            setReembedStatus({ status: 'loading', current: data.current, total: data.total, message: 'Embedding in corso...' });
          }
        }
      }
    } catch (err) { setReembedStatus({ status: 'error', message: 'Errore di connessione.' }); console.error(err); }
  };

  const handleReembed = async () => {
    setReembedStatus({ status: 'loading', current: 0, total: null, message: 'Rigenerazione vettori in corso...' });
    try {
      const response = await fetch(`${API_BASE}/knowledge/reembed`, { method: 'POST' });
      if (!response.ok) { const e = await response.json(); setReembedStatus({ status: 'error', message: e.detail }); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          const data = JSON.parse(line.slice(6));
          if (data.status === 'success') {
            setReembedStatus({ status: 'success', message: `Vettori rigenerati per ${data.total} chunk.` });
            fetchSettings();
            setTimeout(() => setReembedStatus({ status: 'idle' }), 5000);
          } else if (data.status === 'error') {
            setReembedStatus({ status: 'error', message: data.detail });
          } else {
            setReembedStatus({ status: 'loading', current: data.current, total: data.total, message: 'Embedding in corso...' });
          }
        }
      }
    } catch (err) { setReembedStatus({ status: 'error', message: 'Errore di connessione.' }); console.error(err); }
  };

  const renderDatabase = () => (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center space-x-2">
            <Database className="text-orange-500" />
            <span>Knowledge Base</span>
          </h3>
          <p className="text-zinc-500 text-sm">Gestisci i documenti utilizzati da Efesto per il RAG.</p>
        </div>

        <div className="flex items-center space-x-2">
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload}
            accept=".txt,.md,.pdf,.docx,.csv,.json,.html,.htm" />
          <input type="file" className="hidden" ref={importFileInputRef} onChange={handleImport}
            accept=".json" />

          {knowledgeBase.length > 0 && (
            <>
              <button onClick={handleExport}
                className="bg-zinc-700/60 hover:bg-zinc-600/70 border border-zinc-600/60 text-zinc-300 hover:text-zinc-100 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm">
                <Download size={16} /><span>Esporta</span>
              </button>
              <button onClick={handleResetKnowledge}
                className="bg-zinc-700/60 hover:bg-red-900/40 border border-zinc-600/60 hover:border-red-600/50 text-zinc-300 hover:text-red-400 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm">
                <Trash2 size={16} /><span>Svuota tutto</span>
              </button>
            </>
          )}
          <button onClick={() => importFileInputRef.current.click()}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm">
            <Upload size={16} /><span>Importa</span>
          </button>
          <button onClick={() => fileInputRef.current.click()}
            className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm">
            <Upload size={16} /><span>Carica Documento</span>
          </button>
        </div>
      </div>

      {/* Warning modello embedding cambiato */}
      {settings.active_embedding_model && settings.active_embedding_model !== settings.rag_embedding_model && (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex items-start justify-between space-x-4">
          <div className="flex items-start space-x-3">
            <TriangleAlert size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">Modello di embedding cambiato</p>
              <p className="text-xs text-yellow-500 mt-0.5">
                I vettori esistenti sono stati creati con <span className="font-mono">{settings.active_embedding_model}</span>, ma il modello attuale è <span className="font-mono">{settings.rag_embedding_model}</span>. La ricerca RAG potrebbe dare risultati sbagliati.
              </p>
            </div>
          </div>
          <button onClick={handleReembed} disabled={reembedStatus.status === 'loading'}
            className="flex-shrink-0 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm disabled:opacity-50">
            <RefreshCw size={15} className={reembedStatus.status === 'loading' ? 'animate-spin' : ''} />
            <span>Rigenera Vettori</span>
          </button>
        </div>
      )}

      {/* Progresso re-embed / import */}
      {reembedStatus.status !== 'idle' && (
        <div className={`p-4 rounded-xl border space-y-2 ${
          reembedStatus.status === 'loading' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
          reembedStatus.status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
          'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-center space-x-3">
            {reembedStatus.status === 'loading' ? <Loader2 size={18} className="animate-spin flex-shrink-0" /> :
             reembedStatus.status === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0" /> :
             <AlertCircle size={18} className="flex-shrink-0" />}
            <span className="text-sm font-medium">
              {reembedStatus.status === 'loading' && reembedStatus.total
                ? `${reembedStatus.message} — ${reembedStatus.current}/${reembedStatus.total} chunk`
                : reembedStatus.message}
            </span>
          </div>
          {reembedStatus.status === 'loading' && reembedStatus.total && (
            <div className="w-full bg-blue-900/30 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${(reembedStatus.current / reembedStatus.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {uploadStatus.status !== 'idle' && (
        <div className={`p-4 rounded-xl border space-y-2 ${
          uploadStatus.status === 'loading' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
          uploadStatus.status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
          'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-center space-x-3">
            {uploadStatus.status === 'loading' ? <Loader2 size={18} className="animate-spin flex-shrink-0" /> :
             uploadStatus.status === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0" /> :
             <AlertCircle size={18} className="flex-shrink-0" />}
            <span className="text-sm font-medium">
              {uploadStatus.status === 'loading' && uploadStatus.total
                ? `Embedding ${uploadStatus.filename} — chunk ${uploadStatus.current}/${uploadStatus.total}`
                : uploadStatus.status === 'loading'
                ? `Analisi di ${uploadStatus.filename}...`
                : uploadStatus.status === 'success'
                ? `${uploadStatus.filename} indicizzato (${uploadStatus.total} chunk)`
                : uploadStatus.message}
            </span>
          </div>
          {uploadStatus.status === 'loading' && uploadStatus.total && (
            <div className="w-full bg-blue-900/30 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${(uploadStatus.current / uploadStatus.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-700/40 bg-zinc-800/20">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Documenti Indicizzati</h4>
        </div>
        
        <div className="divide-y divide-zinc-700/40 max-h-[500px] overflow-y-auto custom-scrollbar">
          {knowledgeBase.length === 0 ? (
            <div className="p-12 text-center text-zinc-600 italic">
              Nessun documento presente nella Knowledge Base.
            </div>
          ) : (
            knowledgeBase.map((doc, idx) => (
              <div key={idx} className="p-4 hover:bg-zinc-700/25 transition-colors flex items-center justify-between group">
                <div className="flex items-center space-x-4 min-w-0">
                  <div className="bg-zinc-700/60 p-2.5 rounded-lg text-orange-500/80">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {doc.filename || "Testo manuale"}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate italic">
                      {doc.preview}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 flex-shrink-0 ml-4">
                  <span className="text-[10px] bg-zinc-700/50 text-zinc-400 px-2 py-1 rounded-md whitespace-nowrap">
                    {doc.chunks} {doc.chunks === 1 ? 'chunk' : 'chunks'}
                  </span>
                  <button
                    onClick={() => handleDeleteDocument(doc.filename)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100"
                    title="Rimuovi documento"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderTools = () => (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center space-x-2">
          <Hammer className="text-orange-500" />
          <span>Strumenti Disponibili</span>
        </h3>
        <p className="text-zinc-500 text-sm">Funzioni che il modello può invocare autonomamente durante una conversazione.</p>
      </div>

      <div className="space-y-4">
        {tools.length === 0 ? (
          <div className="p-12 text-center text-zinc-600 italic bg-zinc-900/50 border border-zinc-800 rounded-3xl">
            Nessuno strumento registrato.
          </div>
        ) : tools.map((tool) => (
          <div key={tool.name} className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="p-6 flex items-start justify-between gap-4">
              <div className="flex items-start space-x-4 min-w-0">
                <div className="bg-orange-600/10 border border-orange-600/20 p-3 rounded-xl shrink-0">
                  <Terminal size={20} className="text-orange-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-3 mb-1">
                    <code className="text-sm font-mono text-orange-400 bg-orange-900/20 px-2 py-0.5 rounded-lg">
                      {tool.name}
                    </code>
                    <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/50 px-2 py-0.5 rounded-full font-medium">
                      attivo
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{tool.description}</p>
                </div>
              </div>
            </div>

            {/* Parametri */}
            {tool.parameters?.properties && Object.keys(tool.parameters.properties).length > 0 && (
              <div className="border-t border-zinc-700/40 px-6 py-4">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Parametri</p>
                <div className="space-y-2">
                  {Object.entries(tool.parameters.properties).map(([param, schema]) => (
                    <div key={param} className="flex items-start space-x-3">
                      <code className="text-xs font-mono text-zinc-200 bg-zinc-700/60 px-2 py-0.5 rounded shrink-0">
                        {param}
                      </code>
                      <span className="text-[10px] text-zinc-400 bg-zinc-700/50 border border-zinc-600/50 px-2 py-0.5 rounded shrink-0">
                        {schema.type || 'any'}
                      </span>
                      {tool.parameters.required?.includes(param) && (
                        <span className="text-[10px] text-red-400 border border-red-900/50 px-2 py-0.5 rounded shrink-0">
                          required
                        </span>
                      )}
                      {schema.description && (
                        <span className="text-[10px] text-zinc-500 leading-relaxed">{schema.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center space-x-2">
          <Settings className="text-orange-500" />
          <span>Impostazioni di Sistema</span>
        </h3>
        <p className="text-zinc-500 text-sm">Personalizza il comportamento di Efesto e la tua identità.</p>
      </div>

      <div className="space-y-6 bg-zinc-800/40 border border-zinc-700/60 p-8 rounded-3xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <User size={14} /> <span>Il tuo Nome</span>
          </label>
          <input 
            type="text" 
            value={settings.user_name}
            onChange={(e) => setSettings({...settings, user_name: e.target.value})}
            className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all"
            placeholder="Come vuoi essere chiamato?"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Terminal size={14} /> <span>System Prompt</span>
          </label>
          <textarea 
            value={settings.system_prompt}
            onChange={(e) => setSettings({...settings, system_prompt: e.target.value})}
            rows={4}
            className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all resize-none"
            placeholder="Istruzioni globali per l'AI..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Cpu size={14} /> <span>Modello Default</span>
          </label>
          <select
            value={settings.default_model}
            onChange={(e) => setSettings({ ...settings, default_model: e.target.value })}
            className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all"
          >
            <option value="">— Primo disponibile —</option>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-600">Modello selezionato automaticamente all'avvio. Se non disponibile, viene usato il primo in lista.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <History size={14} /> <span>Lunghezza Contesto (Messaggi)</span>
          </label>
          <div className="flex items-center space-x-4">
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={settings.context_length}
              onChange={(e) => setSettings({...settings, context_length: parseInt(e.target.value)})}
              className="flex-1 accent-orange-600"
            />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-12 text-center py-2 rounded-lg font-mono text-orange-400">
              {settings.context_length}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Numero di messaggi precedenti inviati all'AI per mantenere il contesto.</p>
        </div>

        <button
          onClick={saveSettings}
          className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-orange-900/10"
        >
          <Save size={18} />
          <span>Salva Configurazioni</span>
        </button>
      </div>

      {/* Sezione RAG */}
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center space-x-2">
          <Database className="text-orange-500" />
          <span>Configurazione RAG</span>
        </h3>
        <p className="text-zinc-500 text-sm">Parametri per l'indicizzazione e la ricerca nella Knowledge Base.</p>
      </div>

      <div className="space-y-6 bg-zinc-800/40 border border-zinc-700/60 p-8 rounded-3xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Cpu size={14} /> <span>Modello di Embedding</span>
          </label>
          <select
            value={settings.rag_embedding_model}
            onChange={(e) => setSettings({ ...settings, rag_embedding_model: e.target.value })}
            className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all"
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-600">Modello Ollama usato per generare gli embedding. Cambiarlo richiede di ricaricare tutti i documenti.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Layers size={14} /> <span>Max Chunk Length (parole)</span>
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={settings.rag_chunk_size}
              onChange={(e) => setSettings({ ...settings, rag_chunk_size: parseInt(e.target.value) })}
              className="flex-1 accent-orange-600"
            />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-16 text-center py-2 rounded-lg font-mono text-orange-400 text-sm">
              {settings.rag_chunk_size}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Lunghezza massima di ogni chunk in parole. Chunk più piccoli = ricerca più precisa, chunk più grandi = più contesto.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Cpu size={14} /> <span>Embedding Batch Size</span>
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="1"
              max="32"
              value={settings.rag_batch_size}
              onChange={(e) => setSettings({ ...settings, rag_batch_size: parseInt(e.target.value) })}
              className="flex-1 accent-orange-600"
            />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-12 text-center py-2 rounded-lg font-mono text-orange-400">
              {settings.rag_batch_size}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Quanti chunk vengono mandati al modello di embedding in una sola chiamata API. Valori più alti = indicizzazione più veloce.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Brain size={14} /> <span>Top-K Retrieval</span>
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="1"
              max="10"
              value={settings.rag_search_limit}
              onChange={(e) => setSettings({ ...settings, rag_search_limit: parseInt(e.target.value) })}
              className="flex-1 accent-orange-600"
            />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-12 text-center py-2 rounded-lg font-mono text-orange-400">
              {settings.rag_search_limit}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Numero di chunk più simili (top-k) passati all'AI come contesto per ogni ricerca nella Knowledge Base.</p>
        </div>

        <button
          onClick={saveSettings}
          className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-orange-900/10"
        >
          <Save size={18} />
          <span>Salva Configurazioni</span>
        </button>
      </div>

      {/* Parametri di generazione */}
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center space-x-2">
          <SlidersHorizontal className="text-orange-500" />
          <span>Parametri di Generazione</span>
        </h3>
        <p className="text-zinc-500 text-sm">Controlla il comportamento creativo del modello.</p>
      </div>

      <div className="space-y-6 bg-zinc-800/40 border border-zinc-700/60 p-8 rounded-3xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Thermometer size={14} /> <span>Temperature</span>
          </label>
          <div className="flex items-center space-x-4">
            <input type="range" min="0" max="2" step="0.05"
              value={settings.gen_temperature}
              onChange={e => setSettings({ ...settings, gen_temperature: parseFloat(e.target.value) })}
              className="flex-1 accent-orange-600" />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-14 text-center py-2 rounded-lg font-mono text-orange-400 text-sm">
              {settings.gen_temperature.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Valori alti (es. 1.5) = risposte più creative e variabili. Valori bassi (es. 0.2) = risposte più precise e deterministiche.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Layers size={14} /> <span>Top-P</span>
          </label>
          <div className="flex items-center space-x-4">
            <input type="range" min="0" max="1" step="0.05"
              value={settings.gen_top_p}
              onChange={e => setSettings({ ...settings, gen_top_p: parseFloat(e.target.value) })}
              className="flex-1 accent-orange-600" />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-14 text-center py-2 rounded-lg font-mono text-orange-400 text-sm">
              {settings.gen_top_p.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Nucleus sampling: considera solo i token che coprono il top-P% della probabilità cumulativa.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <History size={14} /> <span>Max Token Output</span>
          </label>
          <div className="flex items-center space-x-4">
            <input type="range" min="-1" max="8192" step="128"
              value={settings.gen_num_predict}
              onChange={e => setSettings({ ...settings, gen_num_predict: parseInt(e.target.value) })}
              className="flex-1 accent-orange-600" />
            <span className="bg-zinc-800/60 border border-zinc-600/60 w-16 text-center py-2 rounded-lg font-mono text-orange-400 text-sm">
              {settings.gen_num_predict === -1 ? '∞' : settings.gen_num_predict}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">Numero massimo di token generati per risposta. -1 = illimitato (dipende dal contesto del modello).</p>
        </div>

        <button onClick={saveSettings}
          className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-orange-900/10">
          <Save size={18} /><span>Salva Configurazioni</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full bg-[#1c1c22] text-zinc-100 antialiased overflow-hidden">
      {renderToasts()}
      
      {/* SIDEBAR SINISTRA */}
      <aside className="w-64 bg-[#222229] border-r border-zinc-700/50 flex flex-col shrink-0">
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-2 rounded-xl shadow-lg shadow-orange-900/50">
              <Layers size={20} />
            </div>
            <div>
              <span className="text-xl font-bold leading-tight block bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Efesto</span>
              <span className="text-[10px] text-zinc-500 leading-tight">Il fabbro degli Dei</span>
            </div>
          </div>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border mb-6 text-[11px] font-medium transition-all ${
            isBackendLive ? 'bg-green-500/5 border-green-500/15 text-green-400' : 'bg-red-500/5 border-red-500/20 text-red-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBackendLive ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]' : 'bg-red-500'}`} />
            {isBackendLive ? 'Backend Online' : 'Backend Offline'}
          </div>

          <button
            onClick={startNewChat}
            className="w-full mb-6 flex items-center justify-center space-x-2 bg-zinc-700/50 hover:bg-zinc-700/80 py-3 rounded-xl border border-zinc-600/60 hover:border-orange-500/30 transition-all group"
          >
            <Plus size={18} className="group-hover:text-orange-400 transition-colors" />
            <span className="text-sm font-semibold group-hover:text-zinc-200 transition-colors">Nuova Chat</span>
          </button>

          <nav className="mb-6 flex flex-col min-h-0">
            {/* Search input */}
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder="Cerca conversazioni..."
                className="w-full bg-zinc-700/40 border border-zinc-600/50 rounded-lg py-2 pl-8 pr-7 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/10 transition-all"
              />
              {sessionSearch && (
                <button
                  onClick={() => setSessionSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Label */}
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 px-1 flex items-center gap-2">
              {searchResults !== null
                ? <>{searchResults.length} risultati</>
                : 'Recenti'}
              {isSearching && <Loader2 size={10} className="animate-spin text-zinc-500" />}
            </p>

            {/* List */}
            <div className="space-y-0.5 overflow-y-auto max-h-[38vh] custom-scrollbar">
              {(searchResults !== null ? searchResults : sessions).map(s => (
                <div key={s.id} className={`group flex items-start rounded-lg border-l-2 -ml-px transition-all ${
                  currentSessionId === s.id && activeTab === 'chat'
                    ? 'bg-orange-600/15 border-orange-500'
                    : 'border-transparent hover:bg-zinc-700/40'
                }`}>
                  {editingSessionId === s.id ? (
                    <div className="flex items-center w-full px-3 py-2 gap-1.5">
                      <MessageSquare size={14} className="shrink-0 text-orange-400" />
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveSessionTitle(s.id, editingTitle);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        onBlur={() => saveSessionTitle(s.id, editingTitle)}
                        className="flex-1 bg-zinc-700/60 border border-zinc-600/60 rounded-md px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 min-w-0"
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => loadSession(s.id)}
                        className={`flex-1 flex items-start space-x-2.5 px-3 py-2.5 text-sm min-w-0 ${
                          currentSessionId === s.id && activeTab === 'chat' ? 'text-orange-400' : 'text-zinc-400 group-hover:text-zinc-200'
                        }`}
                      >
                        <MessageSquare size={14} className="mt-0.5 shrink-0" />
                        <div className="flex flex-col items-start min-w-0 w-full">
                          <span className="truncate w-full font-medium text-xs leading-snug">
                            {highlightMatch(s.title || 'Senza titolo', sessionSearch)}
                          </span>
                          {s.snippet && (
                            <span className="text-[10px] text-zinc-500 mt-0.5 leading-snug line-clamp-2 italic">
                              {highlightMatch(s.snippet, sessionSearch)}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-600 mt-0.5">{formatDateTime(s.created_at)}</span>
                        </div>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingSessionId(s.id); setEditingTitle(s.title || ''); }}
                        className="opacity-0 group-hover:opacity-100 p-2 mr-1 mt-1 text-zinc-600 hover:text-zinc-300 transition-all shrink-0"
                        title="Rinomina"
                      >
                        <Pencil size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {searchResults !== null && searchResults.length === 0 && !isSearching && (
                <p className="text-[11px] text-zinc-600 italic text-center py-4 px-2">
                  Nessuna conversazione trovata
                </p>
              )}
            </div>
          </nav>

          <div className="space-y-1 border-t border-zinc-700/40 pt-6">
            {[
              { tab: 'agents',   icon: <Bot        size={18} />, label: 'Agenti' },
              { tab: 'prompts',  icon: <BookOpen   size={18} />, label: 'Prompt Library' },
              { tab: 'db',       icon: <Database   size={18} />, label: 'Sistema RAG' },
              { tab: 'workflow', icon: <GitBranch  size={18} />, label: 'Workflow' },
              { tab: 'mcp',      icon: <Plug       size={18} />, label: 'MCP' },
              { tab: 'tools',    icon: <Hammer     size={18} />, label: 'Strumenti' },
              { tab: 'settings', icon: <Settings   size={18} />, label: 'Impostazioni' },
            ].map(({ tab, icon, label }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all ${
                  activeTab === tab ? 'bg-orange-600/15 text-orange-400' : 'text-zinc-400 hover:bg-zinc-700/40 hover:text-zinc-200'
                }`}
              >
                {icon} <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

      </aside>

      {/* AREA CONTENUTO PRINCIPALE */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-8 border-b border-zinc-700/40 bg-[#1e1e26]/80 backdrop-blur-sm shrink-0">
          {activeTab === 'workflow' && openWorkflow && (
            <button onClick={() => setOpenWorkflow(null)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mr-3">
              <ChevronRight size={14} className="rotate-180" /> Tutti i workflow
            </button>
          )}
          <h2 className="text-sm font-semibold text-zinc-300 tracking-wide">
            {activeTab === 'chat' ? (currentSessionId ? "Conversazione" : "Nuova Conversazione") :
             activeTab === 'settings' ? "Impostazioni" :
             activeTab === 'tools' ? "Strumenti" :
             activeTab === 'mcp' ? "MCP Servers" :
             activeTab === 'agents' ? "Agenti" :
             activeTab === 'prompts' ? "Prompt Library" :
             activeTab === 'workflow' ? (openWorkflow ? openWorkflow.name : "Workflow") :
             "Knowledge Base"}
          </h2>
          {activeTab === 'chat' && (
            <div className="flex items-center space-x-2">
            {messages.length > 0 && (
              <button
                onClick={handleExportChat}
                title="Esporta chat in Markdown"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-zinc-600/60 bg-zinc-700/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/70 text-xs font-medium transition-all"
              >
                <Download size={13} />
                <span>Esporta</span>
              </button>
            )}
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setIsModelDropdownOpen(o => !o)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  isModelDropdownOpen
                    ? 'bg-zinc-700/80 border-orange-500/40 text-zinc-200'
                    : 'bg-zinc-700/50 border-zinc-600/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/70'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                  runningModels.some(r => r === selectedModel || r.startsWith(selectedModel?.split(':')[0]))
                    ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]'
                    : 'bg-zinc-500'
                }`} />
                <span className="max-w-[180px] truncate">{selectedModel || 'Seleziona modello'}</span>
                <ChevronDown size={13} className={`text-zinc-400 transition-transform shrink-0 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#222229] border border-zinc-700/60 rounded-xl shadow-xl shadow-black/40 overflow-hidden z-50">
                  <div className="px-3 pt-2.5 pb-1.5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Modelli disponibili</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar pb-1.5">
                    {models.map(m => {
                      const isSelected = selectedModel === m;
                      return (
                        <button
                          key={m}
                          onClick={() => { setSelectedModel(m); setIsModelDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors ${
                            isSelected
                              ? 'text-orange-400 bg-orange-600/10'
                              : 'text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100'
                          }`}
                        >
                          <span className="truncate font-mono text-xs flex-1 text-left">{m}</span>
                          {isSelected && <Check size={13} className="text-orange-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            </div>
          )}
        </header>

        <div className={`flex-1 min-h-0 ${activeTab === 'workflow' && openWorkflow ? 'overflow-hidden flex flex-col' : 'overflow-y-auto custom-scrollbar'}`}>
          {activeTab === 'chat' ? (
            <div className="p-8 space-y-6 max-w-5xl mx-auto">
              {messages.length === 0 && !isLoading && (
                <div className="h-[60vh] flex flex-col items-center justify-center">
                  <div className="bg-orange-600/10 border border-orange-600/20 p-6 rounded-3xl mb-5 shadow-lg shadow-orange-900/10">
                    <Layers size={40} className="text-orange-500/70" />
                  </div>
                  <h3 className="text-xl font-semibold text-zinc-300 mb-1.5">
                    Ciao, <span className="text-orange-400">{settings.user_name || 'Amico'}</span>!
                  </h3>
                  <p className="text-zinc-500 text-sm">Come posso aiutarti oggi?</p>
                </div>
              )}
              {messages.filter(msg => msg.role !== 'tool').map((msg, i) => {
                // Messaggio assistant senza contenuto: solo tool_calls → mostra tag compatto
                if (msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) {
                  return (
                    <div key={i} className="flex items-center space-x-2 pl-12">
                      {msg.tool_calls.map((tc, j) => {
                        const name = tc.function?.name || '?';
                        const args = tc.function?.arguments || {};
                        const firstArg = Object.values(args)[0];
                        return (
                          <span key={j} className="inline-flex items-center space-x-1.5 bg-zinc-700/50 border border-zinc-600/60 text-zinc-300 text-[11px] font-mono px-3 py-1 rounded-full">
                            <Hammer size={11} className="text-orange-500 shrink-0" />
                            <span className="text-orange-400">{name}</span>
                            {firstArg && (
                              <span className="text-zinc-600 truncate max-w-[200px]">"{String(firstArg)}"</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                }

                const isStreamingThis = isLoading && i === messages.filter(m => m.role !== 'tool').length - 1;
                const artifact = msg.role === 'assistant' ? extractArtifact(msg.content) : null;

                return (
                <React.Fragment key={i}>
                  <div className={`flex items-start space-x-4 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    {msg.role === 'assistant' ? (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={avatarGradientStyle(msg.agent_color)}>
                        <Layers size={15} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-600/80">
                        <span className="text-[10px] font-bold text-zinc-200">{(settings.user_name?.[0] || 'IO').toUpperCase()}</span>
                      </div>
                    )}
                    <div className={`max-w-[80%] flex flex-col space-y-2`}>
                      {msg.role === 'assistant' && (
                        <p className="text-[10px] font-semibold text-zinc-500 px-1">
                          {msg.agent_name ?? 'Efesto'}
                        </p>
                      )}
                      {msg.role === 'assistant' && msg.thinking && (
                        <div className="bg-zinc-700/30 border border-zinc-600/40 rounded-xl overflow-hidden">
                          <button
                            onClick={() => toggleThinking(i)}
                            className="w-full flex items-center space-x-2 px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider font-bold"
                          >
                            <Brain size={11} className="text-orange-500/40" />
                            <span>Ragionamento</span>
                            <span className="ml-auto">
                              {expandedThinking[i] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            </span>
                          </button>
                          {expandedThinking[i] && (
                            <div className="px-3 pb-3 text-[11px] text-zinc-400 italic border-t border-zinc-600/30 pt-2 whitespace-pre-wrap leading-relaxed">
                              {msg.thinking}
                            </div>
                          )}
                        </div>
                      )}
                      <div
                        className={`p-4 rounded-2xl relative group border shadow-sm ${msg.role === 'assistant' ? '' : 'border-orange-500/25'}`}
                        style={msg.role === 'assistant'
                          ? (msg.agent_color ? bubbleStyle(msg.agent_color) : { background: 'rgba(39,39,42,0.6)', borderColor: 'rgba(63,63,70,0.6)' })
                          : { background: 'linear-gradient(135deg, rgba(234,88,12,0.12), rgba(154,52,18,0.08))' }
                        }
                      >
                        <div className={`prose prose-sm prose-invert max-w-none ${isStreamingThis && !msg.content ? '' : ''}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]}>
                            {msg.content || (isStreamingThis ? "" : "")}
                          </ReactMarkdown>
                          {isStreamingThis && <span className="streaming-cursor" />}
                        </div>
                        <span className="absolute bottom-2 right-3 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatTime(msg.created_at)}
                        </span>
                        {msg.content && !isStreamingThis && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              setCopiedMsgIdx(i);
                              setTimeout(() => setCopiedMsgIdx(null), 2000);
                            }}
                            title="Copia messaggio"
                            className="absolute top-2 right-2 p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-600/40 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            {copiedMsgIdx === i
                              ? <Check size={13} className="text-green-400" />
                              : <Copy size={13} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {artifact && renderArtifactCard(artifact, i, isStreamingThis)}
                </React.Fragment>
              )})}
              {isLoading && !messages[messages.length-1]?.content && !messages[messages.length-1]?.thinking && (
                <div className="flex items-center space-x-3 pl-12">
                  <div className="flex space-x-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-500/50"
                        style={{ animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                  <span className="text-xs text-zinc-600">Efesto sta riflettendo...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : activeTab === 'settings' ? (
            <div className="p-12">{renderSettings()}</div>
          ) : activeTab === 'db' ? (
            <div className="p-12">{renderDatabase()}</div>
          ) : activeTab === 'tools' ? (
            <div className="p-12">{renderTools()}</div>
          ) : activeTab === 'agents' ? (
            <div className="p-12">
              <Suspense fallback={<div className="flex items-center justify-center py-12 text-zinc-600 text-sm">Caricamento...</div>}>
                <AgentsPanel models={models} />
              </Suspense>
            </div>
          ) : activeTab === 'prompts' ? (
            <div className="p-12">
              <Suspense fallback={<div className="flex items-center justify-center py-12 text-zinc-600 text-sm">Caricamento...</div>}>
                <PromptLibrary />
              </Suspense>
            </div>
          ) : activeTab === 'mcp' ? (
            <div className="p-12">
              <Suspense fallback={<div className="flex items-center justify-center py-12 text-zinc-600 text-sm">Caricamento...</div>}>
                <McpPanel />
              </Suspense>
            </div>
          ) : activeTab === 'workflow' ? (
            <Suspense fallback={<div className="h-full flex items-center justify-center text-zinc-600 text-sm">Caricamento...</div>}>
              {openWorkflow ? (
                <WorkflowEditor
                  workflow={openWorkflow}
                  models={models}
                  selectedModel={selectedModel}
                  addToast={addToast}
                  onSaved={fetchWorkflows}
                  onRenamed={updated => {
                    setWorkflows(prev => prev.map(w => w.id === updated.id ? updated : w));
                    setOpenWorkflow(updated);
                  }}
                />
              ) : (
                <div className="p-12">
                  <WorkflowList
                    workflows={workflows}
                    onOpen={wf => setOpenWorkflow(wf)}
                    onCreate={createWorkflow}
                    onDelete={id => setWorkflows(prev => prev.filter(w => w.id !== id))}
                    onRename={updated => setWorkflows(prev => prev.map(w => w.id === updated.id ? updated : w))}
                  />
                </div>
              )}
            </Suspense>
          ) : (
            <div className="p-12 text-center text-zinc-500 italic">Tab in fase di sviluppo...</div>
          )}
        </div>

        {activeTab === 'chat' && (
          <div className="p-8 shrink-0">
            <div className="max-w-4xl mx-auto relative flex items-end">
              {/* Chat tool panel — pulsante + unico espandibile */}
              <div className="absolute left-3 bottom-3 z-10 flex items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => { setChatPanel(p => p ? null : 'menu'); setPromptSearch(''); }}
                    title="Strumenti chat"
                    className={`w-7 h-7 flex items-center justify-center rounded-xl border transition-all ${
                      chatPanel
                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                        : 'bg-zinc-700/50 border-zinc-600/40 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-300'
                    }`}
                  >
                    <Plus size={14} className={`transition-transform duration-200 ${chatPanel ? 'rotate-45' : ''}`} />
                  </button>

                  {chatPanel && (
                    <>
                      <div className="fixed inset-0" onClick={() => setChatPanel(null)} />
                      <div className="absolute bottom-full mb-2 left-0 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-xl shadow-black/50 w-64 overflow-hidden z-20">

                        {/* Header con breadcrumb */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/40 bg-zinc-800/60">
                          {chatPanel !== 'menu' && (
                            <button onClick={() => setChatPanel('menu')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                              <ChevronRight size={13} className="rotate-180" />
                            </button>
                          )}
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {chatPanel === 'menu' ? 'Strumenti' : chatPanel === 'agents' ? 'Agente' : 'Prompt Library'}
                          </span>
                        </div>

                        {/* Menu principale */}
                        {chatPanel === 'menu' && (
                          <div className="py-1">
                            {agents.length > 0 && (
                              <button
                                onClick={() => setChatPanel('agents')}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-zinc-800/60 transition-colors text-left group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-6 h-6 rounded-lg bg-zinc-700/60 flex items-center justify-center">
                                    <Bot size={12} className="text-zinc-400 group-hover:text-zinc-200" />
                                  </div>
                                  <span className="text-zinc-300">Agente</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {activeAgent && (
                                    <span className="text-[10px] text-zinc-500 max-w-[80px] truncate">{activeAgent.name}</span>
                                  )}
                                  <ChevronRight size={11} className="text-zinc-600" />
                                </div>
                              </button>
                            )}
                            <button
                              onClick={() => { setChatPanel('prompts'); setPromptSearch(''); }}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-zinc-800/60 transition-colors text-left group"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-lg bg-zinc-700/60 flex items-center justify-center">
                                  <BookOpen size={12} className="text-zinc-400 group-hover:text-zinc-200" />
                                </div>
                                <span className="text-zinc-300">Prompt Library</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {prompts.length > 0 && (
                                  <span className="text-[10px] text-zinc-600">{prompts.length}</span>
                                )}
                                <ChevronRight size={11} className="text-zinc-600" />
                              </div>
                            </button>
                          </div>
                        )}

                        {/* Sub-panel: Agenti */}
                        {chatPanel === 'agents' && (
                          <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                            <button
                              onClick={() => { setActiveAgent(null); setChatPanel(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-800/60 transition-colors text-left ${!activeAgent ? 'text-orange-400 font-medium' : 'text-zinc-400'}`}
                            >
                              <Bot size={11} />
                              <span>Efesto (globale)</span>
                              {!activeAgent && <Check size={11} className="ml-auto" />}
                            </button>
                            <div className="border-t border-zinc-700/40 my-1" />
                            {agents.map(a => (
                              <button
                                key={a.id}
                                onClick={() => { setActiveAgent(a); setChatPanel(null); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-800/60 transition-colors text-left ${activeAgent?.id === a.id ? 'text-orange-400 font-medium' : 'text-zinc-300'}`}
                              >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getAgentColor(a.color).from }} />
                                <span className="truncate">{a.name}</span>
                                {activeAgent?.id === a.id && <Check size={11} className="ml-auto shrink-0" />}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Sub-panel: Prompt */}
                        {chatPanel === 'prompts' && (
                          <>
                            <div className="p-2 border-b border-zinc-700/40">
                              <div className="relative">
                                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                  autoFocus
                                  className="w-full bg-zinc-800/60 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-orange-500/40 placeholder:text-zinc-600"
                                  placeholder="Cerca prompt..."
                                  value={promptSearch}
                                  onChange={e => setPromptSearch(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto custom-scrollbar">
                              {prompts.filter(p => {
                                const q = promptSearch.toLowerCase();
                                return !q || p.title.toLowerCase().includes(q) || p.tags.toLowerCase().includes(q);
                              }).length === 0 ? (
                                <div className="py-6 text-center">
                                  <p className="text-[11px] text-zinc-600 italic">
                                    {prompts.length === 0 ? 'Nessun prompt salvato.' : 'Nessun risultato.'}
                                  </p>
                                  {prompts.length === 0 && (
                                    <button
                                      onClick={() => { setChatPanel(null); setActiveTab('prompts'); }}
                                      className="mt-2 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                                    >
                                      Vai alla Prompt Library →
                                    </button>
                                  )}
                                </div>
                              ) : (
                                prompts.filter(p => {
                                  const q = promptSearch.toLowerCase();
                                  return !q || p.title.toLowerCase().includes(q) || p.tags.toLowerCase().includes(q);
                                }).map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      setInputText(p.content);
                                      setChatPanel(null);
                                      setTimeout(() => {
                                        if (textareaRef.current) {
                                          textareaRef.current.style.height = 'auto';
                                          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                                          textareaRef.current.focus();
                                        }
                                      }, 0);
                                    }}
                                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-800/60 transition-colors border-b border-zinc-700/20 last:border-0"
                                  >
                                    <p className="text-xs font-medium text-zinc-200 truncate">{p.title}</p>
                                    {p.tags && <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{p.tags}</p>}
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Pill agente attivo */}
                {activeAgent && (
                  <button
                    onClick={() => { setChatPanel('agents'); setPromptSearch(''); }}
                    className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-xl border text-[11px] font-medium transition-all hover:brightness-110"
                    style={{
                      background: `${getAgentColor(activeAgent.color).from}18`,
                      borderColor: `${getAgentColor(activeAgent.color).from}50`,
                      color: getAgentColor(activeAgent.color).from,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getAgentColor(activeAgent.color).from }} />
                    <span className="max-w-[80px] truncate">{activeAgent.name}</span>
                    <span
                      onClick={e => { e.stopPropagation(); setActiveAgent(null); }}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X size={10} />
                    </span>
                  </button>
                )}
              </div>

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                  e.target.style.overflowY = e.target.scrollHeight > 200 ? 'auto' : 'hidden';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Invia un messaggio a Efesto..."
                style={{ resize: 'none', maxHeight: '200px', overflowY: 'hidden' }}
                className={`w-full bg-zinc-800/70 border border-zinc-700/60 rounded-2xl py-4 pr-14 outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 transition-all shadow-xl shadow-black/30 placeholder:text-zinc-500 custom-scrollbar ${activeAgent ? 'pl-[12rem]' : 'pl-[3rem]'}`}
              />
              {isLoading ? (
                <button
                  onClick={handleStopStreaming}
                  className="absolute right-3 bottom-3 bg-zinc-600/80 hover:bg-red-700/80 p-2.5 rounded-xl transition-all shadow-lg group"
                  title="Interrompi generazione"
                >
                  <Square size={18} className="text-zinc-300 group-hover:text-red-300 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  className="absolute right-3 bottom-3 bg-gradient-to-br from-orange-500 to-orange-700 p-2.5 rounded-xl hover:from-orange-400 hover:to-orange-600 transition-all shadow-lg shadow-orange-900/40"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* SIDEBAR DESTRA — processo in tempo reale */}
      {activeTab === 'chat' && (
        <aside className="w-48 bg-[#20202a] border-l border-zinc-700/40 flex flex-col shrink-0">
          <div className="h-14 px-4 border-b border-zinc-700/40 flex items-center gap-2 min-w-0">
            <Zap size={12} className="text-orange-500 shrink-0" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Processo</span>
            {activeAgent && (
              <div className="ml-auto flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: getAgentColor(activeAgent.color).from }}
                />
                <span className="text-[10px] text-zinc-400 font-medium truncate">{activeAgent.name}</span>
              </div>
            )}
          </div>

          {/* Token stats */}
          {tokenStats.count > 0 && (
            <div className={`mx-3 mt-3 px-3 py-2 rounded-xl border text-[11px] transition-all ${
              tokenStats.active
                ? 'bg-orange-500/5 border-orange-500/20'
                : 'bg-zinc-800/40 border-zinc-700/40'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-zinc-500 font-medium">Velocità</span>
                <span className={`font-mono font-bold ${tokenStats.active ? 'text-orange-400' : 'text-zinc-400'}`}>
                  {tokenStats.rate != null ? `${tokenStats.rate.toFixed(1)} tok/s` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Token</span>
                <span className="font-mono text-zinc-400">{tokenStats.count}</span>
              </div>
              {!tokenStats.active && tokenStats.elapsed != null && (
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-700/40">
                  <span className="text-zinc-600 font-medium">Durata</span>
                  <span className="font-mono text-zinc-500">{tokenStats.elapsed.toFixed(1)}s</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0">
            {processingSteps.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic text-center mt-8 leading-relaxed px-2">
                In attesa di un messaggio...
              </p>
            ) : (
              <div>
                {processingSteps.map((step, idx) => {
                  const cfg = STEP_CONFIG[step.type] || STEP_CONFIG.generating;
                  const Icon = cfg.Icon;
                  const isActive = step.status === 'active';
                  const isDone = step.type === 'done';
                  const isLast = idx === processingSteps.length - 1;
                  return (
                    <div key={step.id} className="flex items-start space-x-2">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center mt-0.5 transition-all ${
                          isActive
                            ? 'bg-orange-500/20 ring-1 ring-orange-400/40'
                            : isDone
                              ? 'bg-green-500/15'
                              : 'bg-zinc-700/50'
                        }`}>
                          {isActive ? (
                            <Loader2 size={11} className="animate-spin text-orange-400" />
                          ) : isDone ? (
                            <CheckCircle2 size={11} className="text-green-500" />
                          ) : (
                            <Icon size={11} className="text-zinc-600" />
                          )}
                        </div>
                        {!isLast && <div className="w-px mt-0.5 mb-0.5" style={{ minHeight: '14px', background: 'linear-gradient(to bottom, #27272a, transparent)' }} />}
                      </div>
                      <div className="pb-2.5 min-w-0 flex-1">
                        <p className={`text-[11px] font-medium leading-tight ${
                          isActive ? 'text-orange-300' :
                          isDone   ? 'text-green-400/80' :
                                     'text-zinc-400'
                        }`}>{step.label}</p>
                        {step.detail && (
                          <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modelli in memoria */}
          <div className="border-t border-zinc-700/40 p-3 shrink-0">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">In memoria</p>
            {runningModels.length === 0 ? (
              <p className="text-[11px] text-zinc-600 italic px-1">Nessun modello attivo</p>
            ) : (
              <div className="space-y-1.5">
                {runningModels.map(m => (
                  <div key={m} className="flex items-center gap-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)] flex-shrink-0" />
                    <span className="text-[11px] font-mono text-green-300/80 truncate">{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

    </div>
  );
};

export default App;
