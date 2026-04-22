export const AGENT_COLORS = [
  { id: 'orange', label: 'Arancione', from: '#f97316', to: '#c2410c', shadow: 'rgba(249,115,22,0.4)' },
  { id: 'blue',   label: 'Blu',       from: '#3b82f6', to: '#1d4ed8', shadow: 'rgba(59,130,246,0.4)' },
  { id: 'green',  label: 'Verde',     from: '#22c55e', to: '#15803d', shadow: 'rgba(34,197,94,0.4)' },
  { id: 'purple', label: 'Viola',     from: '#a855f7', to: '#7e22ce', shadow: 'rgba(168,85,247,0.4)' },
  { id: 'pink',   label: 'Rosa',      from: '#ec4899', to: '#be185d', shadow: 'rgba(236,72,153,0.4)' },
  { id: 'red',    label: 'Rosso',     from: '#ef4444', to: '#b91c1c', shadow: 'rgba(239,68,68,0.4)' },
  { id: 'cyan',   label: 'Ciano',     from: '#06b6d4', to: '#0e7490', shadow: 'rgba(6,182,212,0.4)' },
  { id: 'amber',  label: 'Ambra',     from: '#f59e0b', to: '#b45309', shadow: 'rgba(245,158,11,0.4)' },
];

export const getAgentColor = (colorId) =>
  AGENT_COLORS.find(c => c.id === colorId) ?? AGENT_COLORS[0];

export const avatarGradientStyle = (colorId) => {
  const c = getAgentColor(colorId);
  return {
    background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
    boxShadow: `0 4px 14px ${c.shadow}`,
  };
};

export const bubbleStyle = (colorId) => {
  const c = getAgentColor(colorId);
  return {
    background: `linear-gradient(135deg, ${c.from}20, ${c.to}14)`,
    borderColor: `${c.from}50`,
  };
};
