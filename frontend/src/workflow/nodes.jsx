import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { LogIn, Brain, Code, LogOut, GitBranch, Database, StickyNote } from 'lucide-react';

const baseCard = 'rounded-2xl border shadow-lg min-w-[220px] max-w-[280px] text-zinc-100 text-xs';

const statusRing = (status) => {
  if (status === 'running') return 'ring-2 ring-orange-500/70 shadow-orange-900/30';
  if (status === 'done')    return 'ring-2 ring-green-500/50';
  if (status === 'error')   return 'ring-2 ring-red-500/50';
  if (status === 'skipped') return 'ring-2 ring-zinc-600/40 opacity-50';
  return '';
};

// ── Input ────────────────────────────────────────────────────────────────────
export function InputNode({ data, selected }) {
  const hasFields = data.fields && data.fields.length > 0;
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <LogIn size={13} className="text-orange-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">Input</span>
        {hasFields && <span className="ml-auto text-[9px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-md font-bold">FORM</span>}
      </div>
      <div className="px-4 py-3">
        {hasFields ? (
          <div className="space-y-1">
            {data.fields.map(f => (
              <div key={f.key} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-orange-400/60 shrink-0" />
                <span className="text-zinc-400 text-[10px] font-mono">{f.key}</span>
                {f.label && f.label !== f.key && <span className="text-zinc-600 text-[10px]">— {f.label}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-300 text-[11px] leading-snug">{data.label || 'Testo di partenza del workflow'}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
    </div>
  );
}

// ── AI Prompt ────────────────────────────────────────────────────────────────
export function AiPromptNode({ data, selected }) {
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <Brain size={13} className="text-orange-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">AI Prompt</span>
        {data.structured && <span className="ml-auto text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-md font-bold">JSON</span>}
      </div>
      <div className="px-4 py-3 space-y-1">
        <p className="text-zinc-400 text-[10px] uppercase tracking-wider font-bold">Prompt</p>
        <p className="text-zinc-300 text-[11px] leading-snug line-clamp-3 whitespace-pre-wrap">
          {data.prompt || <span className="italic text-zinc-600">Nessun prompt</span>}
        </p>
        {data.status === 'running' && data.streamBuffer && (
          <p className="text-orange-300 text-[10px] font-mono leading-snug line-clamp-2 mt-1 border-t border-zinc-700/40 pt-1">
            {data.streamBuffer}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
    </div>
  );
}

// ── Python ───────────────────────────────────────────────────────────────────
export function PythonNode({ data, selected }) {
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <Code size={13} className="text-orange-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">Python</span>
      </div>
      <div className="px-4 py-3">
        <pre className="text-zinc-300 text-[10px] font-mono leading-snug line-clamp-4 whitespace-pre-wrap">
          {data.code || <span className="italic text-zinc-600 not-italic font-sans">Nessun codice</span>}
        </pre>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
    </div>
  );
}

// ── Output ───────────────────────────────────────────────────────────────────
export function OutputNode({ data, selected }) {
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <LogOut size={13} className="text-orange-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">Output</span>
      </div>
      <div className="px-4 py-3">
        {data.result
          ? (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_#4ade80] shrink-0" />
              <p className="text-green-300 text-[11px] font-medium">Output pronto</p>
            </div>
          )
          : <p className="text-zinc-600 text-[11px] italic">Risultato finale del workflow</p>
        }
      </div>
    </div>
  );
}

// ── Condition ────────────────────────────────────────────────────────────────
export function ConditionNode({ data, selected }) {
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <GitBranch size={13} className="text-purple-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">Condition</span>
        {data.status === 'done' && (
          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-md font-bold ${data.result === 'true' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
            {data.result === 'true' ? 'VERO' : 'FALSO'}
          </span>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-zinc-400 text-[10px] uppercase tracking-wider font-bold mb-1">Condizione</p>
        <code className="text-purple-200 text-[10px] font-mono leading-snug line-clamp-2 block">
          {data.condition || <span className="italic text-zinc-600 font-sans">Nessuna condizione</span>}
        </code>
      </div>
      <div className="flex justify-between px-5 pb-2.5 pt-0">
        <span className="text-[9px] text-green-400 font-bold">VERO</span>
        <span className="text-[9px] text-red-400 font-bold">FALSO</span>
      </div>
      <Handle type="source" id="true" position={Position.Bottom} style={{ left: '28%' }}
        className="!bg-green-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <Handle type="source" id="false" position={Position.Bottom} style={{ left: '72%' }}
        className="!bg-red-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
    </div>
  );
}

// ── RAG Search ───────────────────────────────────────────────────────────────
export function RagSearchNode({ data, selected }) {
  return (
    <div className={`${baseCard} bg-zinc-800/80 border-zinc-700/60 ${statusRing(data.status)} ${selected ? 'ring-2 ring-orange-500/40' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/50 bg-zinc-700/30 rounded-t-2xl">
        <Database size={13} className="text-cyan-400" />
        <span className="font-bold text-[11px] uppercase tracking-widest text-zinc-400">RAG Search</span>
        {data.limit && <span className="ml-auto text-[9px] text-zinc-500 font-mono">×{data.limit}</span>}
      </div>
      <div className="px-4 py-3 space-y-1">
        <p className="text-zinc-400 text-[10px] uppercase tracking-wider font-bold">Query</p>
        <p className="text-zinc-300 text-[11px] leading-snug line-clamp-2 whitespace-pre-wrap">
          {data.query || <span className="italic text-zinc-600">Nessuna query</span>}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500 !w-2.5 !h-2.5 !border-2 !border-zinc-900" />
    </div>
  );
}

// ── Note ─────────────────────────────────────────────────────────────────────
export function NoteNode({ data, selected }) {
  return (
    <div className={`rounded-2xl border shadow-lg min-w-[200px] max-w-[300px] text-xs bg-amber-950/40 border-amber-700/40 ${selected ? 'ring-2 ring-amber-500/40' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-700/30 rounded-t-2xl">
        <StickyNote size={12} className="text-amber-400" />
        <span className="font-bold text-[10px] uppercase tracking-widest text-amber-600/80">
          {data.label || 'Nota'}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-amber-200/70 text-[11px] leading-relaxed whitespace-pre-wrap">
          {data.text || <span className="italic text-amber-600/40">Scrivi una nota...</span>}
        </p>
      </div>
    </div>
  );
}
