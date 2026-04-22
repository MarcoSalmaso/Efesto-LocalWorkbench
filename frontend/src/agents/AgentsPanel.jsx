import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Pencil, Bot, Check, X, Loader2, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { AGENT_COLORS, getAgentColor, avatarGradientStyle } from './agentColors';

const API = 'http://localhost:8006';

const field = "w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all";
const fieldSm = "w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-orange-500/50 transition-all";

const EMPTY = {
  name: '', description: '', model: '', system_prompt: '',
  tools_enabled: '*', temperature: '', top_p: '', color: 'orange',
};

// ── Agent Form ─────────────────────────────────────────────────────────────────

function AgentForm({ initial, models, availableTools, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // tools_enabled: "*" oppure JSON array
  const allEnabled = form.tools_enabled === '*';
  const enabledList = (() => {
    if (allEnabled) return [];
    try { return JSON.parse(form.tools_enabled); } catch { return []; }
  })();

  const toggleAllTools = () => {
    set('tools_enabled', allEnabled ? JSON.stringify(availableTools.map(t => t.name)) : '*');
  };

  const toggleTool = (toolName) => {
    if (allEnabled) {
      set('tools_enabled', JSON.stringify(availableTools.map(t => t.name).filter(n => n !== toolName)));
    } else {
      const list = enabledList.includes(toolName)
        ? enabledList.filter(n => n !== toolName)
        : [...enabledList, toolName];
      set('tools_enabled', list.length === availableTools.length ? '*' : JSON.stringify(list));
    }
  };

  const isEnabled = (toolName) => allEnabled || enabledList.includes(toolName);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model.trim() || null,
        system_prompt: form.system_prompt.trim(),
        tools_enabled: form.tools_enabled,
        temperature: form.temperature !== '' ? parseFloat(form.temperature) : null,
        top_p: form.top_p !== '' ? parseFloat(form.top_p) : null,
        color: form.color,
      };
      await onSave(payload);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nome *</label>
          <input className={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="es. Assistente Codice" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Modello <span className="normal-case font-normal text-zinc-600">(lascia vuoto = globale)</span></label>
          <select className={field} value={form.model} onChange={e => set('model', e.target.value)}>
            <option value="">(usa modello globale)</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Color picker */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Colore</label>
        <div className="flex items-center gap-2 flex-wrap">
          {AGENT_COLORS.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => set('color', c.id)}
              title={c.label}
              className={`w-6 h-6 rounded-full transition-all ${form.color === c.id ? 'ring-2 ring-offset-2 ring-offset-zinc-800 ring-white scale-110' : 'hover:scale-105'}`}
              style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
            />
          ))}
          <span className="text-[10px] text-zinc-600 ml-1">{getAgentColor(form.color).label}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Descrizione</label>
        <input className={field} value={form.description} onChange={e => set('description', e.target.value)} placeholder="A cosa serve questo agente..." />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System Prompt</label>
        <textarea className={`${field} resize-none`} rows={5}
          value={form.system_prompt} onChange={e => set('system_prompt', e.target.value)}
          placeholder="Sei un assistente specializzato in..." />
      </div>

      {/* Tool selection */}
      <div className="space-y-1.5">
        <button onClick={() => setShowTools(v => !v)}
          className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors">
          <Wrench size={10} />
          Tool abilitati
          {allEnabled
            ? <span className="ml-1 text-[9px] bg-green-500/15 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full font-bold">Tutti</span>
            : <span className="ml-1 text-[9px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full font-bold">{enabledList.length} selezionati</span>
          }
          {showTools ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>

        {showTools && (
          <div className="bg-zinc-900/40 border border-zinc-700/40 rounded-xl p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allEnabled} onChange={toggleAllTools}
                className="accent-orange-500 w-3.5 h-3.5" />
              <span className="text-xs text-zinc-300 font-medium">Tutti i tool</span>
            </label>
            <div className="border-t border-zinc-700/40 pt-2 space-y-1.5">
              {availableTools.map(t => (
                <label key={t.name} className="flex items-start gap-2 cursor-pointer group">
                  <input type="checkbox" checked={isEnabled(t.name)} onChange={() => toggleTool(t.name)}
                    className="accent-orange-500 w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-mono text-zinc-300 group-hover:text-zinc-100 transition-colors">{t.name}</p>
                    {t.description && <p className="text-[10px] text-zinc-600">{t.description}</p>}
                  </div>
                </label>
              ))}
              {availableTools.length === 0 && (
                <p className="text-[10px] text-zinc-600 italic">Nessun tool disponibile al momento.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gen params */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Temperature <span className="normal-case font-normal text-zinc-600">(lascia vuoto = globale)</span>
          </label>
          <input className={fieldSm} type="number" min="0" max="2" step="0.1"
            value={form.temperature} onChange={e => set('temperature', e.target.value)} placeholder="es. 0.7" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Top-P <span className="normal-case font-normal text-zinc-600">(lascia vuoto = globale)</span>
          </label>
          <input className={fieldSm} type="number" min="0" max="1" step="0.05"
            value={form.top_p} onChange={e => set('top_p', e.target.value)} placeholder="es. 0.9" />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">Annulla</button>
        <button onClick={submit} disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-xs font-bold hover:from-orange-400 hover:to-orange-600 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salva
        </button>
      </div>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, models, availableTools, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);

  const handleSave = async (payload) => {
    await axios.patch(`${API}/agents/${agent.id}`, payload);
    onUpdated();
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminare l'agente "${agent.name}"?`)) return;
    await axios.delete(`${API}/agents/${agent.id}`);
    onDeleted();
  };

  const toolsLabel = agent.tools_enabled === '*' ? 'Tutti i tool' : (() => {
    try {
      const list = JSON.parse(agent.tools_enabled);
      return `${list.length} tool`;
    } catch { return '—'; }
  })();

  const colorDef = getAgentColor(agent.color);

  if (editing) {
    const initial = {
      ...agent,
      model: agent.model || '',
      temperature: agent.temperature != null ? String(agent.temperature) : '',
      top_p: agent.top_p != null ? String(agent.top_p) : '',
      color: agent.color || 'orange',
    };
    return <AgentForm initial={initial} models={models} availableTools={availableTools}
      onSave={handleSave} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-start justify-between p-4 bg-zinc-800/40 border border-zinc-700/60 rounded-2xl hover:bg-zinc-700/30 hover:border-zinc-600/60 transition-all group">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2.5 rounded-xl shrink-0 mt-0.5" style={avatarGradientStyle(agent.color)}>
          <Bot size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-zinc-200">{agent.name}</p>
            {agent.model && (
              <span className="text-[10px] bg-zinc-700/60 border border-zinc-600/40 text-zinc-400 px-2 py-0.5 rounded-full font-mono">{agent.model}</span>
            )}
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorDef.from }} title={colorDef.label} />
          </div>
          {agent.description && <p className="text-xs text-zinc-500 mt-0.5">{agent.description}</p>}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[10px] text-zinc-600 flex items-center gap-1"><Wrench size={9} />{toolsLabel}</span>
            {agent.temperature != null && <span className="text-[10px] text-zinc-600">temp {agent.temperature}</span>}
            {agent.top_p != null && <span className="text-[10px] text-zinc-600">top-p {agent.top_p}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
        <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export default function AgentsPanel({ models }) {
  const [agents, setAgents] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAgents = async () => {
    try { const { data } = await axios.get(`${API}/agents/`); setAgents(data); }
    catch {} finally { setLoading(false); }
  };

  const fetchTools = async () => {
    try {
      const [toolsRes, mcpRes] = await Promise.all([
        axios.get(`${API}/tools/`).catch(() => ({ data: [] })),
        axios.get(`${API}/mcp/servers`).catch(() => ({ data: [] })),
      ]);
      const native = (toolsRes.data || []).map(t => ({ name: t.name, description: t.description }));
      const mcp = (mcpRes.data || []).flatMap(s =>
        (s.tools || []).map(t => ({ name: `mcp__${s.name}__${t.name}`, description: `[MCP:${s.name}] ${t.description}` }))
      );
      setAvailableTools([...native, ...mcp]);
    } catch {}
  };

  useEffect(() => { fetchAgents(); fetchTools(); }, []);

  const handleCreate = async (payload) => {
    await axios.post(`${API}/agents/`, payload);
    fetchAgents();
    setCreating(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Bot className="text-orange-500" />
            <span>Agenti</span>
          </h3>
          <p className="text-zinc-500 text-sm">Assistenti specializzati con prompt, modello e tool dedicati.</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-orange-500 to-orange-700 hover:from-orange-400 hover:to-orange-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-900/30">
            <Plus size={16} /> Nuovo agente
          </button>
        )}
      </div>

      {creating && (
        <AgentForm initial={EMPTY} models={models} availableTools={availableTools}
          onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-zinc-600 animate-spin" />
        </div>
      ) : agents.length === 0 && !creating ? (
        <div className="p-12 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-3xl space-y-2">
          <Bot size={28} className="mx-auto text-zinc-700 mb-3" />
          <p>Nessun agente creato.</p>
          <p className="text-[11px]">Crea un agente specializzato per ogni tipo di task.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} models={models} availableTools={availableTools}
              onUpdated={fetchAgents} onDeleted={fetchAgents} />
          ))}
        </div>
      )}
    </div>
  );
}
