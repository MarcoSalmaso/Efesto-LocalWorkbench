import React from 'react';
import {
  MessageSquare, Bot, BookOpen, GitBranch, FlaskConical,
  Brain, Database, Plug, Hammer, Plus, Layers,
} from 'lucide-react';

const FEATURE_CARDS = [
  { tab: 'chat',       icon: MessageSquare, label: 'Chat',           desc: 'Streaming, tool calling, agenti e artifacts', color: 'orange' },
  { tab: 'agents',     icon: Bot,           label: 'Agenti',         desc: 'Profili specializzati con tool dedicati',      color: 'blue'   },
  { tab: 'prompts',    icon: BookOpen,      label: 'Prompt Library', desc: 'Salva e riutilizza i tuoi prompt preferiti',  color: 'purple' },
  { tab: 'simulation', icon: FlaskConical,  label: 'Simulazioni',    desc: 'Scenari multi-agente per decisioni complesse', color: 'green'  },
  { tab: 'workflow',   icon: GitBranch,     label: 'Workflow',       desc: 'Editor visivo con nodi AI, Python e RAG',     color: 'cyan'   },
  { tab: 'memory',     icon: Brain,         label: 'Memoria',        desc: 'Fatti persistenti iniettati in ogni chat',    color: 'pink'   },
  { tab: 'db',         icon: Database,      label: 'RAG',            desc: 'Knowledge base locale con ricerca semantica', color: 'amber'  },
  { tab: 'mcp',        icon: Plug,          label: 'MCP',            desc: 'Connetti server MCP e aggiungi nuovi tool',   color: 'teal'   },
];

const COLOR_CLASSES = {
  orange: { card: 'from-orange-500/15 to-orange-600/5 border-orange-500/25 hover:border-orange-500/50', icon: 'text-orange-400' },
  blue:   { card: 'from-blue-500/15 to-blue-600/5 border-blue-500/25 hover:border-blue-500/50',         icon: 'text-blue-400'   },
  purple: { card: 'from-purple-500/15 to-purple-600/5 border-purple-500/25 hover:border-purple-500/50', icon: 'text-purple-400' },
  green:  { card: 'from-green-500/15 to-green-600/5 border-green-500/25 hover:border-green-500/50',     icon: 'text-green-400'  },
  cyan:   { card: 'from-cyan-500/15 to-cyan-600/5 border-cyan-500/25 hover:border-cyan-500/50',         icon: 'text-cyan-400'   },
  pink:   { card: 'from-pink-500/15 to-pink-600/5 border-pink-500/25 hover:border-pink-500/50',         icon: 'text-pink-400'   },
  amber:  { card: 'from-amber-500/15 to-amber-600/5 border-amber-500/25 hover:border-amber-500/50',     icon: 'text-amber-400'  },
  teal:   { card: 'from-teal-500/15 to-teal-600/5 border-teal-500/25 hover:border-teal-500/50',         icon: 'text-teal-400'   },
};

function StatCard({ label, value, icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-zinc-800/50 border border-zinc-700/40 rounded-2xl p-5 text-left hover:border-orange-500/30 hover:bg-zinc-800/80 transition-all group"
    >
      <div className="bg-orange-500/10 p-2 rounded-xl w-fit mb-3 group-hover:bg-orange-500/20 transition-colors">
        <Icon size={15} className="text-orange-400" />
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </button>
  );
}

function FeatureCard({ tab, icon: Icon, label, desc, color, onClick }) {
  const cls = COLOR_CLASSES[color];
  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-br ${cls.card} border rounded-xl p-4 text-left transition-all group`}
    >
      <Icon size={17} className={`${cls.icon} mb-2.5`} />
      <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{label}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
    </button>
  );
}

export default function HomePage({ sessions, agents, prompts, workflows, isBackendLive, onNavigate, onLoadSession, onNewChat, settings }) {
  const recentSessions = sessions.slice(0, 6);

  const stats = [
    { label: 'Conversazioni', value: sessions.length,  tab: 'chat',     icon: MessageSquare },
    { label: 'Agenti',        value: agents.length,    tab: 'agents',   icon: Bot           },
    { label: 'Prompt',        value: prompts.length,   tab: 'prompts',  icon: BookOpen      },
    { label: 'Workflow',      value: workflows.length, tab: 'workflow', icon: GitBranch     },
  ];

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10">

      {/* Hero */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-3 rounded-2xl shadow-lg shadow-orange-900/40">
            <Layers size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent leading-tight">
              Benvenuto, <span className="text-orange-400">{settings.user_name || 'Artigiano'}</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">Il tuo workbench AI locale — tutto gira sulla tua macchina.</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
          isBackendLive
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isBackendLive ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]' : 'bg-red-500'}`} />
          {isBackendLive ? 'Backend online' : 'Backend offline'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, tab, icon }) => (
          <StatCard key={tab} label={label} value={value} icon={icon} onClick={() => onNavigate(tab)} />
        ))}
      </div>

      {/* Features + Recenti */}
      <div className="grid grid-cols-5 gap-6">

        {/* Feature grid */}
        <div className="col-span-3 space-y-3">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Funzionalità</p>
          <div className="grid grid-cols-2 gap-3">
            {FEATURE_CARDS.map(card => (
              <FeatureCard key={card.tab} {...card} onClick={() => onNavigate(card.tab)} />
            ))}
          </div>
        </div>

        {/* Sessioni recenti */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Recenti</p>
            <button
              onClick={onNewChat}
              className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              <Plus size={11} /> Nuova chat
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-8 flex flex-col items-center justify-center">
              <MessageSquare size={22} className="text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-600">Nessuna conversazione ancora</p>
              <button
                onClick={onNewChat}
                className="mt-3 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                <Plus size={12} /> Inizia ora
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onLoadSession(s.id)}
                  className="w-full bg-zinc-800/40 border border-zinc-700/30 rounded-xl px-4 py-3 text-left hover:border-zinc-600/60 hover:bg-zinc-800/80 transition-all group"
                >
                  <p className="text-xs font-medium text-zinc-300 truncate group-hover:text-white transition-colors">
                    {s.title || 'Nuova Conversazione'}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(s.updated_at || s.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
