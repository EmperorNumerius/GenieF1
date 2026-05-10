import React from 'react';
import type { RaceState } from '../hooks/useRaceData';

interface LapCounterProps {
  raceState: RaceState | null;
}

export function LapCounter({ raceState }: LapCounterProps) {
  if (!raceState) return null;

  const currentLap = raceState.lap;
  const totalLaps = raceState.total_laps;

  const progress = totalLaps > 0 && currentLap > 0 ? Math.min(1, currentLap / totalLaps) : null;

  return (
    <div className="flex items-center gap-3 bg-black/60 border border-white/10 rounded-xl px-4 py-1.5 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500">Lap</span>
        <span className="font-mono font-black text-base text-white leading-none">
          {currentLap > 0 ? currentLap : '—'}
        </span>
        <span className="text-neutral-600 font-mono text-sm">/</span>
        <span className="font-mono font-bold text-sm text-neutral-400">
          {totalLaps > 0 ? totalLaps : '—'}
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