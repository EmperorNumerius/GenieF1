import React from 'react';

interface LapCounterProps {
  cars: any[];
  circuitName?: string;
}

// Total lap counts for known circuits
const CIRCUIT_LAPS: Record<string, number> = {
  Suzuka: 53,
  Monaco: 78,
  Bahrain: 57,
  Jeddah: 50,
  Melbourne: 58,
  Shanghai: 56,
  Imola: 63,
  Barcelona: 66,
  'Spa-Francorchamps': 44,
  Silverstone: 52,
  Hungaroring: 70,
  Zandvoort: 72,
  Monza: 53,
  Singapore: 62,
  'Losail': 57,
  Austin: 56,
  Mexico: 71,
  'São Paulo': 71,
  'Yas Marina': 58,
  Baku: 51,
  Miami: 57,
  'Las Vegas': 50,
  Riyadh: 50,
};

function getTotalLaps(circuitName?: string): number | null {
  if (!circuitName) return null;
  for (const [key, laps] of Object.entries(CIRCUIT_LAPS)) {
    if (circuitName.toLowerCase().includes(key.toLowerCase())) return laps;
  }
  return null;
}

export function LapCounter({ cars, circuitName }: LapCounterProps) {
  if (!cars?.length) return null;

  // Leader's lap number
  const leader = cars.find((c) => c.pos === 1) ?? cars[0];
  const currentLap: number = leader?.lap_number ?? 0;
  const totalLaps = getTotalLaps(circuitName);

  const progress = totalLaps && currentLap > 0 ? Math.min(1, currentLap / totalLaps) : null;

  return (
    <div className="flex items-center gap-3 bg-black/60 border border-white/10 rounded-xl px-4 py-1.5 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500">Lap</span>
        <span className="font-mono font-black text-base text-white leading-none">
          {currentLap > 0 ? currentLap : '—'}
        </span>
        <span className="text-neutral-600 font-mono text-sm">/</span>
        <span className="font-mono font-bold text-sm text-neutral-400">
          {totalLaps ?? '—'}
        </span>
      </div>

      {progress !== null && (
        <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
