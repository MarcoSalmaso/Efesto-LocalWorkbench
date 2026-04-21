import React, { useRef, useCallback } from 'react';
import { X, Brain, Code, LogIn, LogOut, Braces, GitBranch, Database, StickyNote, Plus, Trash2 } from 'lucide-react';

const field = "w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-orange-500/50 transition-all";
const fieldSm = "bg-zinc-800/60 border border-zinc-600/60 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500/50 transition-all";

const NODE_LABELS = {
  input:      { icon: <LogIn     size={11} />, label: 'Input' },
  ai_prompt:  { icon: <Brain     size={11} />, label: 'AI Prompt' },
  python:     { icon: <Code      size={11} />, label: 'Python' },
  output:     { icon: <LogOut    size={11} />, label: 'Output' },
  condition:  { icon: <GitBranch size={11} />, label: 'Condition' },
  rag_search: { icon: <Database  size={11} />, label: 'RAG Search' },
  note:       { icon: <StickyNote size={11} />, label: 'Nota' },
};

const HEADER_ICONS = {
  input:      <LogIn      size={14} className="text-orange-400" />,
  ai_prompt:  <Brain      size={14} className="text-orange-400" />,
  python:     <Code       size={14} className="text-orange-400" />,
  output:     <LogOut     size={14} className="text-orange-400" />,
  condition:  <GitBranch  size={14} className="text-purple-400" />,
  rag_search: <Database   size={14} className="text-cyan-400" />,
  note:       <StickyNote size={14} className="text-amber-400" />,
};

const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "risposta": { "type": "string" }
  },
  "required": ["risposta"]
}`;

export default function ConfigPanel({ node, models, allNodes, edges, onChange, onClose }) {
  const focusedRef = useRef(null);

  const d = node?.data ?? {};
  const set = (key, val) => onChange(node.id, { ...d, [key]: val });

  const predecessors = !node ? [] : (edges || [])
    .filter(e => e.target === node.id)
    .map(e => (allNodes || []).find(n => n.id === e.source))
    .filter(Boolean);

  const insertRef = useCallback((snippet) => {
    const el = focusedRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = el.value;
    const next = current.slice(0, start) + snippet + current.slice(end);
    const key = el.dataset.fieldkey;
    if (key) set(key, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }, [node, d]);

  const trackFocus = (e) => { focusedRef.current = e.target; };

  if (!node) return null;

  const PredecessorPills = ({ fieldKey }) => {
    if (predecessors.length === 0) return null;
    return (
      <div className="space-y-1 mt-1.5">
        <p className="text-[10px] text-zinc-600">Inserisci l'output di un nodo collegato:</p>
        <div className="flex flex-wrap gap-1.5">
          {predecessors.map(pred => {
            const meta = NODE_LABELS[pred.type] || {};
            const hasFields = pred.data?.fields?.length > 0;
            return (
              <div key={pred.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const snippet = `{{${pred.id}.output}}`;
                    if (!focusedRef.current || focusedRef.current.dataset.fieldkey !== fieldKey) {
                      set(fieldKey, (d[fieldKey] || '') + snippet);
                    } else {
                      insertRef(snippet);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-700/60 border border-zinc-600/50 text-[10px] text-zinc-300 hover:bg-orange-600/15 hover:border-orange-500/30 hover:text-orange-300 transition-all"
                >
                  <Braces size={9} className="text-orange-400" />
                  {meta.icon}
                  <span className="font-medium">{pred.data?.label || meta.label}</span>
                  <span className="text-zinc-600 font-mono">.output</span>
                </button>
                {hasFields && pred.data.fields.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      const snippet = `{{${pred.id}.${f.key}}}`;
                      if (!focusedRef.current || focusedRef.current.dataset.fieldkey !== fieldKey) {
                        set(fieldKey, (d[fieldKey] || '') + snippet);
                      } else {
                        insertRef(snippet);
                      }
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-700/40 border border-zinc-600/30 text-[10px] text-zinc-400 hover:bg-orange-600/10 hover:border-orange-500/20 hover:text-orange-300 transition-all ml-3"
                  >
                    <span className="text-zinc-600">↳</span>
                    <span className="font-mono text-orange-300/70">{f.key}</span>
                    <span className="text-zinc-600">— {f.label || f.key}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 bg-[#222229] border-l border-zinc-700/50 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
        <div className="flex items-center gap-2">
          {HEADER_ICONS[node.type]}
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            {NODE_LABELS[node.type]?.label ?? node.type}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Label comune (non per note) */}
        {node.type !== 'note' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Etichetta</label>
            <input className={field} value={d.label || ''} data-fieldkey="label"
              onFocus={trackFocus}
              onChange={e => set('label', e.target.value)} placeholder="Nome del nodo..." />
          </div>
        )}

        {/* ── Input node ── */}
        {node.type === 'input' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Campi del form</label>
              <button
                onClick={() => {
                  const fields = [...(d.fields || [])];
                  fields.push({ key: `campo${fields.length + 1}`, label: '' });
                  set('fields', fields);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-700/50 border border-zinc-600/50 text-zinc-400 text-[10px] hover:bg-zinc-700 hover:text-zinc-200 transition-all"
              >
                <Plus size={10} /> Aggiungi
              </button>
            </div>
            {(!d.fields || d.fields.length === 0) ? (
              <p className="text-[11px] text-zinc-500 italic leading-relaxed">
                Nessun campo definito. Il workflow accetterà un testo libero come input.
              </p>
            ) : (
              <div className="space-y-2">
                {(d.fields || []).map((f, i) => (
                  <div key={i} className="flex gap-1.5 items-start">
                    <div className="flex-1 space-y-1">
                      <input
                        className={`${fieldSm} w-full font-mono`}
                        value={f.key}
                        placeholder="chiave"
                        onChange={e => {
                          const fields = [...d.fields];
                          fields[i] = { ...fields[i], key: e.target.value.replace(/\s/g, '_') };
                          set('fields', fields);
                        }}
                      />
                      <input
                        className={`${fieldSm} w-full`}
                        value={f.label || ''}
                        placeholder="Etichetta visibile"
                        onChange={e => {
                          const fields = [...d.fields];
                          fields[i] = { ...fields[i], label: e.target.value };
                          set('fields', fields);
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const fields = d.fields.filter((_, idx) => idx !== i);
                        set('fields', fields);
                      }}
                      className="mt-1 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600 leading-relaxed pt-1">
                  Usa <code className="text-orange-400/70">{'{{nodeId.chiave}}'}</code> per accedere ai singoli campi nei nodi successivi.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── AI Prompt node ── */}
        {node.type === 'ai_prompt' && (<>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Modello</label>
            <select className={field} value={d.model || ''} onChange={e => set('model', e.target.value)}>
              <option value="">(usa modello globale)</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System Prompt</label>
            <textarea className={`${field} resize-none`} rows={2}
              value={d.system || ''} data-fieldkey="system"
              onFocus={trackFocus}
              onChange={e => set('system', e.target.value)} placeholder="(opzionale)" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Prompt</label>
            <PredecessorPills fieldKey="prompt" />
            <textarea className={`${field} resize-none font-mono`} rows={6}
              value={d.prompt || ''} data-fieldkey="prompt"
              onFocus={trackFocus}
              onChange={e => set('prompt', e.target.value)}
              placeholder={"Usa {{node_id.output}} per\nreferenziare step precedenti"} />
          </div>
          {/* Structured output */}
          <div className="space-y-2 border-t border-zinc-700/40 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => set('structured', !d.structured)}
                className={`w-8 h-4 rounded-full transition-all cursor-pointer shrink-0 ${d.structured ? 'bg-blue-500' : 'bg-zinc-700'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-all ${d.structured ? 'ml-4.5' : 'ml-0.5'}`} style={{ marginLeft: d.structured ? '18px' : '2px' }} />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Output strutturato (JSON)</span>
            </label>
            {d.structured && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Schema JSON che l'AI deve rispettare. Lascia vuoto per JSON generico.
                </p>
                <textarea
                  className={`${field} resize-none font-mono`} rows={6}
                  value={d.schema || ''}
                  data-fieldkey="schema"
                  onFocus={trackFocus}
                  onChange={e => set('schema', e.target.value)}
                  placeholder={DEFAULT_SCHEMA}
                />
              </div>
            )}
          </div>
        </>)}

        {/* ── Python node ── */}
        {node.type === 'python' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Codice Python</label>
            <PredecessorPills fieldKey="code" />
            <textarea className={`${field} resize-none font-mono leading-relaxed`} rows={12}
              value={d.code || ''} data-fieldkey="code"
              onFocus={trackFocus}
              onChange={e => set('code', e.target.value)}
              placeholder={"# Gli output dei nodi precedenti\n# sono disponibili come variabili:\n# __node_id = \"valore\"\n\nprint(\"risultato\")"} />
          </div>
        )}

        {/* ── Output node ── */}
        {node.type === 'output' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Template</label>
            <PredecessorPills fieldKey="template" />
            <textarea className={`${field} resize-none font-mono`} rows={4}
              value={d.template || ''} data-fieldkey="template"
              onFocus={trackFocus}
              onChange={e => set('template', e.target.value)}
              placeholder={"{{node_id.output}}"} />
            <p className="text-[10px] text-zinc-600">Lascia vuoto per usare l'output dell'ultimo nodo connesso.</p>
          </div>
        )}

        {/* ── Condition node ── */}
        {node.type === 'condition' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Espressione Python</label>
              <PredecessorPills fieldKey="condition" />
              <textarea className={`${field} resize-none font-mono`} rows={4}
                value={d.condition || ''} data-fieldkey="condition"
                onFocus={trackFocus}
                onChange={e => set('condition', e.target.value)}
                placeholder={'"errore" in output.lower()'} />
            </div>
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/40 p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Variabili disponibili</p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                <code className="text-purple-300/80">output</code> — stringa dall'ultimo nodo predecessore<br />
                <code className="text-purple-300/80">{'{{nodeId.output}}'}</code> — output di un nodo specifico
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Esempi:<br />
                <code className="text-zinc-400 block mt-0.5">len(output) {'>'} 100</code>
                <code className="text-zinc-400 block">"sì" in output.lower()</code>
                <code className="text-zinc-400 block">output.strip() != ""</code>
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-green-900/20 border border-green-700/30 px-3 py-2">
                <p className="text-[9px] font-bold text-green-400 uppercase tracking-wider mb-0.5">Handle VERO</p>
                <p className="text-[10px] text-zinc-500">Connetti all'uscita sinistra</p>
              </div>
              <div className="flex-1 rounded-xl bg-red-900/20 border border-red-700/30 px-3 py-2">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-0.5">Handle FALSO</p>
                <p className="text-[10px] text-zinc-500">Connetti all'uscita destra</p>
              </div>
            </div>
          </div>
        )}

        {/* ── RAG Search node ── */}
        {node.type === 'rag_search' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Query di ricerca</label>
              <PredecessorPills fieldKey="query" />
              <textarea className={`${field} resize-none`} rows={4}
                value={d.query || ''} data-fieldkey="query"
                onFocus={trackFocus}
                onChange={e => set('query', e.target.value)}
                placeholder={"Cerca nella knowledge base...\n\nUsa {{node_id.output}} per\nuna query dinamica"} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Numero di risultati</label>
              <input
                type="number" min={1} max={20}
                className={field}
                value={d.limit || 3}
                onChange={e => set('limit', parseInt(e.target.value) || 3)}
              />
            </div>
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              L'output sarà il testo dei chunk più rilevanti concatenati, pronti da usare come contesto in un nodo AI.
            </p>
          </div>
        )}

        {/* ── Note node ── */}
        {node.type === 'note' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Titolo</label>
              <input className={field} value={d.label || ''} data-fieldkey="label"
                onFocus={trackFocus}
                onChange={e => set('label', e.target.value)} placeholder="Nota..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Testo</label>
              <textarea className={`${field} resize-none`} rows={8}
                value={d.text || ''} data-fieldkey="text"
                onFocus={trackFocus}
                onChange={e => set('text', e.target.value)}
                placeholder="Descrivi il workflow, aggiungi note o istruzioni..." />
            </div>
            <p className="text-[10px] text-zinc-600 italic">Le note non vengono eseguite e non influenzano il workflow.</p>
          </div>
        )}
      </div>
    </div>
  );
}
