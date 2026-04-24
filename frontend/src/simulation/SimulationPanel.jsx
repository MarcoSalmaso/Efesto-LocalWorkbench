import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FlaskConical, Plus, Trash2, Copy, Play, Square, ChevronLeft,
  Loader2, CheckCircle2, Clock, AlertCircle, Users, RotateCcw,
  Pencil, Check, X, ChevronUp, ChevronDown, Bot, Zap,
} from 'lucide-react';

const API = 'http://localhost:8006';

const AGENT_COLORS = [
  '#8b5cf6', '#3b82f6', '#22c55e', '#f97316',
  '#ec4899', '#06b6d4', '#eab308', '#ef4444',
];

function agentColor(idx) { return AGENT_COLORS[idx % AGENT_COLORS.length]; }

function StatusBadge({ status }) {
  if (status === 'running') return (
    <span className="flex items-center gap-1 text-[10px] text-orange-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" /> In corso
    </span>
  );
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
      <CheckCircle2 size={11} /> Completata
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
      <Clock size={11} /> Bozza
    </span>
  );
}

// ── Agent Modal ──────────────────────────────────────────────────────────────

function AgentModal({ agent, models, onSave, onClose }) {
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || '');
  const [model, setModel] = useState(agent?.model || '');
  const [saving, setSaving] = useState(false);

  const isNew = !agent?.id;

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), role: role.trim(), system_prompt: systemPrompt.trim(), model: model || null });
      onClose();
    } finally { setSaving(false); }
  };

  const field = "w-full bg-zinc-900/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">{isNew ? 'Nuovo agente' : 'Modifica agente'}</h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Nome *</label>
              <input className={field} value={name} onChange={e => setName(e.target.value)} placeholder="Mario Rossi" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Ruolo</label>
              <input className={field} value={role} onChange={e => setRole(e.target.value)} placeholder="CEO" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">System Prompt</label>
            <textarea className={`${field} resize-none font-mono text-xs`} rows={6}
              value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Sei [Nome], [Ruolo] di [Organizzazione]. Il tuo obiettivo è... Le tue priorità sono... Il tuo stile comunicativo è..." />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Modello <span className="normal-case font-normal text-zinc-600">(opzionale — sovrascrive il globale)</span></label>
            <select className={field} value={model} onChange={e => setModel(e.target.value)}>
              <option value="">— usa modello globale —</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">Annulla</button>
          <button onClick={submit} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salva
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Simulation Editor ────────────────────────────────────────────────────────

function SimulationEditor({ simId, models, onBack }) {
  const [sim, setSim] = useState(null);
  const [agents, setAgents] = useState([]);
  const [turns, setTurns] = useState([]);
  const [activeTab, setActiveTab] = useState('mondo');
  const [agentModal, setAgentModal] = useState(null); // null | { agent? }
  const [running, setRunning] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [streamTurns, setStreamTurns] = useState([]); // live turns during run
  const [streamAnalysis, setStreamAnalysis] = useState('');
  const [currentAgent, setCurrentAgent] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const bottomRef = useRef(null);
  const esRef = useRef(null);

  const load = useCallback(async () => {
    const [sRes, aRes, tRes] = await Promise.all([
      fetch(`${API}/simulations/${simId}`),
      fetch(`${API}/simulations/${simId}/agents`),
      fetch(`${API}/simulations/${simId}/turns`),
    ]);
    setSim(await sRes.json());
    setAgents(await aRes.json());
    setTurns(await tRes.json());
  }, [simId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamTurns, streamAnalysis]);

  const patch = async (data) => {
    const res = await fetch(`${API}/simulations/${simId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    const updated = await res.json();
    setSim(updated);
  };

  const handleRun = async () => {
    setRunning(true);
    setStreamTurns([]);
    setCurrentAgent(null);
    setCurrentRound(0);
    setActiveTab('simulazione');

    let currentTurn = null;

    const res = await fetch(`${API}/simulations/${simId}/run`, { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'round_start') setCurrentRound(ev.round);
          if (ev.type === 'agent_start') {
            setCurrentAgent({ id: ev.agent_id, name: ev.agent_name, role: ev.role });
            currentTurn = { round: ev.round, agentId: ev.agent_id, agentName: ev.agent_name, role: ev.role, content: '' };
            setStreamTurns(prev => [...prev, currentTurn]);
          }
          if (ev.type === 'token' && currentTurn) {
            currentTurn.content += ev.content;
            setStreamTurns(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...currentTurn };
              return updated;
            });
          }
          if (ev.type === 'agent_end') setCurrentAgent(null);
          if (ev.type === 'complete') { setRunning(false); load(); }
          if (ev.type === 'error') { setRunning(false); load(); }
        } catch {}
      }
    }
    setRunning(false);
  };

  const handleAnalyze = async () => {
    setAnalysisLoading(true);
    setStreamAnalysis('');
    setActiveTab('analisi');

    const res = await fetch(`${API}/simulations/${simId}/analyze`, { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'token') setStreamAnalysis(prev => prev + ev.content);
          if (ev.type === 'complete') { setAnalysisLoading(false); load(); }
          if (ev.type === 'error') setAnalysisLoading(false);
        } catch {}
      }
    }
    setAnalysisLoading(false);
  };

  const handleSaveAgent = async (data) => {
    if (agentModal?.agent?.id) {
      await fetch(`${API}/simulations/${simId}/agents/${agentModal.agent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
    } else {
      await fetch(`${API}/simulations/${simId}/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, order: agents.length }),
      });
    }
    const res = await fetch(`${API}/simulations/${simId}/agents`);
    setAgents(await res.json());
  };

  const handleDeleteAgent = async (agentId) => {
    await fetch(`${API}/simulations/${simId}/agents/${agentId}`, { method: 'DELETE' });
    setAgents(prev => prev.filter(a => a.id !== agentId));
  };

  const handleReorder = async (newAgents) => {
    setAgents(newAgents);
    await fetch(`${API}/simulations/${simId}/agents/reorder`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAgents.map(a => a.id)),
    });
  };

  const moveAgent = (idx, dir) => {
    const next = [...agents];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    handleReorder(next);
  };

  if (!sim) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="text-zinc-600 animate-spin" /></div>;

  const canRun = sim.world_prompt.trim() && sim.trigger_event.trim() && agents.length > 0;
  const displayTurns = running ? streamTurns : turns;

  const tabs = [
    { id: 'mondo', label: 'Mondo' },
    { id: 'agenti', label: `Agenti (${agents.length})` },
    { id: 'simulazione', label: 'Simulazione' },
    { id: 'analisi', label: 'Analisi' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <EditableTitle value={sim.name} onSave={name => patch({ name })} />
          <div className="mt-0.5"><StatusBadge status={sim.status} /></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sim.status === 'completed' && (
            <button onClick={handleAnalyze} disabled={analysisLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-700/60 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700 transition-all disabled:opacity-50">
              {analysisLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Analizza
            </button>
          )}
          <button onClick={handleRun} disabled={running || !canRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50">
            {running ? <><Loader2 size={12} className="animate-spin" /> Round {currentRound}</> : <><Play size={12} /> Avvia</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-1 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === t.id ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Mondo */}
      {activeTab === 'mondo' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Contesto del mondo</label>
            <textarea className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600 resize-none"
              rows={8} value={sim.world_prompt}
              onChange={e => setSim(prev => ({ ...prev, world_prompt: e.target.value }))}
              onBlur={e => patch({ world_prompt: e.target.value })}
              placeholder="Descrivi l'organizzazione, il contesto culturale, le relazioni tra i personaggi, le regole non scritte..." />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Evento scatenante</label>
            <textarea className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600 resize-none"
              rows={3} value={sim.trigger_event}
              onChange={e => setSim(prev => ({ ...prev, trigger_event: e.target.value }))}
              onBlur={e => patch({ trigger_event: e.target.value })}
              placeholder="Es: Il CEO annuncia un taglio del 20% del personale entro 30 giorni." />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Round massimi: {sim.max_rounds}</label>
            <input type="range" min={1} max={10} value={sim.max_rounds}
              onChange={e => setSim(prev => ({ ...prev, max_rounds: +e.target.value }))}
              onMouseUp={e => patch({ max_rounds: +e.target.value })}
              className="w-full accent-orange-500" />
            <div className="flex justify-between text-[10px] text-zinc-600"><span>1</span><span>10</span></div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Modello globale <span className="normal-case font-normal text-zinc-600">(sovrascrivibile per agente)</span></label>
            <select className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-xl px-4 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all"
              value={sim.model || ''} onChange={e => patch({ model: e.target.value || null })}>
              <option value="">— scegli un modello —</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Tab: Agenti */}
      {activeTab === 'agenti' && (
        <div className="space-y-3">
          {agents.map((agent, idx) => (
            <div key={agent.id} className="flex items-center gap-3 bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: agentColor(idx) }}>
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-200">{agent.name}</p>
                <p className="text-[10px] text-zinc-500">{agent.role || 'Nessun ruolo'}{agent.model ? ` · ${agent.model}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => moveAgent(idx, -1)} disabled={idx === 0} className="p-1 text-zinc-600 hover:text-zinc-400 disabled:opacity-30 transition-colors"><ChevronUp size={13} /></button>
                <button onClick={() => moveAgent(idx, 1)} disabled={idx === agents.length - 1} className="p-1 text-zinc-600 hover:text-zinc-400 disabled:opacity-30 transition-colors"><ChevronDown size={13} /></button>
                <button onClick={() => setAgentModal({ agent })} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"><Pencil size={12} /></button>
                <button onClick={() => handleDeleteAgent(agent.id)} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
          <button onClick={() => setAgentModal({})}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-700/60 rounded-xl text-zinc-600 hover:text-orange-400 hover:border-orange-500/40 text-xs font-medium transition-all">
            <Plus size={14} /> Aggiungi agente
          </button>
        </div>
      )}

      {/* Tab: Simulazione */}
      {activeTab === 'simulazione' && (
        <div className="space-y-3">
          {!canRun && !running && displayTurns.length === 0 && (
            <div className="p-8 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-2xl">
              <FlaskConical size={24} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm">Configura mondo, evento e agenti prima di avviare.</p>
            </div>
          )}
          {displayTurns.length > 0 && (
            <TurnList turns={displayTurns} agents={agents} streamingAgent={currentAgent} />
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Tab: Analisi */}
      {activeTab === 'analisi' && (
        <div className="space-y-4">
          {sim.status !== 'completed' && !analysisLoading && !streamAnalysis && (
            <div className="p-8 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-2xl">
              <Zap size={24} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm">Completa la simulazione prima di generare l'analisi.</p>
            </div>
          )}
          {(streamAnalysis || sim.analysis) && (
            <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-5">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Analisi</p>
              <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:text-zinc-200 prose-strong:text-zinc-200 prose-li:my-0 prose-code:text-orange-300 prose-code:bg-zinc-900/60 prose-code:px-1 prose-code:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamAnalysis || sim.analysis || ''}</ReactMarkdown>
                {analysisLoading && <span className="inline-block w-1.5 h-3.5 bg-orange-400 animate-pulse ml-0.5 rounded-sm" />}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {agentModal !== null && (
        <AgentModal
          agent={agentModal.agent}
          models={models}
          onSave={handleSaveAgent}
          onClose={() => setAgentModal(null)}
        />
      )}
    </div>
  );
}

function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (draft.trim() && draft !== value) onSave(draft.trim());
    setEditing(false);
  };

  if (editing) return (
    <div className="flex items-center gap-2">
      <input className="bg-transparent border-b border-orange-500 text-base font-bold text-zinc-200 outline-none w-64"
        value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus />
      <button onClick={commit} className="p-0.5 text-orange-400 hover:text-orange-300"><Check size={13} /></button>
      <button onClick={() => setEditing(false)} className="p-0.5 text-zinc-600 hover:text-zinc-400"><X size={13} /></button>
    </div>
  );

  return (
    <button onClick={() => { setDraft(value); setEditing(true); }}
      className="text-base font-bold text-zinc-200 hover:text-orange-300 transition-colors flex items-center gap-1.5">
      {value} <Pencil size={11} className="text-zinc-600" />
    </button>
  );
}

function TurnList({ turns, agents, streamingAgent }) {
  const agentColorMap = {};
  agents.forEach((a, i) => { agentColorMap[a.id] = agentColor(i); });

  const grouped = turns.reduce((acc, t) => {
    const key = t.round || t.round_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([round, roundTurns]) => (
        <div key={round}>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-zinc-700/40" />
            <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest px-2">Round {round}</span>
            <div className="h-px flex-1 bg-zinc-700/40" />
          </div>
          <div className="space-y-2">
            {roundTurns.map((turn, i) => {
              const agentId = turn.agentId || turn.agent_id;
              const color = agentColorMap[agentId] || '#8b5cf6';
              const isStreaming = streamingAgent && streamingAgent.id === agentId;
              return (
                <div key={i} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ background: color }}>
                      {(turn.agentName || turn.agent_name).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-zinc-300">{turn.agentName || turn.agent_name}</span>
                    <span className="text-[10px] text-zinc-600">{turn.role}</span>
                    {isStreaming && <span className="ml-auto text-[10px] text-orange-400 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse inline-block" /> scrive...</span>}
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none text-zinc-400 prose-p:leading-relaxed prose-p:my-1 prose-li:my-0 prose-headings:text-zinc-300 prose-strong:text-zinc-300 prose-code:text-orange-300 prose-code:bg-zinc-900/60 prose-code:px-1 prose-code:rounded prose-pre:bg-zinc-900/60 prose-pre:border prose-pre:border-zinc-700/50">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
                    {isStreaming && <span className="inline-block w-1.5 h-3.5 bg-orange-400 animate-pulse ml-0.5 rounded-sm align-middle" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Simulation List ──────────────────────────────────────────────────────────

export default function SimulationPanel() {
  const [sims, setSims] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSimId, setOpenSimId] = useState(null);

  const load = async () => {
    try {
      const [sRes, mRes] = await Promise.all([
        fetch(`${API}/simulations/`),
        fetch(`${API}/ollama/list`),
      ]);
      setSims(await sRes.json());
      const mData = await mRes.json();
      const raw = mData?.models ?? [];
      setModels(raw.map(m => (typeof m === 'string' ? m : m.name || m.model)).filter(Boolean));
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const res = await fetch(`${API}/simulations/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nuova Simulazione' }),
    });
    const sim = await res.json();
    setSims(prev => [sim, ...prev]);
    setOpenSimId(sim.id);
  };

  const handleDelete = async (sim) => {
    if (!confirm(`Eliminare "${sim.name}"?`)) return;
    await fetch(`${API}/simulations/${sim.id}`, { method: 'DELETE' });
    setSims(prev => prev.filter(s => s.id !== sim.id));
  };

  const handleDuplicate = async (sim) => {
    const res = await fetch(`${API}/simulations/${sim.id}/duplicate`, { method: 'POST' });
    const copy = await res.json();
    setSims(prev => [copy, ...prev]);
  };

  if (openSimId) return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <SimulationEditor simId={openSimId} models={models} onBack={() => { setOpenSimId(null); load(); }} />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <FlaskConical className="text-orange-500" />
            <span>Simulazioni</span>
          </h3>
          <p className="text-zinc-500 text-sm">Simula scenari multi-agente prima di prendere decisioni reali.</p>
        </div>
        <button onClick={handleCreate}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-900/30">
          <Plus size={16} /> Nuova simulazione
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="text-zinc-600 animate-spin" /></div>
      ) : sims.length === 0 ? (
        <div className="p-12 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-3xl space-y-3">
          <FlaskConical size={28} className="mx-auto text-zinc-700 mb-3" />
          <p>Nessuna simulazione ancora.</p>
          <p className="text-[11px]">Crea una simulazione, aggiungi agenti e avvia lo scenario.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sims.map(sim => (
            <div key={sim.id} className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-4 hover:border-zinc-600/60 transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                  <FlaskConical size={16} className="text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-200">{sim.name}</p>
                    <StatusBadge status={sim.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-zinc-600 flex items-center gap-1"><Users size={9} /> {sim.agent_count} agenti</span>
                    <span className="text-[10px] text-zinc-600">{sim.max_rounds} round</span>
                    <span className="text-[10px] text-zinc-700">{new Date(sim.created_at).toLocaleDateString('it-IT')}</span>
                  </div>
                  {sim.trigger_event && <p className="text-xs text-zinc-500 mt-1 truncate">{sim.trigger_event}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleDuplicate(sim)} title="Duplica"
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/50 transition-colors"><Copy size={13} /></button>
                  <button onClick={() => handleDelete(sim)} title="Elimina"
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={() => setOpenSimId(sim.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600/20 border border-orange-500/30 hover:bg-orange-600 text-orange-300 hover:text-white text-xs font-bold transition-all">
                  Apri
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
