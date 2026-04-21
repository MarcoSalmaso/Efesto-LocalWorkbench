import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Plug, Wrench, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

const API = 'http://localhost:8006';

const field = "w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50 transition-all";

const STATUS_BADGE = {
  connected:    { label: 'Connesso',     cls: 'bg-green-500/10 border-green-500/20 text-green-400' },
  connecting:   { label: 'Connessione…', cls: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
  error:        { label: 'Errore',       cls: 'bg-red-500/10 border-red-500/20 text-red-400' },
  disconnected: { label: 'Disconnesso',  cls: 'bg-zinc-700/60 border-zinc-600/40 text-zinc-500' },
};

function StatusBadge({ status }) {
  const b = STATUS_BADGE[status] || STATUS_BADGE.disconnected;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
  );
}

function StatusIcon({ status }) {
  if (status === 'connected')  return <CheckCircle2 size={14} className="text-green-400" />;
  if (status === 'connecting') return <Loader2 size={14} className="text-orange-400 animate-spin" />;
  if (status === 'error')      return <AlertCircle size={14} className="text-red-400" />;
  return <Plug size={14} className="text-zinc-600" />;
}

// ── Add Server Form ────────────────────────────────────────────────────────────

function AddServerModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', command: '', args: '', env: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.command.trim()) { setError('Nome e comando sono obbligatori.'); return; }
    setSaving(true);
    setError('');
    try {
      const args = form.args.split('\n').map(s => s.trim()).filter(Boolean);
      const env = {};
      for (const line of form.env.split('\n')) {
        const [k, ...rest] = line.split('=');
        if (k?.trim()) env[k.trim()] = rest.join('=').trim();
      }
      await axios.post(`${API}/mcp/servers`, {
        name: form.name.trim(),
        command: form.command.trim(),
        args,
        env,
        enabled: true,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || 'Errore durante il salvataggio.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#222229] border border-zinc-700/60 rounded-2xl shadow-2xl w-[500px] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700/40">
          <span className="text-sm font-bold text-zinc-200">Aggiungi server MCP</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nome</label>
            <input className={field} value={form.name} onChange={e => set('name', e.target.value)} placeholder="es. filesystem" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Comando</label>
            <input className={field} value={form.command} onChange={e => set('command', e.target.value)} placeholder="es. npx" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Argomenti <span className="normal-case font-normal">(uno per riga)</span></label>
            <textarea className={`${field} resize-none font-mono text-xs`} rows={3}
              value={form.args} onChange={e => set('args', e.target.value)}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/Users/me/Desktop"} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Variabili d'ambiente <span className="normal-case font-normal">(KEY=value, una per riga)</span></label>
            <textarea className={`${field} resize-none font-mono text-xs`} rows={2}
              value={form.env} onChange={e => set('env', e.target.value)}
              placeholder={"API_KEY=abc123\nDEBUG=false"} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">Annulla</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-xs font-bold hover:from-orange-400 hover:to-orange-600 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Server Card ────────────────────────────────────────────────────────────────

function ServerCard({ server, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggle = async () => {
    const newEnabled = !server.config.enabled;
    await axios.patch(`${API}/mcp/servers/${server.name}`, { enabled: newEnabled });
    onRefresh();
  };

  const restart = async () => {
    setRestarting(true);
    try {
      await axios.post(`${API}/mcp/servers/${server.name}/restart`);
      setTimeout(onRefresh, 1500);
    } finally { setRestarting(false); }
  };

  const remove = async () => {
    if (!confirm(`Eliminare il server "${server.name}"?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/mcp/servers/${server.name}`);
      onRefresh();
    } finally { setDeleting(false); }
  };

  const enabled = server.config.enabled !== false;

  return (
    <div className={`bg-zinc-800/40 border rounded-2xl transition-all ${server.status === 'error' ? 'border-red-500/20' : 'border-zinc-700/60'}`}>
      <div className="flex items-center gap-3 p-4">
        <StatusIcon status={server.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-200">{server.name}</span>
            <StatusBadge status={server.status} />
          </div>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
            {server.config.command} {server.config.args?.join(' ')}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={toggle} title={enabled ? 'Disabilita' : 'Abilita'}
            className={`p-1.5 rounded-lg transition-colors ${enabled ? 'text-orange-400 hover:bg-orange-500/10' : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-700/40'}`}>
            {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
          <button onClick={restart} disabled={restarting} title="Riavvia"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={restarting ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setExpanded(e => !e)} title="Espandi"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40 transition-colors">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button onClick={remove} disabled={deleting} title="Elimina"
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-40">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {server.status === 'error' && server.error && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-red-400 font-mono bg-red-900/10 border border-red-500/15 rounded-lg px-3 py-2">{server.error}</p>
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-700/40 pt-3 space-y-3">
          {server.tools.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Wrench size={9} /> {server.tools.length} Tool disponibili
              </p>
              <div className="space-y-1.5">
                {server.tools.map(t => (
                  <div key={t.name} className="flex items-start gap-2 px-3 py-2 bg-zinc-700/30 rounded-xl">
                    <Wrench size={10} className="text-orange-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono font-semibold text-zinc-300">{t.name}</p>
                      {t.description && <p className="text-[10px] text-zinc-500 leading-snug mt-0.5">{t.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600 italic">
              {server.status === 'connected' ? 'Nessun tool esposto da questo server.' : 'Connetti il server per vedere i tool.'}
            </p>
          )}

          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Config JSON</p>
            <pre className="text-[10px] text-zinc-400 font-mono bg-zinc-900/60 border border-zinc-700/40 rounded-xl px-3 py-2 overflow-x-auto">
              {JSON.stringify(server.config, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export default function McpPanel() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchServers = async () => {
    try {
      const { data } = await axios.get(`${API}/mcp/servers`);
      setServers(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 3000);
    return () => clearInterval(interval);
  }, []);

  const totalConnected = servers.filter(s => s.status === 'connected').length;
  const totalTools = servers.reduce((acc, s) => acc + (s.tools?.length ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Plug className="text-orange-500" />
            <span>MCP Servers</span>
          </h3>
          <p className="text-zinc-500 text-sm">Model Context Protocol — connetti tool e dati ai tuoi modelli.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-gradient-to-br from-orange-500 to-orange-700 hover:from-orange-400 hover:to-orange-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-900/30">
          <Plus size={16} /> Aggiungi server
        </button>
      </div>

      {servers.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl text-[11px]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_#4ade80]" />
            <span className="text-zinc-400">{totalConnected}/{servers.length} server connessi</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl text-[11px]">
            <Wrench size={11} className="text-orange-400" />
            <span className="text-zinc-400">{totalTools} tool disponibili</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-zinc-600 animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <div className="p-12 text-center text-zinc-600 italic bg-zinc-800/40 border border-zinc-700/60 rounded-3xl space-y-2">
          <Plug size={28} className="mx-auto text-zinc-700 mb-3" />
          <p>Nessun server MCP configurato.</p>
          <p className="text-[11px]">Aggiungi un server per estendere le capacità dei tuoi modelli.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map(s => (
            <ServerCard key={s.name} server={s} onRefresh={fetchServers} />
          ))}
        </div>
      )}

      {showAdd && <AddServerModal onClose={() => setShowAdd(false)} onAdded={fetchServers} />}
    </div>
  );
}
