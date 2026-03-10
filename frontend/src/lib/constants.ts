export const TIRE_COLORS: Record<string, string> = {
  SOFT: '#ef4444',
  MEDIUM: '#eab308',
  HARD: '#f3f4f6',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
  Unknown: '#6b7280',
};

export const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  'Ferrari': '#E8002D',
  'Mercedes': '#27F4D2',
  'McLaren': '#FF8000',
  'Aston Martin': '#229971',
  'Alpine': '#FF87BC',
  'Williams': '#64C4FF',
  'RB': '#6692FF',
  'Kick Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD',
};

export function getTeamColor(car: Record<string, unknown> | null | undefined): string {
  if (!car) return '#888';
  for (const [teamName, color] of Object.entries(TEAM_COLORS)) {
    if ((car.team as string)?.includes(teamName)) return color;
  }
  return (car.color as string)?.startsWith('#') ? (car.color as string) : `#${(car.color as string) || '888'}`;
}

export function formatInterval(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '---';
  if (typeof val === 'number') return val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`;
  return String(val);
}

export function formatSectorTime(val: unknown): string {
  if (!val) return '---';
  if (typeof val === 'number') return val.toFixed(3);
  return String(val);
}
