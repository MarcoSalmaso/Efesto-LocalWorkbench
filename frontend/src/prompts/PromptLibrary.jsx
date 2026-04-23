import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Pencil, BookOpen, Check, Loader2, Tag, Search, X, ChevronDown, ChevronUp } from 'lucide-react';

const API = 'http://localhost:8006';

const field = "w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all";

const EMPTY = { title: '', content: '', tags: '' };

// ── Form ───────────────────────────────────────────────────────────────────────

function PromptForm({ initial = EMPTY, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags.trim(),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-5 space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Titolo *</label>
        <input className={field} value={form.title} onChange={e => set('title', e.target.value)} placeholder="es. Analisi critica del testo" />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Contenuto *</label>
        <textarea
          className={`${field} resize-none`} rows={7}
          value={form.content} onChange={e => set('content', e.target.value)}
          placeholder="Scrivi il prompt qui..." />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          Tag <span className="normal-case font-normal text-zinc-600">(separati da virgola)</span>
        </label>
        <input className={field} value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="es. scrittura, analisi, codice" />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">Annulla</button>
        <button onClick={submit} disabled={saving || !form.title.trim() || !form.content.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-xs font-bold hover:from-orange-400 hover:to-orange-600 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salva
        </button>
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

function PromptCard({ prompt, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const tags = prompt.tags ? prompt.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  const handleSave = async (payload) => {
    await axios.patch(`${API}/prompts/${prompt.id}`, payload);
    onUpdated();
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminare "${prompt.title}"?`)) return;
    await axios.delete(`${API}/prompts/${prompt.id}`);
    onDeleted();
  };

  if (editing) {
    return <PromptForm initial={prompt} onSave={handleSave} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl hover:border-zinc-600/60 transition-all group">
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="bg-orange-600/10 border border-orange-600/20 p-2 rounded-xl shrink-0 mt-0.5">
            <BookOpen size={14} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">{prompt.title}</p>
            {tags.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {tags.map(tag => (
                  <span key={tag} className="text-[9px] bg-zinc-700/60 border border-zinc-600/40 text-zinc-500 px-1.5 py-0.5 rounded-full font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {!expanded && (
              <p className="text-xs text-zinc-600 mt-1.5 line-clamp-2 leading-relaxed">{prompt.content}</p>
            )}
            {expanded && (
              <p className="text-xs text-zinc-400 mt-2 whitespace-pre-wrap leading-relaxed">{prompt.content}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/50 transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function PromptLibrary() {
  const [prompts, setPrompts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchPrompts = async () => {
    try { const { data } = await axios.get(`${API}/prompts/`); setPrompts(data); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchPrompts(); }, []);

  const handleCreate = async (payload) => {
    await axios.post(`${API}/prompts/`, payload);
    fetchPrompts();
    setCreating(false);
  };

  const filtered = prompts.filter(p => {
    const q = search.toLowerCase();
    return !q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.tags.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <BookOpen className="text-orange-500" />
            <span>Prompt Library</span>
          </h3>
          <p className="text-zinc-500 text-sm">Salva e riusa i prompt più utili.</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-orange-500 to-orange-700 hover:from-orange-400 hover:to-orange-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-900/30">
            <Plus size={16} /> Nuovo prompt
          </button>
        )}
      </div>

      {creating && (
        <PromptForm onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {/* Search */}
      {prompts.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-8 pr-8 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600"
            placeholder="Cerca per titolo, contenuto o tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-zinc-600 animate-spin" />
        </div>
      ) : filtered.length === 0 && !creating ? (
        <div className="p-12 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-3xl space-y-2">
          <BookOpen size={28} className="mx-auto text-zinc-700 mb-3" />
          {search ? <p>Nessun prompt trovato per "{search}".</p> : (
            <>
              <p>Nessun prompt salvato.</p>
              <p className="text-[11px]">Crea prompt riutilizzabili per velocizzare il tuo lavoro.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PromptCard key={p.id} prompt={p} onUpdated={fetchPrompts} onDeleted={fetchPrompts} />
          ))}
        </div>
      )}
    </div>
  );
}
