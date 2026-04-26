import React, { useState, useEffect } from 'react';
import { Brain, Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';

const API = 'http://localhost:8006';

function MemoryItem({ entry, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    if (!draft.trim() || draft === entry.content) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/memory/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.trim() }),
      });
      onUpdate(await res.json());
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="group bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-3 hover:border-zinc-600/60 transition-all">
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            className="w-full bg-zinc-900/60 border border-zinc-600/60 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all resize-none"
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1 rounded-lg bg-zinc-700/50 text-zinc-400 text-xs hover:bg-zinc-700 transition-all">
              Annulla
            </button>
            <button onClick={commit} disabled={saving}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-orange-600/80 hover:bg-orange-600 text-white text-xs font-bold transition-all disabled:opacity-50">
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Salva
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-zinc-300 leading-relaxed">{entry.content}</p>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { setDraft(entry.content); setEditing(true); }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(entry.id)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-zinc-700 mt-1.5">{new Date(entry.created_at).toLocaleString('it-IT')}</p>
    </div>
  );
}

function AddMemoryForm({ onAdded, onCancel }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/memory/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      onAdded(await res.json());
      setContent('');
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl p-4 space-y-3">
      <textarea
        autoFocus
        className="w-full bg-zinc-900/60 border border-zinc-600/60 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all resize-none placeholder:text-zinc-600"
        rows={3}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Es: L'utente preferisce risposte concise. Lavora come sviluppatore backend. Il suo linguaggio principale è Python."
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-4 py-1.5 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">
          Annulla
        </button>
        <button onClick={submit} disabled={saving || !content.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Aggiungi
        </button>
      </div>
    </div>
  );
}

export default function MemoryPanel() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`${API}/memory/`);
      setMemories(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questa memoria?')) return;
    await fetch(`${API}/memory/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Brain className="text-orange-500" />
            <span>Memoria</span>
          </h3>
          <p className="text-zinc-500 text-sm">
            Fatti persistenti che Efesto ricorda sull'utente tra le sessioni.
            Il modello può aggiornare questa lista autonomamente tramite il tool <span className="font-mono text-zinc-400">manage_memory</span>.
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-900/30 shrink-0">
            <Plus size={16} /> Aggiungi
          </button>
        )}
      </div>

      {adding && (
        <AddMemoryForm
          onAdded={m => { setMemories(prev => [...prev, m]); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-zinc-600 animate-spin" />
        </div>
      ) : memories.length === 0 && !adding ? (
        <div className="p-12 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-3xl space-y-2">
          <Brain size={28} className="mx-auto text-zinc-700 mb-3" />
          <p>Nessuna memoria salvata.</p>
          <p className="text-[11px]">
            Aggiungi manualmente o chiedi al modello di ricordare qualcosa durante una chat.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map(m => (
            <MemoryItem
              key={m.id}
              entry={m}
              onUpdate={updated => setMemories(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
