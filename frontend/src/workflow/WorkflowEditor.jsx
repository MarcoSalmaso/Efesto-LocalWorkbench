import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { Play, Square, Plus, Trash2, LogIn, Brain, Code, LogOut, Save, Loader2, Pencil, Check, X, Copy, CheckCheck, GitBranch, Database, StickyNote } from 'lucide-react';
import { InputNode, AiPromptNode, PythonNode, OutputNode, ConditionNode, RagSearchNode, NoteNode } from './nodes';
import ConfigPanel from './ConfigPanel';

const API = 'http://localhost:8006';

const NODE_TYPES = {
  input:      InputNode,
  ai_prompt:  AiPromptNode,
  python:     PythonNode,
  output:     OutputNode,
  condition:  ConditionNode,
  rag_search: RagSearchNode,
  note:       NoteNode,
};

const EDGE_STYLE = {
  style: { stroke: '#f97316', strokeWidth: 1.5, opacity: 0.6 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f97316' },
  animated: false,
};

const EDGE_STYLE_TRUE = {
  style: { stroke: '#22c55e', strokeWidth: 1.5, opacity: 0.7 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
  animated: false,
};

const EDGE_STYLE_FALSE = {
  style: { stroke: '#ef4444', strokeWidth: 1.5, opacity: 0.7 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
  animated: false,
};

let nodeIdCounter = 1;
const newId = () => `n${nodeIdCounter++}`;

const NODE_TOOLBAR = [
  { type: 'input',      icon: <LogIn      size={13} />, label: 'Input' },
  { type: 'ai_prompt',  icon: <Brain      size={13} />, label: 'AI' },
  { type: 'python',     icon: <Code       size={13} />, label: 'Python' },
  { type: 'output',     icon: <LogOut     size={13} />, label: 'Output' },
  { type: 'condition',  icon: <GitBranch  size={13} />, label: 'Condition' },
  { type: 'rag_search', icon: <Database   size={13} />, label: 'RAG' },
  { type: 'note',       icon: <StickyNote size={13} />, label: 'Nota' },
];

export default function WorkflowEditor({ workflow, models, selectedModel, onSaved, onRenamed, addToast }) {
  const definition = (() => {
    try { const d = JSON.parse(workflow.definition || '{}'); return { nodes: d.nodes || [], edges: d.edges || [] }; }
    catch { return { nodes: [], edges: [] }; }
  })();

  const [renamingWorkflow, setRenamingWorkflow] = useState(false);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const nameInputRef = useRef(null);

  const commitWorkflowRename = async () => {
    const trimmed = workflowName.trim();
    if (!trimmed) { setWorkflowName(workflow.name); setRenamingWorkflow(false); return; }
    try {
      const { data } = await axios.patch(`${API}/workflows/${workflow.id}`, { name: trimmed });
      onRenamed?.(data);
    } catch { addToast('Errore nel rinominare.', 'error'); }
    setRenamingWorkflow(false);
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(
    definition.nodes.map(n => ({ ...n, data: { ...n.data, status: 'idle' } }))
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(definition.edges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [running, setRunning] = useState(false);
  const [runInput, setRunInput] = useState('');
  const [runFormValues, setRunFormValues] = useState({});
  const [showRunInput, setShowRunInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const lastOutputRef = useRef(null);

  const copyResult = () => {
    navigator.clipboard.writeText(result || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const abortRef = useRef(null);

  const onConnect = useCallback(
    (params) => {
      let style = EDGE_STYLE;
      if (params.sourceHandle === 'true')  style = EDGE_STYLE_TRUE;
      if (params.sourceHandle === 'false') style = EDGE_STYLE_FALSE;
      setEdges(eds => addEdge({ ...params, ...style }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_, node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const addNode = (type) => {
    const positions = {
      input:      { x: 100, y: 80 },
      ai_prompt:  { x: 100, y: 220 },
      python:     { x: 400, y: 220 },
      output:     { x: 250, y: 400 },
      condition:  { x: 300, y: 220 },
      rag_search: { x: 400, y: 80 },
      note:       { x: 600, y: 80 },
    };
    const id = newId();
    setNodes(ns => [...ns, {
      id, type,
      position: positions[type] || { x: 200, y: 200 },
      data: { label: '', status: 'idle' },
    }]);
  };

  const deleteSelected = () => {
    if (!selectedNode) return;
    setNodes(ns => ns.filter(n => n.id !== selectedNode.id));
    setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: newData } : n));
    setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: newData } : prev);
  }, [setNodes]);

  const setNodeStatus = (nodeId, status, extra = {}) => {
    setNodes(ns => ns.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, status, ...extra } } : n
    ));
  };

  const resetStatuses = () => {
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, status: 'idle', result: undefined, streamBuffer: undefined } })));
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/workflows/${workflow.id}`, {
        definition: { nodes, edges },
      });
      addToast('Workflow salvato.', 'success');
      onSaved?.();
    } catch { addToast('Errore nel salvataggio.', 'error'); }
    finally { setSaving(false); }
  };

  // Nodes with form fields
  const formInputNodes = nodes.filter(n => n.type === 'input' && n.data.fields?.length > 0);
  const hasForm = formInputNodes.length > 0;

  const run = async () => {
    if (hasForm) {
      const allFilled = formInputNodes.every(n =>
        (n.data.fields || []).every(f => runFormValues[n.id]?.[f.key]?.trim())
      );
      if (!allFilled) { addToast('Compila tutti i campi del form.', 'info'); return; }
    } else {
      if (!runInput.trim()) { addToast('Inserisci un input per avviare il workflow.', 'info'); return; }
    }

    setShowRunInput(false);
    setRunning(true);
    setResult(null);
    lastOutputRef.current = null;
    resetStatuses();
    abortRef.current = new AbortController();

    const body = hasForm
      ? { input: '', input_fields: runFormValues, model: selectedModel }
      : { input: runInput, model: selectedModel };

    try {
      const resp = await fetch(`${API}/workflows/${workflow.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      const reader = resp.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.event === 'node_start') {
              setNodeStatus(ev.node_id, 'running', { streamBuffer: '' });
            } else if (ev.event === 'node_token') {
              setNodes(ns => ns.map(n =>
                n.id === ev.node_id
                  ? { ...n, data: { ...n.data, streamBuffer: (n.data.streamBuffer || '') + ev.token } }
                  : n
              ));
            } else if (ev.event === 'node_done') {
              setNodeStatus(ev.node_id, 'done', { result: ev.output, streamBuffer: undefined });
              const nodeType = nodes.find(n => n.id === ev.node_id)?.type;
              if (nodeType === 'output') lastOutputRef.current = ev.output;
            } else if (ev.event === 'node_skipped') {
              setNodeStatus(ev.node_id, 'skipped');
            } else if (ev.event === 'node_error') {
              setNodeStatus(ev.node_id, 'error');
              addToast(`Errore nel nodo: ${ev.error}`, 'error');
            }
          } catch {}
        }
      }
      if (lastOutputRef.current != null) setResult(lastOutputRef.current);
      else addToast('Workflow completato!', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') addToast('Errore durante l\'esecuzione.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/40 bg-[#1e1e26]/80 shrink-0 flex-wrap">
        {renamingWorkflow ? (
          <div className="flex items-center gap-1 mr-2">
            <input
              ref={nameInputRef}
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitWorkflowRename(); if (e.key === 'Escape') { setWorkflowName(workflow.name); setRenamingWorkflow(false); } }}
              className="bg-zinc-700/80 border border-orange-500/40 rounded-lg px-2 py-0.5 text-sm text-zinc-200 outline-none w-48"
              autoFocus
            />
            <button onClick={commitWorkflowRename} className="p-1 text-green-400 hover:text-green-300 transition-colors"><Check size={13} /></button>
            <button onClick={() => { setWorkflowName(workflow.name); setRenamingWorkflow(false); }} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"><X size={13} /></button>
          </div>
        ) : (
          <button onClick={() => { setRenamingWorkflow(true); setTimeout(() => nameInputRef.current?.select(), 0); }}
            className="flex items-center gap-1.5 mr-2 group">
            <span className="text-sm font-semibold text-zinc-300">{workflowName}</span>
            <Pencil size={11} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}

        <div className="flex items-center gap-1 bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-1 flex-wrap">
          {NODE_TOOLBAR.map(({ type, icon, label }) => (
            <button key={type} onClick={() => addNode(type)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-all">
              <Plus size={10} className="text-orange-400" />{icon}{label}
            </button>
          ))}
        </div>

        {selectedNode && (
          <button onClick={deleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-900/30 border border-red-700/40 text-red-400 text-[11px] font-medium hover:bg-red-900/50 transition-all">
            <Trash2 size={12} /> Elimina nodo
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-[11px] font-medium hover:bg-zinc-700/80 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salva
          </button>

          {running ? (
            <button onClick={() => abortRef.current?.abort()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-700/50 border border-red-600/50 text-red-300 text-[11px] font-medium hover:bg-red-700/70 transition-all">
              <Square size={12} className="fill-current" /> Stop
            </button>
          ) : (
            <button onClick={() => setShowRunInput(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-[11px] font-bold hover:from-orange-400 hover:to-orange-600 transition-all shadow-md shadow-orange-900/30">
              <Play size={12} className="fill-current" /> Esegui
            </button>
          )}
        </div>
      </div>

      {/* Result modal */}
      {result != null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#222229] border border-zinc-700/60 rounded-2xl shadow-2xl w-[580px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-700/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
                <span className="text-sm font-bold text-zinc-200">Risultato</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copyResult}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-700/50 border border-zinc-600/50 text-zinc-400 text-[11px] hover:text-zinc-200 hover:bg-zinc-700 transition-all">
                  {copied ? <><CheckCheck size={11} className="text-green-400" /> Copiato</> : <><Copy size={11} /> Copia</>}
                </button>
                <button onClick={() => setResult(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-5">
              <pre className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">{result}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Run input modal */}
      {showRunInput && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#222229] border border-zinc-700/60 rounded-2xl p-6 w-[440px] shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-zinc-200">
              {hasForm ? 'Compila i campi del workflow' : 'Input del workflow'}
            </h3>

            {hasForm ? (
              <div className="space-y-4">
                {formInputNodes.map(inputNode => (
                  <div key={inputNode.id} className="space-y-3">
                    {formInputNodes.length > 1 && (
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-700/40 pb-1">
                        {inputNode.data.label || `Nodo ${inputNode.id}`}
                      </p>
                    )}
                    {(inputNode.data.fields || []).map(f => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-[11px] font-medium text-zinc-400">
                          {f.label || f.key}
                          <span className="ml-1.5 text-zinc-600 font-mono text-[10px]">{f.key}</span>
                        </label>
                        <input
                          autoFocus={inputNode === formInputNodes[0] && f === inputNode.data.fields[0]}
                          value={runFormValues[inputNode.id]?.[f.key] || ''}
                          onChange={e => setRunFormValues(prev => ({
                            ...prev,
                            [inputNode.id]: { ...(prev[inputNode.id] || {}), [f.key]: e.target.value },
                          }))}
                          onKeyDown={e => { if (e.key === 'Enter') run(); }}
                          className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500/50"
                          placeholder={`Inserisci ${f.label || f.key}...`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                autoFocus
                value={runInput}
                onChange={e => setRunInput(e.target.value)}
                placeholder="Es: Organizza una vacanza a Lisbona per 5 giorni..."
                rows={4}
                className="w-full bg-zinc-800/60 border border-zinc-600/60 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 resize-none"
              />
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRunInput(false)}
                className="px-4 py-2 rounded-xl bg-zinc-700/50 border border-zinc-600/50 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-all">
                Annulla
              </button>
              <button onClick={run}
                className="px-4 py-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-xs font-bold hover:from-orange-400 hover:to-orange-600 transition-all">
                <Play size={11} className="inline fill-current mr-1" />Esegui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas + config panel */}
      <div className="flex flex-1 min-h-0" style={{ minHeight: 0 }}>
        <div className="flex-1 min-w-0" style={{ height: '100%' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            style={{ background: '#1c1c22' }}
            defaultEdgeOptions={EDGE_STYLE}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#3f3f46" gap={20} size={1} />
            <Controls className="!bg-zinc-800 !border-zinc-700" />
            <MiniMap nodeColor="#f97316" maskColor="rgba(28,28,34,0.8)" className="!bg-zinc-900 !border-zinc-700 !rounded-xl" />
          </ReactFlow>
        </div>
        <ConfigPanel
          node={selectedNode}
          models={models}
          allNodes={nodes}
          edges={edges}
          onChange={updateNodeData}
          onClose={() => setSelectedNode(null)}
        />
      </div>
    </div>
  );
}
