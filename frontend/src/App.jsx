import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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
  AlertCircle
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
  });

  // RAG States
  const [knowledgeBase, setKnowledgeBase] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({ status: 'idle', message: '' });
  const fileInputRef = useRef(null);

  // Tools state
  const [tools, setTools] = useState([]);
  
  const messagesEndRef = useRef(null);

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
  }, []);

  useEffect(() => {
    if (activeTab === 'db') {
      fetchKnowledgeBase();
    }
  }, [activeTab]);

  useEffect(() => {
    if (models.length > 0 && settings.rag_embedding_model && !models.includes(settings.rag_embedding_model)) {
      setSettings(s => ({ ...s, rag_embedding_model: models[0] }));
    }
  }, [models, settings.rag_embedding_model]);

  const fetchModels = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ollama/list`);
      setModels(res.data.models || []);
      if (res.data.models?.length > 0) setSelectedModel(res.data.models[0]);
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
      alert('Impostazioni salvate con successo!');
    } catch (err) { console.error(err); alert('Errore nel salvataggio.'); }
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
    } catch (err) {
      alert('Errore durante la rimozione del documento.');
      console.error(err);
    }
  };

  const handleResetKnowledge = async () => {
    if (!confirm('Svuotare tutta la Knowledge Base? L\'operazione non è reversibile.')) return;
    try {
      await axios.delete(`${API_BASE}/knowledge`);
      fetchKnowledgeBase();
    } catch (err) {
      alert('Errore durante il reset della Knowledge Base.');
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

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedModel || isLoading) return;

    const userMsg = { role: 'user', content: inputText, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    const textToSend = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          message: textToSend,
          session_id: currentSessionId
        })
      });

      if (!response.ok) throw new Error('Errore di comunicazione');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantMsg = { 
        role: 'assistant', 
        content: '', 
        thinking: '', 
        created_at: new Date().toISOString() 
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
            if (data.error) {
              assistantMsg.content += `\nErrore: ${data.error}`;
            } else {
              if (data.content) assistantMsg.content += data.content;
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
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Errore di comunicazione." }]);
    } finally {
      setIsLoading(false);
    }
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : `${dateStr}Z`;
    return new Date(normalized).toLocaleString('it-IT', { 
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
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
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt,.md,.pdf,.docx,.csv,.json,.html,.htm"
          />
          {knowledgeBase.length > 0 && (
            <button
              onClick={handleResetKnowledge}
              className="bg-zinc-800 hover:bg-red-900/50 border border-zinc-700 hover:border-red-700/50 text-zinc-400 hover:text-red-400 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm"
            >
              <Trash2 size={16} />
              <span>Svuota tutto</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current.click()}
            className="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all text-sm"
          >
            <Upload size={16} />
            <span>Carica Documento</span>
          </button>
        </div>
      </div>

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

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Documenti Indicizzati</h4>
        </div>
        
        <div className="divide-y divide-zinc-800 max-h-[500px] overflow-y-auto custom-scrollbar">
          {knowledgeBase.length === 0 ? (
            <div className="p-12 text-center text-zinc-600 italic">
              Nessun documento presente nella Knowledge Base.
            </div>
          ) : (
            knowledgeBase.map((doc, idx) => (
              <div key={idx} className="p-4 hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                <div className="flex items-center space-x-4 min-w-0">
                  <div className="bg-zinc-800 p-2.5 rounded-lg text-orange-500/70">
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
                  <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded-md whitespace-nowrap">
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
              <div className="border-t border-zinc-800 px-6 py-4">
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">Parametri</p>
                <div className="space-y-2">
                  {Object.entries(tool.parameters.properties).map(([param, schema]) => (
                    <div key={param} className="flex items-start space-x-3">
                      <code className="text-xs font-mono text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
                        {param}
                      </code>
                      <span className="text-[10px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded shrink-0">
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

      <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <User size={14} /> <span>Il tuo Nome</span>
          </label>
          <input 
            type="text" 
            value={settings.user_name}
            onChange={(e) => setSettings({...settings, user_name: e.target.value})}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all"
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
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all resize-none"
            placeholder="Istruzioni globali per l'AI..."
          />
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
            <span className="bg-zinc-950 border border-zinc-800 w-12 text-center py-2 rounded-lg font-mono text-orange-500">
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

      <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
            <Cpu size={14} /> <span>Modello di Embedding</span>
          </label>
          <select
            value={settings.rag_embedding_model}
            onChange={(e) => setSettings({ ...settings, rag_embedding_model: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 outline-none focus:border-orange-500/50 transition-all"
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
            <span className="bg-zinc-950 border border-zinc-800 w-16 text-center py-2 rounded-lg font-mono text-orange-500 text-sm">
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
            <span className="bg-zinc-950 border border-zinc-800 w-12 text-center py-2 rounded-lg font-mono text-orange-500">
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
            <span className="bg-zinc-950 border border-zinc-800 w-12 text-center py-2 rounded-lg font-mono text-orange-500">
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
    </div>
  );

  return (
    <div className="flex h-full w-full bg-[#09090b] text-zinc-100 antialiased overflow-hidden">
      
      {/* SIDEBAR SINISTRA */}
      <aside className="w-64 bg-[#111113] border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-8">
            <div className="bg-orange-600 p-2 rounded-lg"><Layers size={20} /></div>
            <span className="text-xl font-bold">Efesto</span>
          </div>

          <button 
            onClick={startNewChat}
            className="w-full mb-6 flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl border border-zinc-700 transition-all"
          >
            <Plus size={18} />
            <span className="text-sm font-semibold">Nuova Chat</span>
          </button>

          <nav className="space-y-1 overflow-y-auto max-h-[40vh] mb-6 custom-scrollbar">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2 px-4">Recenti</p>
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`w-full flex items-start space-x-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                  currentSessionId === s.id && activeTab === 'chat' ? 'bg-orange-600/10 text-orange-500' : 'text-zinc-500 hover:bg-zinc-900'
                }`}
              >
                <MessageSquare size={16} className="mt-1 shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="truncate w-full font-medium">{s.title}</span>
                  <span className="text-[10px] text-zinc-600">
                    {formatDateTime(s.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </nav>

          <div className="space-y-1 border-t border-zinc-800 pt-6">
            {[
              { tab: 'db',       icon: <Database size={18} />, label: 'Database' },
              { tab: 'tools',    icon: <Hammer size={18} />,   label: 'Strumenti' },
              { tab: 'settings', icon: <Settings size={18} />, label: 'Impostazioni' },
            ].map(({ tab, icon, label }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all ${
                  activeTab === tab ? 'bg-zinc-900 text-orange-500' : 'text-zinc-500 hover:bg-zinc-900'
                }`}
              >
                {icon} <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-6">
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 flex items-center space-x-3">
             <div className={`w-2 h-2 rounded-full ${isBackendLive ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-red-500'}`} />
             <span className="text-xs text-zinc-400">{isBackendLive ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </aside>

      {/* AREA CONTENUTO PRINCIPALE */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-8 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold">
            {activeTab === 'chat' ? (currentSessionId ? "Dettaglio Chat" : "Nuova Conversazione") :
             activeTab === 'settings' ? "Impostazioni" :
             activeTab === 'tools' ? "Strumenti" : "Knowledge Base"}
          </h2>
          {activeTab === 'chat' && (
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-orange-500/50 transition-all"
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'chat' ? (
            <div className="p-8 space-y-6 max-w-5xl mx-auto">
              {messages.length === 0 && !isLoading && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-zinc-600 opacity-50">
                   <Layers size={48} className="mb-4" />
                   <p>Ciao {settings.user_name || 'Amico'}! Come posso aiutarti oggi?</p>
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
                          <span key={j} className="inline-flex items-center space-x-1.5 bg-zinc-900 border border-zinc-700 text-zinc-400 text-[11px] font-mono px-3 py-1 rounded-full">
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

                return (
                <div key={i} className={`flex items-start space-x-4 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'assistant' ? 'bg-orange-600 shadow-orange-900/20' : 'bg-zinc-700 shadow-black/20'}`}>
                    {msg.role === 'assistant' ? <Layers size={16} /> : <span className="text-[10px] font-bold">IO</span>}
                  </div>
                  <div className={`max-w-[80%] flex flex-col space-y-2`}>
                    {msg.role === 'assistant' && msg.thinking && (
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                        <button 
                          onClick={() => toggleThinking(i)}
                          className="w-full flex items-center space-x-2 px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider font-bold"
                        >
                          <Brain size={12} className="text-orange-500/50" />
                          <span>Ragionamento</span>
                          {expandedThinking[i] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        {expandedThinking[i] && (
                          <div className="px-3 pb-3 text-xs text-zinc-500 italic border-t border-zinc-800/50 pt-2 whitespace-pre-wrap leading-relaxed">
                            {msg.thinking}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`p-4 rounded-2xl relative group shadow-sm ${msg.role === 'assistant' ? 'bg-zinc-900 border border-zinc-800' : 'bg-orange-600/10 border border-orange-600/20'}`}>
                      <div className={`prose prose-sm prose-invert max-w-none`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]}>
                          {msg.content || (isLoading && i === messages.length - 1 ? "..." : "")}
                        </ReactMarkdown>
                      </div>
                      <span className="absolute bottom-2 right-3 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )})}
              {isLoading && !messages[messages.length-1]?.content && !messages[messages.length-1]?.thinking && (
                <div className="flex items-center space-x-2 text-zinc-500 text-xs animate-pulse pl-12">
                  <Loader2 className="animate-spin" size={14} /> <span>Efesto sta riflettendo...</span>
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
          ) : (
            <div className="p-12 text-center text-zinc-500 italic">Tab in fase di sviluppo...</div>
          )}
        </div>

        {activeTab === 'chat' && (
          <div className="p-8 shrink-0">
            <div className="max-w-4xl mx-auto relative flex items-center">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Invia un messaggio a Efesto..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 px-6 pr-14 outline-none focus:border-zinc-600 transition-all shadow-2xl shadow-black/50"
              />
              <button 
                onClick={handleSendMessage}
                className="absolute right-3 bg-orange-600 p-2.5 rounded-xl hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/20"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
